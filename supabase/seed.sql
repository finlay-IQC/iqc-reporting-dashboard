-- Demo data so the dashboard has something to show before real syncs run.
-- Everything here hangs off one client flagged is_demo = true. Remove it with:
--   delete from public.clients where is_demo;
--
-- Shape mirrors a franchise brand: one shared ad account with a campaign per
-- partner, plus separate recruitment and national accounts.

-- Safe to re-run: clears any previous demo data first (cascades to everything under it).
delete from public.clients where slug = 'demo-franchise';

select setseed(0.42);

with c as (
  insert into public.clients (name, slug, crm_provider, crm_account_id, is_demo)
  values ('Demo Franchise Co', 'demo-franchise', 'ghl', 'demo-location', true)
  returning id
),
seg as (
  insert into public.segments (client_id, name, kind, is_default)
  select c.id, s.name, s.kind::public.segment_kind, s.is_default
  from c, (values
    ('Partner — Manchester', 'franchise', false),
    ('Partner — Leeds', 'franchise', false),
    ('Partner — Bristol', 'franchise', false),
    ('Franchise recruitment', 'recruitment', false),
    ('National brand', 'national', false),
    ('Unassigned', 'other', true)
  ) as s(name, kind, is_default)
  returning id, name
),
acc as (
  insert into public.meta_ad_accounts (id, client_id, name, currency, timezone, default_segment_id)
  select a.id, c.id, a.name, 'GBP', 'Europe/London',
    (select seg.id from seg where seg.name = a.default_segment)
  from c, (values
    ('act_demo_partners', 'Demo — Partners (shared)', null),
    ('act_demo_recruitment', 'Demo — Recruitment', 'Franchise recruitment'),
    ('act_demo_national', 'Demo — National', 'National brand')
  ) as a(id, name, default_segment)
  returning id
),
rules as (
  insert into public.segment_rules (segment_id, ad_account_id, match_type, pattern)
  select seg.id, 'act_demo_partners', 'campaign_name_contains', r.pattern
  from seg join (values
    ('Partner — Manchester', '| Manchester |'),
    ('Partner — Leeds', '| Leeds |'),
    ('Partner — Bristol', '| Bristol |')
  ) as r(segment, pattern) on r.segment = seg.name
  where exists (select 1 from acc)
  returning id
)
insert into public.stage_mappings (client_id, stage_name, lifecycle)
select c.id, m.stage, m.lifecycle::public.lead_lifecycle
from c, (values
  ('New Lead', 'new'), ('Contacted', 'contacted'), ('Qualified', 'qualified'),
  ('Appointment Booked', 'booked'), ('Showed', 'showed'), ('Won', 'won'),
  ('Lost', 'lost'), ('Not Qualified', 'unqualified')
) as m(stage, lifecycle)
where exists (select 1 from rules);

insert into public.meta_campaigns (id, ad_account_id, name, objective, status) values
  ('900000000000001', 'act_demo_partners', 'DEMO | Manchester | Leads | Lead form', 'OUTCOME_LEADS', 'ACTIVE'),
  ('900000000000002', 'act_demo_partners', 'DEMO | Leeds | Leads | Landing page', 'OUTCOME_LEADS', 'ACTIVE'),
  ('900000000000003', 'act_demo_partners', 'DEMO | Bristol | Leads | Lead form', 'OUTCOME_LEADS', 'ACTIVE'),
  ('900000000000004', 'act_demo_recruitment', 'DEMO | Recruitment | Franchise enquiries', 'OUTCOME_LEADS', 'ACTIVE'),
  ('900000000000005', 'act_demo_national', 'DEMO | National | Awareness', 'OUTCOME_AWARENESS', 'ACTIVE'),
  ('900000000000006', 'act_demo_national', 'DEMO | National | Leads', 'OUTCOME_LEADS', 'ACTIVE');

insert into public.meta_adsets (id, campaign_id, ad_account_id, name, status)
select c.id || '1', c.id, c.ad_account_id, 'Broad — 25-65', 'ACTIVE' from public.meta_campaigns c
where c.ad_account_id like 'act_demo_%';

