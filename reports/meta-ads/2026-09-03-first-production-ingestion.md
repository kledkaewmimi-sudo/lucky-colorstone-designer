# First Production Meta Ads Ingestion — Safety Gate Report

วันที่: 2026-09-03  
สถานะ: **NOT EXECUTED — credentials and verified Production target are absent from this shell**

## Required tables and reviewed migration paths

Only these two isolated tables are required for the approved first ingestion:

1. `public.meta_ads_hourly_performance_insights`  
   Migration: `supabase/2026-09-03-meta-ads-hourly-performance-baseline.sql`
2. `public.meta_ads_daily_demographics`  
   Migration: `supabase/2026-09-03-meta-ads-daily-demographics.sql`

Both reviewed files are create-only for their respective new table: `create table if not exists`, `create index if not exists`, `alter table <new table> enable row level security`, and service-role `select, insert, update` grants. They contain no `DROP`, no destructive ALTER, and no existing application-table change. Both use deterministic `insight_key text unique`, preserve `raw_insight jsonb`, include relevant date/ad indexes, enable RLS, and create no public policy

Do **not** apply `supabase/2026-09-03-meta-ads-analytics-expansion.sql` in this first ingestion. It is not required for the two approved datasets and contains additive alterations to the earlier isolated Ads table plus tables for placement/geo/engagement that are out of scope

## Production project and credential verification

The current shell has none of the required variables present:

| Credential name | Present |
|---|---:|
| `META_AD_ACCOUNT_ID` | No |
| `META_ACCESS_TOKEN` | No |
| `META_API_VERSION` | No |
| `META_ADS_SUPABASE_URL` | No |
| `META_ADS_SUPABASE_SERVICE_ROLE_KEY` | No |

No values were printed or read from repository files. Consequently Production Supabase project identity could not be verified and no create-only runner, SQL Editor call, Meta ingestion, Supabase query, or write was executed

## Owner-run SQL instructions (only after target-project verification)

1. Open the owner-approved Production Supabase project in SQL Editor
2. Review and run the complete contents of `supabase/2026-09-03-meta-ads-hourly-performance-baseline.sql`
3. Separately review and run the complete contents of `supabase/2026-09-03-meta-ads-daily-demographics.sql`
4. Do not run `supabase/2026-09-03-meta-ads-analytics-expansion.sql`
5. Confirm only these tables appear: `meta_ads_hourly_performance_insights`, `meta_ads_daily_demographics`

The migration defaults use `gen_random_uuid()`; confirm the approved project has the required `pgcrypto` capability before running. The existing repository schema establishes that extension, but this shell did not inspect the Production project

## Controlled one-day ingestion commands

After the two tables are confirmed in the verified Production project and the trusted shell holds all five environment variables, run exactly once for `2026-09-01`:

```powershell
node scripts/meta-ads-sync.js --date 2026-09-01
node scripts/meta-ads-analytics-sync.js --date 2026-09-01 --datasets demographics --demographics-stage age_gender --granularity daily
```

Do not use a date range, do not ingest placement/geo/engagement, and do not run a scheduler in this phase

## Required post-write verification queries

Run these in the same verified Production SQL Editor after the first write:

```sql
select count(*) as rows, count(distinct insight_key) as unique_keys,
       min(hour_start) as first_hour, max(hour_start) as last_hour,
       min(account_timezone) as timezone,
       sum(spend) as total_spend, sum(impressions) as total_impressions,
       sum(clicks) as total_clicks, sum(link_clicks) as total_link_clicks
from public.meta_ads_hourly_performance_insights
where report_date = date '2026-09-01';

select insight_key, count(*) as duplicate_count
from public.meta_ads_hourly_performance_insights
where report_date = date '2026-09-01'
group by insight_key
having count(*) > 1;

select count(*) as rows, count(distinct insight_key) as unique_keys,
       min(account_timezone) as timezone,
       bool_and(raw_insight is not null) as all_raw_present
from public.meta_ads_daily_demographics
where report_date = date '2026-09-01';

select age, gender, sum(spend) as spend, sum(impressions) as impressions, sum(clicks) as clicks
from public.meta_ads_daily_demographics
where report_date = date '2026-09-01'
group by age, gender
order by age, gender;
```

For the hourly table, check `raw_insight`, `fetched_at`, and `api_version` are present and numeric delivery metrics are populated where Meta returned them. Expect approximately 24 rows per active ad/hour delivery grain, not a guaranteed account-wide 24 rows. For daily demographics, the live dry-run expectation is 13 rows for this account/date; verify there are no hour columns and `account_timezone = Asia/Bangkok`

Do not add demographic totals to baseline totals: demographics is a distribution view, while baseline is authoritative for total hourly delivery

## Idempotency gate

Only after the first verification passes, rerun the same two commands once. Re-run all duplicate/count queries. Expected result: count and distinct-key count remain stable, no duplicate result rows, and `fetched_at`/`updated_at` may refresh as Meta corrects metrics. Record before/after counts before any range backfill

## Data quality and engagement

No persisted data exists from this task, so total spend/impressions/reach/clicks, CTR, delivery hours, and age/gender group metrics cannot be reported yet. Derive CTR only as `sum(clicks) / sum(impressions) * 100` when denominator is nonzero; do not average row CTR values. Do not sum `reach` across hourly rows unless the analysis explicitly accepts potential double-counting of people across hours

Engagement hourly is live-validated and **READY for the next ingestion phase only**. It is explicitly excluded from this first production write

## Files changed and tests

This task adds this report only. No application or ingestion code changed, so no new code test was required. Prior implementation commit: `90ac4eb55006762f06a4ca7967aa113db10a0aa3`

## Final status

- Tables created: **NO**
- Baseline rows written: **0**
- Demographics rows written: **0**
- Idempotency rerun: **NOT RUN**
- Production Supabase modified: **NO**
- Existing app tables modified: **NO**
- Frontend affected: **NO**
- CRM affected: **NO**
- Orders affected: **NO**
- Stripe affected: **NO**
