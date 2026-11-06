-- Live data connections.
--
-- crm_connections holds each client's CRM credentials (e.g. a GHL Private
-- Integration token), encrypted by the app before it is stored. RLS is on with
-- no policies, so only the server's secret key can read or write it — signed-in
-- users never see tokens, even encrypted.

create table public.crm_connections (
  client_id uuid primary key references public.clients (id) on delete cascade,
  provider public.crm_provider not null,
  account_id text not null,                 -- GHL location ID / Zoho org ID
  token_ciphertext text not null,           -- AES-256-GCM, see src/lib/crypto.ts
  token_hint text,                          -- last 4 characters, for the UI
  status text not null default 'untested' check (status in ('untested', 'ok', 'error')),
  last_error text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, account_id)
);
alter table public.crm_connections enable row level security;
revoke all on public.crm_connections from anon, authenticated;
grant all on public.crm_connections to service_role;

-- Bulk-apply CRM pipeline stages to existing leads (a lead created months ago
-- can be won today). Called by the sync with the secret key only.
create function public.apply_lead_stages(p_client_id uuid, p_rows jsonb)
returns int
language sql
set search_path = ''
as $$
  with r as (
    select *
    from jsonb_to_recordset(p_rows) as x(
      crm_id text,
      pipeline_name text,
      stage_name text,
      lifecycle_hint public.lead_lifecycle,
      value numeric
    )
  ),
  u as (
    update public.leads l
    set pipeline_name = r.pipeline_name,
        stage_name = r.stage_name,
        lifecycle_hint = r.lifecycle_hint,
        value = r.value,
        synced_at = now()
    from r
    where l.client_id = p_client_id
      and l.crm_id = r.crm_id
      and (l.pipeline_name, l.stage_name, l.lifecycle_hint, l.value)
          is distinct from (r.pipeline_name, r.stage_name, r.lifecycle_hint, r.value)
    returning 1
  )
  select count(*)::int from u;
$$;
revoke execute on function public.apply_lead_stages(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.apply_lead_stages(uuid, jsonb) to service_role;
