-- Dedicated UAT Supabase project only. Do not run in production.
-- This schema is compatible with the UAT backend's existing JSONB catalog mapping.

begin;

create table if not exists public.catalog_stones (
  id text primary key, payload jsonb not null, category_id text,
  display_order int default 0, in_stock boolean default true, is_active boolean default true,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.catalog_charms (
  id text primary key, payload jsonb not null, category_id text,
  display_order int default 0, in_stock boolean default true, is_active boolean default true,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.catalog_spacers (
  id text primary key, payload jsonb not null,
  display_order int default 0, in_stock boolean default true, is_active boolean default true,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.app_settings (
  key text primary key, value jsonb not null,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.catalog_categories (
  id text primary key, entity_type text not null, slug text, name_en text, name_th text,
  display_order int default 0, is_active boolean default true, payload jsonb not null,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.catalog_layout_order (
  key text primary key default 'default', value jsonb not null,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists public.line_auth_handoffs (
  token text primary key check (token ~ '^[A-Za-z0-9_-]{43}$'),
  payload jsonb not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_uat_line_auth_handoffs_expiry on public.line_auth_handoffs (expires_at);

alter table public.catalog_stones enable row level security;
alter table public.catalog_charms enable row level security;
alter table public.catalog_spacers enable row level security;
alter table public.app_settings enable row level security;
alter table public.catalog_categories enable row level security;
alter table public.catalog_layout_order enable row level security;
alter table public.line_auth_handoffs enable row level security;
revoke all on all tables in schema public from anon, authenticated;

-- Read does not consume. Payload is available only to the UAT backend's service role.
create or replace function public.read_uat_line_auth_handoff(p_token text)
returns table(payload jsonb)
language sql security definer set search_path = public as $$
  select h.payload from public.line_auth_handoffs h
  where h.token = p_token and h.consumed_at is null and h.expires_at > now();
$$;

-- Consume acknowledgement is retry-safe: it never returns a payload.
create or replace function public.consume_uat_line_auth_handoff(p_token text)
returns table(consumed boolean, already_consumed boolean)
language plpgsql security definer set search_path = public as $$
begin
  update public.line_auth_handoffs
     set consumed_at = now()
   where token = p_token and consumed_at is null and expires_at > now();
  if found then return query select true, false; return; end if;
  if exists (select 1 from public.line_auth_handoffs where token = p_token and consumed_at is not null) then
    return query select false, true;
  end if;
end;
$$;

revoke all on function public.read_uat_line_auth_handoff(text) from public, anon, authenticated;
revoke all on function public.consume_uat_line_auth_handoff(text) from public, anon, authenticated;
grant execute on function public.read_uat_line_auth_handoff(text) to service_role;
grant execute on function public.consume_uat_line_auth_handoff(text) to service_role;

commit;

-- Seed after schema creation using the UAT backend's existing JSON fixtures only.
-- Use an owner-reviewed script/API import; never point an import at production.
