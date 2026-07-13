-- Lucky Colorstone Supabase schema
-- JSONB-first tables preserve the current app payload shapes while allowing
-- selected fields to be indexed for common CRM/customer queries.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.catalog_stones (
  id text primary key,
  payload jsonb not null,
  category_id text,
  display_order int default 0,
  in_stock boolean default true,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.catalog_charms (
  id text primary key,
  payload jsonb not null,
  category_id text,
  display_order int default 0,
  in_stock boolean default true,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.catalog_spacers (
  id text primary key,
  payload jsonb not null,
  display_order int default 0,
  in_stock boolean default true,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.catalog_categories (
  id text primary key,
  entity_type text not null,
  slug text,
  name_en text,
  name_th text,
  display_order int default 0,
  is_active boolean default true,
  payload jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.catalog_layout_order (
  key text primary key default 'default',
  value jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.orders (
  id text primary key,
  status text,
  customer_name text,
  line_user_id text,
  stripe_checkout_session_id text unique,
  stripe_payment_status text,
  net_price numeric,
  final_price numeric,
  total_price numeric,
  payload jsonb not null,
  date timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Catalog lookup and ordering indexes.
create index if not exists idx_catalog_stones_category_order
  on public.catalog_stones (category_id, display_order);
create index if not exists idx_catalog_stones_active_stock
  on public.catalog_stones (is_active, in_stock);
create index if not exists idx_catalog_stones_payload_gin
  on public.catalog_stones using gin (payload);

create index if not exists idx_catalog_charms_category_order
  on public.catalog_charms (category_id, display_order);
create index if not exists idx_catalog_charms_active_stock
  on public.catalog_charms (is_active, in_stock);
create index if not exists idx_catalog_charms_payload_gin
  on public.catalog_charms using gin (payload);

create index if not exists idx_catalog_spacers_order
  on public.catalog_spacers (display_order);
create index if not exists idx_catalog_spacers_active_stock
  on public.catalog_spacers (is_active, in_stock);
create index if not exists idx_catalog_spacers_payload_gin
  on public.catalog_spacers using gin (payload);

create index if not exists idx_catalog_categories_type_order
  on public.catalog_categories (entity_type, display_order);
create index if not exists idx_catalog_categories_active
  on public.catalog_categories (is_active);
create index if not exists idx_catalog_categories_payload_gin
  on public.catalog_categories using gin (payload);

-- Order lookup indexes for CRM, Stripe idempotency, LINE user lookup, and recent orders.
create index if not exists idx_orders_status_date
  on public.orders (status, date desc);
create index if not exists idx_orders_line_user_id
  on public.orders (line_user_id);
create index if not exists idx_orders_created_at
  on public.orders (created_at desc);
create index if not exists idx_orders_payload_gin
  on public.orders using gin (payload);

-- Settings tables are small, but payload/value GIN indexes help future JSON filters.
create index if not exists idx_app_settings_value_gin
  on public.app_settings using gin (value);
create index if not exists idx_catalog_layout_order_value_gin
  on public.catalog_layout_order using gin (value);

-- Keep updated_at current on every mutation.
drop trigger if exists set_catalog_stones_updated_at on public.catalog_stones;
create trigger set_catalog_stones_updated_at
before update on public.catalog_stones
for each row execute function public.set_updated_at();

drop trigger if exists set_catalog_charms_updated_at on public.catalog_charms;
create trigger set_catalog_charms_updated_at
before update on public.catalog_charms
for each row execute function public.set_updated_at();

drop trigger if exists set_catalog_spacers_updated_at on public.catalog_spacers;
create trigger set_catalog_spacers_updated_at
before update on public.catalog_spacers
for each row execute function public.set_updated_at();

drop trigger if exists set_catalog_categories_updated_at on public.catalog_categories;
create trigger set_catalog_categories_updated_at
before update on public.catalog_categories
for each row execute function public.set_updated_at();

drop trigger if exists set_app_settings_updated_at on public.app_settings;
create trigger set_app_settings_updated_at
before update on public.app_settings
for each row execute function public.set_updated_at();

drop trigger if exists set_catalog_layout_order_updated_at on public.catalog_layout_order;
create trigger set_catalog_layout_order_updated_at
before update on public.catalog_layout_order
for each row execute function public.set_updated_at();

drop trigger if exists set_orders_updated_at on public.orders;
create trigger set_orders_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

-- Enable RLS now. Do not add public policies yet: the backend should access
-- these tables with the Supabase service_role key in a trusted server runtime.
alter table public.catalog_stones enable row level security;
alter table public.catalog_charms enable row level security;
alter table public.catalog_spacers enable row level security;
alter table public.catalog_categories enable row level security;
alter table public.app_settings enable row level security;
alter table public.catalog_layout_order enable row level security;
alter table public.orders enable row level security;

comment on table public.catalog_stones is 'Stone catalog records. payload preserves the current JSON shape used by the customer app and CRM.';
comment on table public.catalog_charms is 'Charm catalog records. payload preserves business fields and render tuning for later backend migration.';
comment on table public.catalog_spacers is 'Spacer catalog records prepared for future CRM-backed spacer management.';
comment on table public.catalog_categories is 'Managed catalog category records for stones, charms, and future catalog entity types.';
comment on table public.app_settings is 'Application settings stored as JSONB key/value records.';
comment on table public.catalog_layout_order is 'Catalog layout ordering for CRM/customer display surfaces.';
comment on table public.orders is 'Customer order records. payload preserves the full current order object for compatibility.';

comment on column public.orders.stripe_checkout_session_id is 'Unique Stripe Checkout session id used for idempotent order creation.';
comment on column public.orders.payload is 'Full order payload from the existing JSON-backed API contract.';
