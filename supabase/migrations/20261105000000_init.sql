-- IQC Reporting Dashboard — initial schema
--
-- Model:
--   client ──< segment            (a franchise partner, recruitment, national…)
--   client ──< meta_ad_account ──< meta_campaign ──< meta_adset ──< meta_ad
--   meta_insights_daily           (one row per ad per day)
--   client ──< lead               (CRM-agnostic: GHL now, Zoho later)
--
-- Campaign → segment is resolved in SQL (campaign_segments view) from, in order:
--   1. a manual override on the campaign
--   2. the first matching segment_rule (by priority)
--   3. the ad account's default segment
--   4. the client's default segment
-- Leads inherit the segment of the campaign they're attributed to.

-- ─── Types ──────────────────────────────────────────────────────────────────

create type public.crm_provider as enum ('ghl', 'zoho');
create type public.segment_kind as enum ('franchise', 'recruitment', 'national', 'brand', 'other');
create type public.app_role as enum ('admin', 'viewer');
create type public.segment_match_type as enum ('campaign_name_contains', 'campaign_name_prefix', 'campaign_id');
-- Ordered funnel. 'lost' and 'unqualified' sit outside the funnel.
create type public.lead_lifecycle as enum (
  'new', 'contacted', 'qualified', 'booked', 'showed', 'won', 'lost', 'unqualified'
);

-- ─── Access control ─────────────────────────────────────────────────────────

-- Only people listed here can see anything. Add head-office users manually.
create table public.app_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'viewer',
  display_name text,
  created_at timestamptz not null default now()
);

create function public.is_app_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_users where user_id = auth.uid());
$$;

create function public.is_app_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_users where user_id = auth.uid() and role = 'admin');
$$;

-- ─── Clients & segments ─────────────────────────────────────────────────────

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  crm_provider public.crm_provider,
  crm_account_id text,               -- GHL location ID / Zoho org ID
  currency text not null default 'GBP',
  timezone text not null default 'Europe/London',
  is_active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.segments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  name text not null,
  kind public.segment_kind not null default 'other',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (client_id, name)
);
create unique index segments_one_default_per_client on public.segments (client_id) where is_default;

-- ─── Meta ───────────────────────────────────────────────────────────────────

create table public.meta_ad_accounts (
  id text primary key check (id ~ '^act_'),       -- e.g. act_1234567890
  client_id uuid not null references public.clients (id) on delete cascade,
  name text,
  currency text,
  timezone text,
  default_segment_id uuid references public.segments (id) on delete set null,
  is_active boolean not null default true,
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.meta_ad_accounts (client_id);

create table public.segment_rules (
  id uuid primary key default gen_random_uuid(),
  segment_id uuid not null references public.segments (id) on delete cascade,
  ad_account_id text references public.meta_ad_accounts (id) on delete cascade, -- null = any of the client's accounts
  match_type public.segment_match_type not null,
  pattern text not null check (length(trim(pattern)) > 0),
  priority int not null default 100,                  -- lower wins
  created_at timestamptz not null default now()
);
create index on public.segment_rules (segment_id);

create table public.meta_campaigns (
  id text primary key,
  ad_account_id text not null references public.meta_ad_accounts (id) on delete cascade,
  name text not null,
  objective text,
  status text,
  segment_override_id uuid references public.segments (id) on delete set null,
  created_time timestamptz,
  updated_at timestamptz not null default now()
);
create index on public.meta_campaigns (ad_account_id);

create table public.meta_adsets (
  id text primary key,
  campaign_id text not null references public.meta_campaigns (id) on delete cascade,
  ad_account_id text not null references public.meta_ad_accounts (id) on delete cascade,
  name text not null,
  status text,
  updated_at timestamptz not null default now()
);
create index on public.meta_adsets (campaign_id);

create table public.meta_ads (
  id text primary key,
  adset_id text references public.meta_adsets (id) on delete cascade,
  campaign_id text not null references public.meta_campaigns (id) on delete cascade,
  ad_account_id text not null references public.meta_ad_accounts (id) on delete cascade,
  name text not null,
  status text,
  thumbnail_url text,
  updated_at timestamptz not null default now()
);
create index on public.meta_ads (campaign_id);

-- Ad-level daily insights. Campaign / adset IDs are denormalised for fast rollups.
create table public.meta_insights_daily (
  ad_id text not null,
  date date not null,
  ad_account_id text not null references public.meta_ad_accounts (id) on delete cascade,
  campaign_id text not null,
  adset_id text,
  spend numeric(12, 2) not null default 0,
  impressions bigint not null default 0,
  reach bigint not null default 0,
  clicks bigint not null default 0,
  link_clicks bigint not null default 0,
  leads int not null default 0,            -- lead actions as reported by Meta
  updated_at timestamptz not null default now(),
  primary key (ad_id, date)
);
create index on public.meta_insights_daily (campaign_id, date);
create index on public.meta_insights_daily (ad_account_id, date);

-- ─── CRM ────────────────────────────────────────────────────────────────────

-- Maps each CRM's own stage names onto one standard funnel, so GHL and Zoho
-- report the same way. Matching is case-insensitive; pipeline_name null = any.
create table public.stage_mappings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  pipeline_name text,
  stage_name text not null,
  lifecycle public.lead_lifecycle not null,
  created_at timestamptz not null default now()
);
create unique index stage_mappings_unique
  on public.stage_mappings (client_id, lower(coalesce(pipeline_name, '')), lower(stage_name));

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  crm_provider public.crm_provider not null,
  crm_id text not null,
  first_name text,
  last_name text,
  email text,
  phone text,
  source text,                          -- the CRM's own source label
  channel text,                         -- meta_form | meta_landing_page | other_paid | organic | unknown
  landing_page_url text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  fbclid text,
  meta_campaign_id text,
  meta_adset_id text,
  meta_ad_id text,
  meta_form_id text,
  meta_lead_id text,
  segment_override_id uuid references public.segments (id) on delete set null,
  pipeline_name text,
  stage_name text,
  lifecycle_hint public.lead_lifecycle, -- set by the adapter when the CRM is explicit (e.g. won/lost status)
  value numeric(12, 2),
  crm_created_at timestamptz not null,
  crm_updated_at timestamptz,
  raw jsonb,
  synced_at timestamptz not null default now(),
  unique (client_id, crm_provider, crm_id)
);
create index on public.leads (client_id, crm_created_at desc);
create index on public.leads (meta_campaign_id);
create index on public.leads (meta_ad_id);

