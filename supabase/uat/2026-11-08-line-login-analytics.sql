-- UAT-only analytics schema for the LINE login optimization experiment.
-- Never run this against the Production Supabase project.
begin;

create table if not exists public.uat_analytics_journeys (
  journey_id text primary key check (journey_id ~ '^[A-Za-z0-9_-]{8,128}$'),
  entry_surface text not null default 'direct' check (entry_surface in ('direct', 'liff_url', 'line_client', 'unknown')),
  entry_context text,
  platform text,
  browser_family text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  handoff_created_at timestamptz,
  handoff_consumed_at timestamptz,
  restored_step int,
  state_restored boolean not null default false,
  step_2_reached boolean not null default false
);

create table if not exists public.uat_analytics_events (
  event_id uuid primary key,
  journey_id text not null references public.uat_analytics_journeys(journey_id) on delete cascade,
  event_name text not null check (event_name ~ '^[a-z0-9_]{3,80}$'),
  stage_key text not null default '',
  step int,
  client_ts timestamptz,
  server_ts timestamptz not null default now(),
  properties jsonb not null default '{}'::jsonb,
  unique (journey_id, event_name, stage_key)
);

create index if not exists idx_uat_analytics_events_journey
  on public.uat_analytics_events (journey_id, server_ts);
create index if not exists idx_uat_analytics_events_name
  on public.uat_analytics_events (event_name, server_ts desc);
create index if not exists idx_uat_analytics_journeys_last_seen
  on public.uat_analytics_journeys (last_seen_at desc);

alter table public.uat_analytics_journeys enable row level security;
alter table public.uat_analytics_events enable row level security;
revoke all on table public.uat_analytics_journeys, public.uat_analytics_events
  from public, anon, authenticated;
grant select, insert, update on table public.uat_analytics_journeys, public.uat_analytics_events
  to service_role;

-- Bounded retention: call manually or from the UAT backend's maintenance path.
create or replace function public.cleanup_uat_analytics(p_retention_days int default 30)
returns table(deleted_events bigint, deleted_journeys bigint)
language plpgsql security definer set search_path = public as $$
declare
  cutoff timestamptz;
  events_deleted bigint;
  journeys_deleted bigint;
begin
  if p_retention_days < 1 or p_retention_days > 365 then
    raise exception 'retention days out of range';
  end if;
  cutoff := now() - make_interval(days => p_retention_days);
  delete from public.uat_analytics_events where server_ts < cutoff;
  get diagnostics events_deleted = row_count;
  delete from public.uat_analytics_journeys j
   where j.last_seen_at < cutoff
     and not exists (select 1 from public.uat_analytics_events e where e.journey_id = j.journey_id);
  get diagnostics journeys_deleted = row_count;
  return query select events_deleted, journeys_deleted;
end;
$$;

revoke all on function public.cleanup_uat_analytics(int) from public, anon, authenticated;
grant execute on function public.cleanup_uat_analytics(int) to service_role;

-- Bounded cleanup for expired one-time login handoffs as well.
create or replace function public.cleanup_uat_line_auth_handoffs(p_retention_hours int default 24)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  deleted bigint;
begin
  if p_retention_hours < 1 or p_retention_hours > 720 then
    raise exception 'retention hours out of range';
  end if;
  delete from public.line_auth_handoffs
   where expires_at < now() - make_interval(hours => p_retention_hours);
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

revoke all on function public.cleanup_uat_line_auth_handoffs(int) from public, anon, authenticated;
grant execute on function public.cleanup_uat_line_auth_handoffs(int) to service_role;

commit;
