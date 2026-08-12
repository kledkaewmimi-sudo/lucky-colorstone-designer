-- Privacy-safe anonymous visitor tracking migration.
-- Run manually in the production Supabase SQL Editor before deploying client/server
-- code that writes analytics_sessions.visitor_id. This preserves every historical
-- session; existing rows intentionally remain NULL and must not be backfilled.

begin;

alter table public.analytics_sessions
  add column if not exists visitor_id text;

create index if not exists idx_analytics_sessions_visitor_id_started_at
  on public.analytics_sessions (visitor_id, started_at desc)
  where visitor_id is not null;

comment on column public.analytics_sessions.visitor_id is
  'Anonymous first-party browser/profile identifier. Random client-generated value; never derived from PII, IP, or fingerprinting. Historical rows remain NULL.';

commit;
