-- Additive Phase 1 expansion for isolated Meta Ads analytics datasets.
-- Do not execute against production without explicit owner approval.

-- The existing isolated baseline table gains only additive traffic/raw columns.
alter table public.meta_ads_hourly_insights add column if not exists unique_clicks bigint;
alter table public.meta_ads_hourly_insights add column if not exists unique_ctr numeric(18,8);
alter table public.meta_ads_hourly_insights add column if not exists raw_outbound_clicks jsonb;
alter table public.meta_ads_hourly_insights add column if not exists raw_outbound_clicks_ctr jsonb;
alter table public.meta_ads_hourly_insights add column if not exists raw_cost_per_action_type jsonb;

create table if not exists public.meta_ads_hourly_placement_insights (
  id uuid primary key default gen_random_uuid(),
  insight_key text not null unique,
  account_id text not null, report_date date not null, hour_start time not null,
  account_timezone text not null, hour_start_utc timestamptz,
  utc_conversion_status text not null default 'unavailable' check (utc_conversion_status in ('exact', 'ambiguous', 'invalid_timezone', 'unavailable')),
  campaign_id text, campaign_name text, adset_id text, adset_name text, ad_id text, ad_name text,
  publisher_platform text not null default 'unknown', platform_position text not null default 'unknown',
  device_platform text not null default 'unknown', impression_device text not null default 'unknown',
  spend numeric(18,6), impressions bigint, reach bigint, clicks bigint, link_clicks bigint,
  unique_clicks bigint, ctr numeric(18,8), unique_ctr numeric(18,8), cpc numeric(18,8), cpm numeric(18,8), frequency numeric(18,8),
  raw_outbound_clicks jsonb, raw_outbound_clicks_ctr jsonb, raw_actions jsonb, raw_action_values jsonb, raw_cost_per_action_type jsonb,
  raw_insight jsonb not null, api_version text not null, fetched_at timestamptz not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (hour_start >= time '00:00:00' and hour_start < time '24:00:00')
);

create table if not exists public.meta_ads_hourly_demographics (
  id uuid primary key default gen_random_uuid(),
  insight_key text not null unique,
  account_id text not null, report_date date not null, hour_start time not null,
  account_timezone text not null, hour_start_utc timestamptz,
  utc_conversion_status text not null default 'unavailable' check (utc_conversion_status in ('exact', 'ambiguous', 'invalid_timezone', 'unavailable')),
  campaign_id text, campaign_name text, adset_id text, adset_name text, ad_id text, ad_name text,
  age text not null default 'unknown', gender text not null default 'unknown',
  spend numeric(18,6), impressions bigint, reach bigint, clicks bigint, link_clicks bigint,
  unique_clicks bigint, ctr numeric(18,8), unique_ctr numeric(18,8), cpc numeric(18,8), cpm numeric(18,8), frequency numeric(18,8),
  raw_outbound_clicks jsonb, raw_outbound_clicks_ctr jsonb, raw_actions jsonb, raw_action_values jsonb, raw_cost_per_action_type jsonb,
  raw_insight jsonb not null, api_version text not null, fetched_at timestamptz not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (hour_start >= time '00:00:00' and hour_start < time '24:00:00')
);

create table if not exists public.meta_ads_hourly_geo (
  id uuid primary key default gen_random_uuid(),
  insight_key text not null unique,
  account_id text not null, report_date date not null, hour_start time not null,
  account_timezone text not null, hour_start_utc timestamptz,
  utc_conversion_status text not null default 'unavailable' check (utc_conversion_status in ('exact', 'ambiguous', 'invalid_timezone', 'unavailable')),
  campaign_id text, campaign_name text, adset_id text, adset_name text, ad_id text, ad_name text,
  geo_breakdown text not null check (geo_breakdown in ('country', 'region')),
  country text not null default 'unknown', region text not null default 'unknown',
  spend numeric(18,6), impressions bigint, reach bigint, clicks bigint, link_clicks bigint,
  unique_clicks bigint, ctr numeric(18,8), unique_ctr numeric(18,8), cpc numeric(18,8), cpm numeric(18,8), frequency numeric(18,8),
  raw_outbound_clicks jsonb, raw_outbound_clicks_ctr jsonb, raw_actions jsonb, raw_action_values jsonb, raw_cost_per_action_type jsonb,
  raw_insight jsonb not null, api_version text not null, fetched_at timestamptz not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (hour_start >= time '00:00:00' and hour_start < time '24:00:00')
);

create table if not exists public.meta_ads_hourly_engagement (
  id uuid primary key default gen_random_uuid(),
  insight_key text not null unique,
  account_id text not null, report_date date not null, hour_start time not null,
  account_timezone text not null, hour_start_utc timestamptz,
  utc_conversion_status text not null default 'unavailable' check (utc_conversion_status in ('exact', 'ambiguous', 'invalid_timezone', 'unavailable')),
  campaign_id text, campaign_name text, adset_id text, adset_name text, ad_id text, ad_name text,
  quality_ranking text, engagement_rate_ranking text, conversion_rate_ranking text,
  raw_video_metrics jsonb not null default '{}'::jsonb,
  raw_actions jsonb, raw_action_values jsonb, raw_cost_per_action_type jsonb,
  raw_insight jsonb not null, api_version text not null, fetched_at timestamptz not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (hour_start >= time '00:00:00' and hour_start < time '24:00:00')
);

create index if not exists idx_meta_ads_hourly_placement_ad_hour on public.meta_ads_hourly_placement_insights (ad_id, report_date, hour_start);
create index if not exists idx_meta_ads_hourly_placement_dimensions on public.meta_ads_hourly_placement_insights (publisher_platform, platform_position, device_platform, impression_device);
create index if not exists idx_meta_ads_hourly_demographics_ad_hour on public.meta_ads_hourly_demographics (ad_id, report_date, hour_start);
create index if not exists idx_meta_ads_hourly_demographics_dimensions on public.meta_ads_hourly_demographics (age, gender);
create index if not exists idx_meta_ads_hourly_geo_ad_hour on public.meta_ads_hourly_geo (ad_id, report_date, hour_start);
create index if not exists idx_meta_ads_hourly_geo_dimensions on public.meta_ads_hourly_geo (geo_breakdown, country, region);
create index if not exists idx_meta_ads_hourly_engagement_ad_hour on public.meta_ads_hourly_engagement (ad_id, report_date, hour_start);
create index if not exists idx_meta_ads_hourly_placement_raw_gin on public.meta_ads_hourly_placement_insights using gin (raw_insight);
create index if not exists idx_meta_ads_hourly_demographics_raw_gin on public.meta_ads_hourly_demographics using gin (raw_insight);
create index if not exists idx_meta_ads_hourly_geo_raw_gin on public.meta_ads_hourly_geo using gin (raw_insight);
create index if not exists idx_meta_ads_hourly_engagement_raw_gin on public.meta_ads_hourly_engagement using gin (raw_insight);

alter table public.meta_ads_hourly_placement_insights enable row level security;
alter table public.meta_ads_hourly_demographics enable row level security;
alter table public.meta_ads_hourly_geo enable row level security;
alter table public.meta_ads_hourly_engagement enable row level security;

grant usage on schema public to service_role;
grant select, insert, update on table public.meta_ads_hourly_placement_insights to service_role;
grant select, insert, update on table public.meta_ads_hourly_demographics to service_role;
grant select, insert, update on table public.meta_ads_hourly_geo to service_role;
grant select, insert, update on table public.meta_ads_hourly_engagement to service_role;
