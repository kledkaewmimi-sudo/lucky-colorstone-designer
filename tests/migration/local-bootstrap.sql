-- Local-only migration validation bootstrap. No Production/UAT connection.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END
$$;

create table if not exists public.line_auth_handoffs (
  token text primary key check (token ~ '^[A-Za-z0-9_-]{43}$'),
  payload jsonb not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_line_auth_handoffs_expiry
  on public.line_auth_handoffs (expires_at);

alter table public.line_auth_handoffs enable row level security;
revoke all on table public.line_auth_handoffs from anon, authenticated;

create or replace function public.consume_line_auth_handoff(p_token text)
returns table(payload jsonb)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.line_auth_handoffs
     set consumed_at = now()
   where token = p_token
     and consumed_at is null
     and expires_at > now()
  returning line_auth_handoffs.payload;
end;
$$;

revoke all on function public.consume_line_auth_handoff(text) from public, anon, authenticated;
grant execute on function public.consume_line_auth_handoff(text) to service_role;
