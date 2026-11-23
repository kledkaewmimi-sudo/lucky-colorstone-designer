-- Production LINE auth-entry session storage.
-- DRAFT ONLY. Do not execute against Production or UAT without separate owner approval.
-- Additive migration: does not alter line_auth_handoffs or any existing table.
--
-- Rollback (after the candidate is removed):
--   drop function if exists public.cleanup_line_auth_entry_sessions(int);
--   drop function if exists public.consume_production_line_auth_entry_session(text, text, text);
--   drop function if exists public.consume_line_auth_entry_session(text, text, text);
--   drop function if exists public.create_production_line_auth_entry_session(text, text, text, text, int);
--   drop function if exists public.create_line_auth_entry_session(text, text, text, text, int);
--   drop table if exists public.line_auth_entry_sessions;

begin;

create table if not exists public.line_auth_entry_sessions (
  session_id text primary key check (session_id ~ '^[A-Za-z0-9_-]{43}$'),
  browser_id text not null check (browser_id ~ '^[A-Za-z0-9_-]{43}$'),
  tab_session_id text not null check (tab_session_id ~ '^[A-Za-z0-9_-]{43}$'),
  handoff_token text not null check (handoff_token ~ '^[A-Za-z0-9_-]{43}$'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

-- One pending session per browser tab prevents two designs from sharing a tab.
create unique index if not exists idx_line_auth_entry_one_pending_per_tab
  on public.line_auth_entry_sessions (browser_id, tab_session_id)
  where consumed_at is null;

create index if not exists idx_line_auth_entry_expiry
  on public.line_auth_entry_sessions (expires_at);

create index if not exists idx_line_auth_entry_browser_pending
  on public.line_auth_entry_sessions (browser_id, created_at desc)
  where consumed_at is null;

alter table public.line_auth_entry_sessions enable row level security;

-- Only the service role may use this table. No customer or anon policy exists.
revoke all on table public.line_auth_entry_sessions from public, anon, authenticated;
grant select, insert, update, delete on table public.line_auth_entry_sessions to service_role;

create or replace function public.create_line_auth_entry_session(
  p_session_id text,
  p_browser_id text,
  p_tab_session_id text,
  p_handoff_token text,
  p_ttl_seconds int default 600
)
returns table(session_id text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expires_at timestamptz;
begin
  if p_ttl_seconds is null or p_ttl_seconds < 60 or p_ttl_seconds > 1200 then
    raise exception 'invalid session ttl';
  end if;

  -- Never extend a session beyond the bound one-time handoff.
  select least(now() + make_interval(secs => p_ttl_seconds), h.expires_at)
    into v_expires_at
    from public.line_auth_handoffs h
   where h.token = p_handoff_token
     and h.consumed_at is null
     and h.expires_at > now();

  if v_expires_at is null then
    return;
  end if;

  insert into public.line_auth_entry_sessions (
    session_id, browser_id, tab_session_id, handoff_token, expires_at
  ) values (
    p_session_id, p_browser_id, p_tab_session_id, p_handoff_token, v_expires_at
  )
  on conflict do nothing;

  return query
    select s.session_id, s.expires_at
      from public.line_auth_entry_sessions s
     where s.session_id = p_session_id
       and s.browser_id = p_browser_id
       and s.tab_session_id = p_tab_session_id
       and s.handoff_token = p_handoff_token
       and s.consumed_at is null
       and s.expires_at > now();
exception
  when unique_violation then
    return;
end;
$$;

-- The session and bound handoff are consumed in one transaction. If the handoff
-- cannot be consumed, the exception rolls back the session update.
create or replace function public.consume_line_auth_entry_session(
  p_session_id text,
  p_browser_id text,
  p_tab_session_id text
)
returns table(payload jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_handoff_token text;
  v_payload jsonb;
begin
  update public.line_auth_entry_sessions
     set consumed_at = now()
   where session_id = p_session_id
     and browser_id = p_browser_id
     and tab_session_id = p_tab_session_id
     and consumed_at is null
     and expires_at > now()
  returning handoff_token into v_handoff_token;

  if v_handoff_token is null then
    return;
  end if;

  update public.line_auth_handoffs
     set consumed_at = now()
   where token = v_handoff_token
     and consumed_at is null
     and expires_at > now()
  returning public.line_auth_handoffs.payload into v_payload;

  if v_payload is null then
    raise exception 'bound handoff unavailable';
  end if;

  return query select v_payload;
end;
$$;

create or replace function public.cleanup_line_auth_entry_sessions(p_retention_hours int default 24)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted bigint;
begin
  if p_retention_hours is null or p_retention_hours < 1 or p_retention_hours > 720 then
    raise exception 'retention hours out of range';
  end if;
  delete from public.line_auth_entry_sessions
   where expires_at < now() - make_interval(hours => p_retention_hours);
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

revoke all on function public.create_line_auth_entry_session(text, text, text, text, int) from public, anon, authenticated;
-- Compatibility names used by the candidate auth-entry service. Keep the
-- existing base names above for local migration validation and add explicit
-- production-prefixed RPC wrappers so the browser service and SQL agree.
create or replace function public.create_production_line_auth_entry_session(
  p_session_id text,
  p_browser_id text,
  p_tab_session_id text,
  p_handoff_token text,
  p_ttl_seconds int default 600
)
returns table(session_id text, expires_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select * from public.create_line_auth_entry_session($1, $2, $3, $4, $5);
$$;

create or replace function public.consume_production_line_auth_entry_session(
  p_session_id text,
  p_browser_id text,
  p_tab_session_id text
)
returns table(payload jsonb)
language sql
security definer
set search_path = public
as $$
  select * from public.consume_line_auth_entry_session($1, $2, $3);
$$;

revoke all on function public.create_production_line_auth_entry_session(text, text, text, text, int) from public, anon, authenticated;
revoke all on function public.consume_production_line_auth_entry_session(text, text, text) from public, anon, authenticated;
grant execute on function public.create_production_line_auth_entry_session(text, text, text, text, int) to service_role;
grant execute on function public.consume_production_line_auth_entry_session(text, text, text) to service_role;

revoke all on function public.consume_line_auth_entry_session(text, text, text) from public, anon, authenticated;
revoke all on function public.cleanup_line_auth_entry_sessions(int) from public, anon, authenticated;

grant execute on function public.create_line_auth_entry_session(text, text, text, text, int) to service_role;
grant execute on function public.consume_line_auth_entry_session(text, text, text) to service_role;
grant execute on function public.cleanup_line_auth_entry_sessions(int) to service_role;

commit;
