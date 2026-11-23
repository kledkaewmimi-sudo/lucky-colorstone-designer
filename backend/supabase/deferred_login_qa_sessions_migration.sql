-- Manual Phase 3B.5 migration. Do not execute automatically.
create table if not exists public.deferred_login_qa_sessions (
  token text primary key check (token ~ '^[A-Za-z0-9_-]{43}$'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_deferred_login_qa_sessions_expiry
  on public.deferred_login_qa_sessions (expires_at);

alter table public.deferred_login_qa_sessions enable row level security;
revoke all on table public.deferred_login_qa_sessions from anon, authenticated;

-- Trusted server-side cleanup only, after a safety buffer:
-- delete from public.deferred_login_qa_sessions
-- where expires_at < now() - interval '24 hours';
