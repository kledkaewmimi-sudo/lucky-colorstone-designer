# Phase 1 Expansion: Meta Ads Analytics Datasets

วันที่: 2026-09-03  
สถานะ: implementation และ test เฉพาะ isolated subsystem; ไม่ได้รัน SQL, Meta live read, ingestion, scheduler หรือ deployment

## Executive summary

Expansion นี้ต่อยอด baseline Meta Ads collector ที่มีอยู่ โดยเพิ่ม isolated query-pass architecture, migration ใหม่ และ test สำหรับ datasets ที่มี grain แยกกัน: placement/device, demographics, geo และ engagement/video. Baseline `meta_ads_hourly_insights` ยังคงอยู่และพฤติกรรม collector เดิมยังคงเดิม; มีเพียง additive columns สำหรับ richer traffic/raw metrics ใน migration ใหม่

ไม่มีการแก้ customer frontend, CRM, backend runtime, API responses, Orders, Stripe/payment, Purchases, Inventory, Catalog, Renderer/Beryl, analytics เดิม หรือ existing application tables. ไม่มี Pixel, CAPI, dashboard, order join, scheduler หรือ production ingestion

- Production modified: **NO**
- Frontend affected: **NO**
- CRM affected: **NO**
- Existing application tables affected: **NO**

## Capability matrix