insert into public.meta_ads (id, adset_id, campaign_id, ad_account_id, name, status)
select s.id || v.n, s.id, s.campaign_id, s.ad_account_id, v.name, 'ACTIVE'
from public.meta_adsets s, (values ('1', 'Video — founder story'), ('2', 'Static — offer'), ('3', 'Carousel — results')) as v(n, name)
where s.ad_account_id like 'act_demo_%';

-- 90 days of insights
insert into public.meta_insights_daily (ad_id, date, ad_account_id, campaign_id, adset_id, spend, impressions, reach, clicks, link_clicks, leads)
select
  a.id, d::date, a.ad_account_id, a.campaign_id, a.adset_id,
  round((8 + random() * 22)::numeric, 2),
  imp, (imp * 0.7)::bigint, (imp * (0.012 + random() * 0.01))::bigint, (imp * (0.008 + random() * 0.008))::bigint,
  case when c.objective = 'OUTCOME_LEADS' then floor(random() * 3)::int else 0 end
from public.meta_ads a
join public.meta_campaigns c on c.id = a.campaign_id
cross join generate_series(current_date - 89, current_date - 1, interval '1 day') d
cross join lateral (select (1500 + random() * 3500)::bigint as imp) i
where a.ad_account_id like 'act_demo_%';

-- CRM leads: most attributed via Meta IDs or UTMs, some unattributed
insert into public.leads (
  client_id, crm_provider, crm_id, first_name, last_name, email, phone, source, channel,
  utm_source, utm_medium, utm_campaign, utm_content, meta_campaign_id, meta_ad_id,
  pipeline_name, stage_name, lifecycle_hint, value, crm_created_at
)
select
  cl.id, 'ghl', 'demo-' || g, fn, ln,
  lower(fn) || '.' || lower(ln) || g || '@example.com', '+44 7700 900' || lpad((g % 1000)::text, 3, '0'),
  case when via = 'form' then 'Facebook Lead Form' when via = 'lp' then 'Landing Page' else 'Organic' end,
  case when via = 'form' then 'meta_form' when via = 'lp' then 'meta_landing_page' else 'organic' end,
  case when via = 'lp' then 'facebook' end,
  case when via = 'lp' then 'paid_social' end,
  case when via = 'lp' then camp.id end,
  case when via = 'lp' then camp.ad_id end,
  case when via = 'form' then camp.id end,
  case when via = 'form' then camp.ad_id end,
  'Sales Pipeline', stage,
  null,
  case when stage = 'Won' then round((1500 + random() * 6000)::numeric, 0) end,
  (current_date - (random() * 89)::int)::timestamp + (random() * interval '14 hours') + interval '8 hours'
from generate_series(1, 420) g
cross join (select id from public.clients where slug = 'demo-franchise') cl
cross join lateral (
  select c.id, (select a.id from public.meta_ads a where a.campaign_id = c.id order by random() limit 1) as ad_id
  from public.meta_campaigns c
  where c.ad_account_id like 'act_demo_%' and c.objective = 'OUTCOME_LEADS' and g > 0
  order by random() limit 1
) camp
cross join lateral (
  select
    (array['Amelia','Oliver','Isla','George','Ava','Noah','Mia','Arthur','Freya','Leo','Grace','Harry'])[1 + floor(random() * 12)::int] as fn,
    (array['Smith','Jones','Taylor','Brown','Williams','Wilson','Evans','Thomas','Roberts','Walker'])[1 + floor(random() * 10)::int] as ln,
    case when r < 0.55 then 'form' when r < 0.88 then 'lp' else 'organic' end as via,
    case
      when s < 0.30 then 'New Lead' when s < 0.50 then 'Contacted' when s < 0.62 then 'Qualified'
      when s < 0.76 then 'Appointment Booked' when s < 0.84 then 'Showed' when s < 0.90 then 'Won'
      when s < 0.96 then 'Lost' else 'Not Qualified'
    end as stage
  from (select random() as r, random() as s where g > 0) x
) p;

insert into public.sync_runs (source, client_id, status, finished_at, stats)
select 'demo-seed', id, 'success', now(), '{"note": "demo data"}'::jsonb from public.clients where slug = 'demo-franchise';
