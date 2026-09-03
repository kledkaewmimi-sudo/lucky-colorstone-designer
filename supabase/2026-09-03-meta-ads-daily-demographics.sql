-- Additive daily-grain demographics dataset. Do not execute without owner approval.

create table if not exists public.meta_ads_daily_demographics (
  id uuid primary key default gen_random_uuid(),
  insight_key text not null unique,
  account_id text not null,
  report_date date not null,
  account_timezone text not null,
  campaign_id text, campaign_name text, adset_id text, adset_name text, ad_id text, ad_name text,
  age text not null default 'unknown', gender text not null default 'unknown',
  spend numeric(18,6), impressions bigint, reach bigint, clicks bigint, link_clicks bigint,
  unique_clicks bigint, ctr numeric(18,8), unique_ctr numeric(18,8), cpc numeric(18,8), cpm numeric(18,8), frequency numeric(18,8),
  raw_insight jsonb not null,
  api_version text not null, fetched_at timestamptz not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create index if not exists idx_meta_ads_daily_demographics_ad_date on public.meta_ads_daily_demographics (ad_id, report_date);
create index if not exists idx_meta_ads_daily_demographics_dimensions on public.meta_ads_daily_demographics (age, gender);
create index if not exists idx_meta_ads_daily_demographics_raw_gin on public.meta_ads_daily_demographics using gin (raw_insight);
alter table public.meta_ads_daily_demographics enable row level security;
grant usage on schema public to service_role;
grant select, insert, update on table public.meta_ads_daily_demographics to service_role;