การตรวจสอบระดับ source/documentation ยืนยันว่า current Meta Business SDK มี field และ breakdown names ที่ระบุไว้ เช่น traffic, video action arrays และ ranking fields; อย่างไรก็ดี compatibility ของ *combination* ขึ้นกับ API version, account และ report configuration. ตารางนี้จึงระบุทุก combination เป็น **NOT LIVE-VERIFIED YET** จนกว่าจะใช้ credential ของ account จริงทดสอบ. Source ที่ใช้: [Meta Business SDK AdsInsights](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adsinsights.py) และ [Meta Marketing API Postman collection](https://www.postman.com/meta/facebook-marketing-api/documentation/0zr4mes/facebook-marketing-api-mapi?entity=request-31691153-3e74ea3e-6fa7-45f0-83f5-adf4a6396ebc).

| Metric / breakdown | hourly | ad level | placement | age/gender | geo | Live verified | Separate pass required |
|---|---|---|---|---|---|---|---|
| `hourly_stats_aggregated_by_advertiser_time_zone` | reporting identity | requested | combination unverified | combination unverified | combination unverified | NOT LIVE-VERIFIED YET | baseline/pass-specific |
| age + gender | requested in demographics pass | requested | not requested together | same pass | not requested together | NOT LIVE-VERIFIED YET | yes |
| country | requested in geo-country pass | requested | not requested together | not requested together | country only | NOT LIVE-VERIFIED YET | yes |
| region | requested in geo-region pass | requested | not requested together | not requested together | region only | NOT LIVE-VERIFIED YET | yes |
| publisher/platform position/device platform | requested in placement pass | requested | same pass | not requested together | not requested together | NOT LIVE-VERIFIED YET | yes |
| `impression_device` | opt-in with placement/hourly | requested | opt-in placement pass | not requested | not requested | NOT LIVE-VERIFIED YET | yes; opt-in |
| spend, impressions, reach, frequency, clicks, inline link clicks, CTR/CPC/CPM | requested | requested | requested per applicable pass | requested per applicable pass | requested per applicable pass | NOT LIVE-VERIFIED YET | no extra pass beyond target grain |
| unique clicks / unique CTR | requested | requested | requested | requested | requested | NOT LIVE-VERIFIED YET | no extra pass beyond target grain |
| outbound clicks / outbound CTR | requested as raw action-like arrays | requested | requested | requested | requested | NOT LIVE-VERIFIED YET | no extra pass; not scalar-normalized |
| actions / action values / cost per action type | requested as raw arrays | requested | requested | requested | requested | NOT LIVE-VERIFIED YET | no extra pass |
| video play/thruplay/p25/p50/p75/p95/p100 | requested in engagement pass | requested | not combined | not combined | not combined | NOT LIVE-VERIFIED YET | yes |
| quality, engagement-rate, conversion-rate rankings | requested in engagement pass | requested | not combined | not combined | not combined | NOT LIVE-VERIFIED YET | yes |

No claim is made that Meta will accept every request shown above. Each pass fails safely before any write when Meta rejects a breakdown/field combination.

## Implemented datasets and exact grain

| Dataset / table | Query pass | Exact row grain | Authoritative use |
|---|---|---|---|
| `meta_ads_hourly_insights` | existing baseline | account + date + hour + ad + publisher platform + position + device platform | existing baseline; total only when its requested breakdown response is valid |
| `meta_ads_hourly_placement_insights` | `placement` | account + date + hour + ad + publisher platform + position + device platform + impression device | placement/device distribution |
| `meta_ads_hourly_demographics` | `demographics` | account + date + hour + ad + age + gender | audience distribution |
| `meta_ads_hourly_geo` | `geo_country` | account + date + hour + ad + literal dataset `geo_country` + country | country distribution |
| `meta_ads_hourly_geo` | `geo_region` | account + date + hour + ad + literal dataset `geo_region` + region | region distribution |
| `meta_ads_hourly_engagement` | `engagement` | account + date + hour + ad | video/engagement/ranking values returned by Meta |

Country and region are deliberately separate query passes. The table records `geo_breakdown` as `country` or `region`, and the unique key includes the dataset pass, preventing a country row and a region row from colliding.

## Double-count prevention / roll-up rules

- Use one dataset at a time as an analytical view. Never add totals from baseline, placement, demographics and geo together
- Use baseline for total hourly spend, impressions and clicks only after live validation of its combination
- Use placement table for placement/device comparison, not as an additive supplement to baseline
- Use demographics table only for age/gender distribution
- Use geo table only for country or region distribution inside its own pass
- Use engagement table for video engagement and ranking analysis
- Cross-dimensional joins must use aggregation rules defined later; direct row joins can multiply facts and double count

## Schema and upsert design

Migration: `supabase/2026-09-03-meta-ads-analytics-expansion.sql`. It does not execute automatically.

The migration adds only these columns to the pre-existing isolated baseline Ads table: `unique_clicks bigint`, `unique_ctr numeric(18,8)`, `raw_outbound_clicks jsonb`, `raw_outbound_clicks_ctr jsonb`, `raw_cost_per_action_type jsonb`.

It creates four new tables. All have UUID `id` primary key, deterministic `insight_key text unique`, account/hour timezone fields, campaign/ad set/ad hierarchy, `raw_insight jsonb not null`, `api_version`, `fetched_at`, `created_at`, `updated_at`, hour validity check, RLS enabled, no public policy, and service-role `select/insert/update` grants.

- placement includes dimensions `publisher_platform`, `platform_position`, `device_platform`, `impression_device` and normalized common traffic metrics
- demographics includes raw Meta `age`, `gender` and normalized common traffic metrics
- geo includes `geo_breakdown`, `country`, `region` and normalized common traffic metrics
- engagement includes the three ranking text fields and `raw_video_metrics jsonb`

New tables have hour/ad indexes, dimension indexes, and `raw_insight` GIN indexes. The unique key is account/date/hour/ad (or `account-level`) plus literal dataset name and that dataset's dimensions. Repeated sync resolves `on_conflict=insight_key` with `resolution=merge-duplicates`; new Meta values replace prior values and duplicate rows should not accumulate once the migration exists.

## Normalized and raw-only metrics

Normalized common columns in applicable placement/demographics/geo tables: `spend`, `impressions`, `reach`, `clicks`, `inline_link_clicks`→`link_clicks`, `unique_clicks`, `ctr`, `unique_ctr`, `cpc`, `cpm`, `frequency`, plus hierarchy and dimensions.

`outbound_clicks`, `outbound_clicks_ctr` and `cost_per_action_type` are kept raw JSON only because Meta describes these as action-stat collections rather than a universally safe scalar. `actions` and `action_values` are also raw JSON only. Invalid/missing scalar metrics become `null`; missing dimensions become `unknown`.

Engagement/video fields are raw-only in `raw_video_metrics`: `video_play_actions`, `video_thruplay_watched_actions`, `video_p25_watched_actions`, `video_p50_watched_actions`, `video_p75_watched_actions`, `video_p95_watched_actions`, `video_p100_watched_actions`. No action arrays are flattened. `quality_ranking`, `engagement_rate_ranking`, and `conversion_rate_ranking` are stored as nullable strings in engagement.

Definitions used here: `clicks` is Meta's general clicks field; `link_clicks` is `inline_link_clicks`; outbound click values and rates remain Meta raw action-stat payloads; `unique_clicks`/`unique_ctr` are Meta scalar fields when returned. No new semantic calculation is invented.

## Demographics, geo and placement/device behavior

Demographics pass requests `hourly_stats_aggregated_by_advertiser_time_zone,age,gender` at `level=ad`; raw values are stored without inferring any age/gender category.

Geo uses two independent passes: hourly + `country`, then hourly + `region`. There is no country-to-region mapping and no query requesting country and region together.

Placement pass requests hourly + `publisher_platform`, `platform_position`, `device_platform`. `--include-impression-device` appends `impression_device` explicitly; it is opt-in because live combination compatibility is unverified. Facebook, Instagram, Feed, Stories and Reels are retained only as raw Meta values—there is no friendly placement mapping.

## Collector architecture and execution

Existing `scripts/meta-ads-sync.js` remains baseline-compatible. Its `upsertRows` gains only an optional table argument; baseline default is unchanged. New reusable field/dataset/normalization functions live in `scripts/lib/meta-ads-sync-core.js`.

New `scripts/meta-ads-analytics-sync.js` uses existing safe Meta pagination/retry/timezone helpers and runs selected passes sequentially:

```powershell
node scripts/meta-ads-analytics-sync.js --date 2026-09-01 --dry-run
node scripts/meta-ads-analytics-sync.js --since 2026-08-30 --until 2026-09-01 --datasets demographics,geo_country,geo_region --dry-run
node scripts/meta-ads-analytics-sync.js --date 2026-09-01 --datasets placement --include-impression-device --dry-run
```

Required variables: `META_AD_ACCOUNT_ID`, `META_ACCESS_TOKEN`, optional `META_API_VERSION` (default `v24.0`), and for non-dry-run `META_ADS_SUPABASE_URL`, `META_ADS_SUPABASE_SERVICE_ROLE_KEY`. Minimum expected Meta permission is `ads_read` plus access to the target account. No real secret is stored.

The collector reads Meta account `timezone_name` before queries and refuses to write without it. All datasets persist `report_date`, `hour_start`, `account_timezone`, `hour_start_utc` and `utc_conversion_status`. Exact UTC is stored only when the IANA timezone mapping is unique; DST duplicate hours remain `ambiguous` with null UTC. Lucky Colorstone Order timestamp logic is untouched.

## Pagination, failures and cadence

Each pass uses the existing `paging.next` loop. Empty `data: []` is valid and writes zero rows. HTTP 429 or Meta codes 4, 17, 32, 613 retry up to five retries after the initial call, using positive `Retry-After` or exponential delays capped at 60 seconds. Other Meta errors, invalid credentials, invalid fields and invalid breakdown combinations terminate the pass.

All Meta pages are fetched and normalized before a pass starts writing. Writes are batches of 250, so a failed later Supabase batch can leave earlier batches committed; idempotent rerun reconciles them. No scheduler exists.

Future design only: hourly sync for a completed hour, delayed re-fetch of recent hours, and daily re-fetch/backfill of recent 13 days. Meta delivery/action/conversion reporting may be revised after initial collection, so reconciliation must use upsert rather than append.

## Known incompatibilities and limits

No live Meta account validates any breakdown pairing yet. The code intentionally separates age/gender, country, region, placement and engagement instead of requesting a giant cross-product. If a requested hourly pairing is not accepted by Meta, no automatic daily fallback exists; that decision must follow live capability testing. `impression_device` is specifically opt-in. Demographic, geo, video and rankings therefore remain **NOT LIVE-VERIFIED YET**.

Not implemented: Pixel, CAPI, CRM Ads dashboard, Orders-vs-Ads joining, scheduler, live ingestion, demographic/geo UI, outgoing click scalar derivation, video flattening, country-region mapping, quality/ranking fallback dataset or production deployment

## Tests and verification

Ran successfully:

- `node --check scripts/meta-ads-sync.js`
- `node --check scripts/meta-ads-analytics-sync.js`
- `node --check scripts/lib/meta-ads-sync-core.js`
- `node --test tests/meta-ads-sync-core.test.cjs`
- `node tests/uat-frontend-safety.test.cjs`
- `git diff --check` for implementation files

The Meta test covers hourly parsing, timezone and DST ambiguity, decimal/null metrics, actions JSON, placement/device including `impression_device`, age/gender, country/region, outbound raw arrays, video/ranking raw preservation, separate dataset keys/grain collision prevention, query pass selection, pagination, empty responses, API failure, rate-limit classification and idempotent upsert request construction

`node tests/analytics-v2-server.test.mjs` was attempted but its server did not start because this shell lacks required UAT guard variables: `APP_ENV`, `UAT_BACKEND`, `UAT_SUPABASE_URL`, `UAT_SUPABASE_SERVICE_ROLE_KEY`, `UAT_SUPABASE_PROJECT_REF`. The guard was not bypassed and `server.js` was not modified to make the test pass

## Files changed

- modified: `scripts/meta-ads-sync.js` (optional target-table argument only; baseline default unchanged)
- modified: `scripts/lib/meta-ads-sync-core.js` (reusable dataset normalization/field definitions)
- modified: `tests/meta-ads-sync-core.test.cjs` (expansion coverage)
- added: `scripts/meta-ads-analytics-sync.js`
- added: `supabase/2026-09-03-meta-ads-analytics-expansion.sql`
- added: this report

Baseline Phase 1 commit: `d07b532999ac4872eec418b318018fad437be9ca`. The expansion commit hash is recorded after implementation is committed.

## Final safety statement

- Production modified: **NO**
- Frontend affected: **NO**
- CRM affected: **NO**
- Existing application tables affected: **NO**
- Existing analytics affected: **NO**
- Production SQL executed: **NO**
- Production Meta ingestion executed: **NO**
- Scheduler enabled: **NO**