-- ─── Sync bookkeeping ───────────────────────────────────────────────────────

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,                 -- 'meta' | 'ghl' | 'zoho'
  client_id uuid references public.clients (id) on delete cascade,
  status text not null default 'running' check (status in ('running', 'success', 'error')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  stats jsonb,
  error text
);
create index on public.sync_runs (started_at desc);

-- ─── Reporting views ────────────────────────────────────────────────────────
-- security_invoker = true so the underlying tables' RLS applies to the caller.

create view public.campaign_segments with (security_invoker = true) as
select
  c.id as campaign_id,
  c.name as campaign_name,
  c.ad_account_id,
  a.client_id,
  coalesce(c.segment_override_id, r.segment_id, a.default_segment_id, d.id) as segment_id,
  case
    when c.segment_override_id is not null then 'override'
    when r.segment_id is not null then 'rule'
    when a.default_segment_id is not null then 'account_default'
    when d.id is not null then 'client_default'
    else 'unassigned'
  end as segment_source
from public.meta_campaigns c
join public.meta_ad_accounts a on a.id = c.ad_account_id
left join lateral (
  select sr.segment_id
  from public.segment_rules sr
  join public.segments s on s.id = sr.segment_id
  where s.client_id = a.client_id
    and (sr.ad_account_id is null or sr.ad_account_id = c.ad_account_id)
    and case sr.match_type
      when 'campaign_id' then c.id = trim(sr.pattern)
      when 'campaign_name_prefix' then lower(left(c.name, length(sr.pattern))) = lower(sr.pattern)
      when 'campaign_name_contains' then strpos(lower(c.name), lower(sr.pattern)) > 0
    end
  order by sr.priority, sr.created_at
  limit 1
) r on true
left join public.segments d on d.client_id = a.client_id and d.is_default;

-- Leads with their resolved campaign, segment and funnel stage.
create view public.lead_attribution with (security_invoker = true) as
select
  l.id,
  l.client_id,
  l.crm_provider,
  l.crm_id,
  l.first_name,
  l.last_name,
  l.email,
  l.phone,
  l.source,
  l.channel,
  l.utm_source,
  l.utm_medium,
  l.utm_campaign,
  l.utm_content,
  l.pipeline_name,
  l.stage_name,
  l.value,
  l.crm_created_at,
  l.crm_updated_at,
  m.campaign_id as attributed_campaign_id,
  m.campaign_name as attributed_campaign_name,
  coalesce(l.meta_ad_id, case when l.utm_content ~ '^\d{6,}$' then l.utm_content end) as attributed_ad_id,
  ad.name as attributed_ad_name,
  coalesce(m.method, 'none') as attribution_method,
  coalesce(l.segment_override_id, m.segment_id, d.id) as segment_id,
  coalesce(sm.lifecycle, l.lifecycle_hint, 'new') as lifecycle
