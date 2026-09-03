-- Additive replacement baseline for Meta total ad/hour performance.
-- Do not execute without explicit owner approval. The old placement-grain
-- meta_ads_hourly_insights table is deliberately left unchanged.

create table if not exists public.meta_ads_hourly_performance_insights (
  id uuid primary key default gen_random_uuid(),
  insight_key text not null unique,
  account_id text not null,
  report_date date not null,
  hour_start time not null,
  account_timezone text not null,
  hour_start_utc timestamptz,
  utc_conversion_status text not null default 'unavailable'
    check (utc_conversion_status in ('exact', 'ambiguous', 'invalid_timezone', 'unavailable')),
  campaign_id text, campaign_name text, adset_id text, adset_name text, ad_id text, ad_name text,
  spend numeric(18,6), impressions bigint, reach bigint, clicks bigint, link_clicks bigint,
  unique_clicks bigint, ctr numeric(18,8), unique_ctr numeric(18,8), cpc numeric(18,8), cpm numeric(18,8), frequency numeric(18,8),
  raw_outbound_clicks jsonb, raw_outbound_clicks_ctr jsonb, raw_actions jsonb, raw_action_values jsonb, raw_cost_per_action_type jsonb,
  raw_insight jsonb not null, api_version text not null, fetched_at timestamptz not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (hour_start >= time '00:00:00' and hour_start < time '24:00:00')
);

create index if not exists idx_meta_ads_hourly_performance_account_hour on public.meta_ads_hourly_performance_insights (account_id, report_date, hour_start);
create index if not exists idx_meta_ads_hourly_performance_ad_hour on public.meta_ads_hourly_performance_insights (ad_id, report_date, hour_start);
create index if not exists idx_meta_ads_hourly_performance_raw_gin on public.meta_ads_hourly_performance_insights using gin (raw_insight);
alter table public.meta_ads_hourly_performance_insights enable row level security;
grant usage on schema public to service_role;
grant select, insert, update on table public.meta_ads_hourly_performance_insights to service_role;
