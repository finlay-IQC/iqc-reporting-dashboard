\pset footer off
\echo '— campaign → segment resolution'
select campaign_name, s.name as segment, segment_source
from campaign_segments cs left join segments s on s.id = cs.segment_id order by campaign_name;

\echo '— lead attribution mix'
select attribution_method, count(*) from lead_attribution group by 1 order by 1;

\echo '— last 30 days by segment'
select s.name as segment, sum(spend) as spend, sum(crm_leads) as leads,
  round(sum(spend) / nullif(sum(crm_leads), 0), 2) as cpl, sum(booked) as booked, sum(won) as won
from segment_daily d left join segments s on s.id = d.segment_id
where date >= current_date - 30 group by 1 order by 1;

-- Hard assertions
do $$
begin
  if exists (select 1 from campaign_segments where segment_source = 'unassigned') then
    raise exception 'some demo campaigns resolved to no segment';
  end if;
  if (select count(*) from campaign_segments cs join segments s on s.id = cs.segment_id
      where s.name = 'Partner — Leeds') <> 1 then
    raise exception 'Leeds rule did not match exactly one campaign';
  end if;
  if (select count(*) from lead_attribution) <> (select count(*) from leads) then
    raise exception 'lead_attribution fans out rows';
  end if;
  if (select sum(crm_leads) from segment_daily) <> (select count(*) from leads) then
    raise exception 'segment_daily lead total does not match leads table';
  end if;
  if abs((select sum(spend) from segment_daily) - (select sum(spend) from meta_insights_daily)) > 0.01 then
    raise exception 'segment_daily spend does not match insights';
  end if;
end $$;

\echo '— RLS: a signed-in user NOT in app_users sees nothing'
insert into auth.users values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');
insert into app_users (user_id, role) values ('22222222-2222-2222-2222-222222222222', 'viewer');
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
do $$ begin
  if (select count(*) from leads) <> 0 or (select count(*) from segment_daily) <> 0 then
    raise exception 'RLS leak: non-app user can read data';
  end if;
end $$;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
do $$ begin
  if (select count(*) from leads) = 0 then raise exception 'app user cannot read leads'; end if;
  begin
    update clients set name = 'x';
    if found then raise exception 'viewer was able to update clients'; end if;
  end;
end $$;
reset role;

\echo '— crm_connections and apply_lead_stages are service-only'
insert into crm_connections (client_id, provider, account_id, token_ciphertext)
select id, 'ghl', 'LOC-TEST', 'v1:x:y:z' from clients where slug = 'demo-franchise';
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
do $$ begin
  begin
    perform count(*) from crm_connections;
    raise exception 'authenticated user could read crm_connections';
  exception when insufficient_privilege then null;
  end;
  begin
    perform apply_lead_stages(gen_random_uuid(), '[]'::jsonb);
    raise exception 'authenticated user could call apply_lead_stages';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

\echo '— apply_lead_stages updates only changed leads'
do $$
declare c uuid; n int;
begin
  select id into c from clients where slug = 'demo-franchise';
  n := apply_lead_stages(c, '[{"crm_id":"demo-1","pipeline_name":"Sales Pipeline","stage_name":"Won","lifecycle_hint":"won","value":1234}]');
  if n <> 1 then raise exception 'expected 1 update, got %', n; end if;
  n := apply_lead_stages(c, '[{"crm_id":"demo-1","pipeline_name":"Sales Pipeline","stage_name":"Won","lifecycle_hint":"won","value":1234}]');
  if n <> 0 then raise exception 'expected no-op on repeat, got %', n; end if;
  if (select lifecycle from lead_attribution where crm_id = 'demo-1') <> 'won' then raise exception 'stage not applied'; end if;
end $$;