from public.leads l
left join lateral (
  select x.campaign_id, x.campaign_name, x.segment_id, x.method
  from (
    -- 1. Explicit Meta IDs from the CRM (lead forms, or UTMs carrying IDs)
    select cs.campaign_id, cs.campaign_name, cs.segment_id, 'meta_ids'::text as method, 1 as rank
    from public.campaign_segments cs
    where cs.client_id = l.client_id
      and cs.campaign_id = coalesce(
        l.meta_campaign_id,
        (select ma.campaign_id from public.meta_ads ma where ma.id = l.meta_ad_id),
        (select mas.campaign_id from public.meta_adsets mas where mas.id = l.meta_adset_id)
      )
    union all
    -- 2. utm_campaign holding a campaign ID or the exact campaign name
    select cs.campaign_id, cs.campaign_name, cs.segment_id, 'utm_campaign', 2
    from public.campaign_segments cs
    where cs.client_id = l.client_id
      and l.utm_campaign is not null
      and (cs.campaign_id = l.utm_campaign or lower(cs.campaign_name) = lower(l.utm_campaign))
  ) x
  order by x.rank
  limit 1
) m on true
left join public.meta_ads ad
  on ad.id = coalesce(l.meta_ad_id, case when l.utm_content ~ '^\d{6,}$' then l.utm_content end)
left join public.segments d on d.client_id = l.client_id and d.is_default
left join lateral (
  select s.lifecycle
  from public.stage_mappings s
  where s.client_id = l.client_id
    and lower(s.stage_name) = lower(l.stage_name)
    and (s.pipeline_name is null or lower(s.pipeline_name) = lower(l.pipeline_name))
  order by (s.pipeline_name is null)      -- pipeline-specific mapping wins
  limit 1
) sm on true;

-- One row per client × segment × day, combining Meta delivery and CRM outcomes.
-- Dates are in Europe/London (Meta insights are already in the ad account's timezone).
create view public.segment_daily with (security_invoker = true) as
with spend as (
  select
    i.date,
    cs.client_id,
    cs.segment_id,
    sum(i.spend) as spend,
    sum(i.impressions) as impressions,
    sum(i.clicks) as clicks,
    sum(i.link_clicks) as link_clicks,
    sum(i.leads) as meta_leads
  from public.meta_insights_daily i
  join public.campaign_segments cs on cs.campaign_id = i.campaign_id
  group by 1, 2, 3
),
crm as (
  select
    (la.crm_created_at at time zone 'Europe/London')::date as date,
    la.client_id,
    la.segment_id,
    count(*) as crm_leads,
    count(*) filter (where la.attribution_method <> 'none') as attributed_leads,
    count(*) filter (where la.lifecycle in ('booked', 'showed', 'won')) as booked,
    count(*) filter (where la.lifecycle = 'won') as won,
    coalesce(sum(la.value) filter (where la.lifecycle = 'won'), 0) as won_value
  from public.lead_attribution la
  group by 1, 2, 3
)
select
  coalesce(s.date, c.date) as date,
  coalesce(s.client_id, c.client_id) as client_id,
  coalesce(s.segment_id, c.segment_id) as segment_id,
  coalesce(s.spend, 0) as spend,
  coalesce(s.impressions, 0) as impressions,
  coalesce(s.clicks, 0) as clicks,
  coalesce(s.link_clicks, 0) as link_clicks,
  coalesce(s.meta_leads, 0) as meta_leads,
  coalesce(c.crm_leads, 0) as crm_leads,
  coalesce(c.attributed_leads, 0) as attributed_leads,
  coalesce(c.booked, 0) as booked,
  coalesce(c.won, 0) as won,
  coalesce(c.won_value, 0) as won_value
from spend s
full join crm c
  on c.date = s.date
  and c.client_id = s.client_id
  and coalesce(c.segment_id, '00000000-0000-0000-0000-000000000000'::uuid)
    = coalesce(s.segment_id, '00000000-0000-0000-0000-000000000000'::uuid);

-- ─── Row-level security ─────────────────────────────────────────────────────
-- Read: any listed app user. Write config: admins. Sync jobs use the secret key,
-- which bypasses RLS.

do $$
declare t text;
begin
  foreach t in array array[
    'clients', 'segments', 'meta_ad_accounts', 'segment_rules', 'meta_campaigns',
    'meta_adsets', 'meta_ads', 'meta_insights_daily', 'stage_mappings', 'leads', 'sync_runs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "app users can read" on public.%I for select to authenticated using (public.is_app_user())', t);
  end loop;

  foreach t in array array['clients', 'segments', 'meta_ad_accounts', 'segment_rules', 'stage_mappings'] loop
    execute format('create policy "admins can write" on public.%I for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin())', t);
  end loop;
end $$;

-- Campaign and lead segment overrides are set from the admin UI.
create policy "admins can override campaign segment" on public.meta_campaigns
  for update to authenticated using (public.is_app_admin()) with check (public.is_app_admin());
create policy "admins can override lead segment" on public.leads
  for update to authenticated using (public.is_app_admin()) with check (public.is_app_admin());

alter table public.app_users enable row level security;
create policy "users can read own row" on public.app_users
  for select to authenticated using (user_id = auth.uid() or public.is_app_admin());

revoke all on all tables in schema public from anon;
