-- Isolated Meta Ads ingestion schema.
-- Deliberately creates new tables only; do not run this against production
-- until the owner has approved the target Supabase project and this migration.

create table if not exists public.meta_ads_hourly_insights (
  id uuid primary key default gen_random_uuid(),
  insight_key text not null unique,
  account_id text not null,
  report_date date not null,
  hour_start time not null,
  account_timezone text not null,
  hour_start_utc timestamptz,
  utc_conversion_status text not null default 'unavailable'
    check (utc_conversion_status in ('exact', 'ambiguous', 'invalid_timezone', 'unavailable')),
  campaign_id text,
  campaign_name text,
  adset_id text,
  adset_name text,
  ad_id text,
  ad_name text,
  spend numeric(18,6),
  impressions bigint,
  reach bigint,
  clicks bigint,
  link_clicks bigint,
  ctr numeric(18,8),
  cpc numeric(18,8),
  cpm numeric(18,8),
  frequency numeric(18,8),
  publisher_platform text not null default 'unknown',
  platform_position text not null default 'unknown',
  device_platform text not null default 'unknown',
  raw_actions jsonb,
  raw_action_values jsonb,
  raw_insight jsonb not null,
  api_version text not null,
  fetched_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (hour_start >= time '00:00:00' and hour_start < time '24:00:00')
);

create index if not exists idx_meta_ads_hourly_insights_account_time
  on public.meta_ads_hourly_insights (account_id, report_date, hour_start);
create index if not exists idx_meta_ads_hourly_insights_campaign_time
  on public.meta_ads_hourly_insights (campaign_id, report_date, hour_start);
create index if not exists idx_meta_ads_hourly_insights_ad_time
  on public.meta_ads_hourly_insights (ad_id, report_date, hour_start);
create index if not exists idx_meta_ads_hourly_insights_raw_gin
  on public.meta_ads_hourly_insights using gin (raw_insight);

alter table public.meta_ads_hourly_insights enable row level security;

-- No public policies are created. The isolated collector uses the Supabase
-- service-role credential from a trusted environment only.
grant usage on schema public to service_role;
grant select, insert, update on table public.meta_ads_hourly_insights to service_role;
