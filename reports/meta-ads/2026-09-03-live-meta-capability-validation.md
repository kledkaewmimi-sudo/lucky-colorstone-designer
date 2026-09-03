# Live Meta Capability Validation — Progressive Read-only Run

วันที่: 2026-09-03  
ขอบเขต: Meta read-only / `--dry-run` เท่านั้น; ไม่มี Supabase write หรือ production mutation

## Live evidence recorded

Owner ทำ live read จริงแล้วด้วย:

```text
node scripts/meta-ads-sync.js --date 2026-09-01 --dry-run
```

ผลที่ได้รับจาก Meta account จริง:

| Item | Result |
|---|---|
| Tested date | `2026-09-01` |
| API version | `v26.0` |
| Account reachability | Meta account reached successfully |
| Query | `level=ad` + `hourly_stats_aggregated_by_advertiser_time_zone,publisher_platform,platform_position,device_platform` |
| HTTP / Meta error | HTTP 400 / code `100` |
| Meta finding | Meta rejected the requested breakdown values as invalid together |
| Supabase write | No — `--dry-run` |

The full raw Meta error body was not supplied, so this report deliberately does not invent a longer exact Meta message. The exact live classification is **INCOMPATIBLE COMBINATION** for this account/API version—not “NOT LIVE-VERIFIED YET”

## Second live finding: implementation bug, not an hourly capability result

After the placement dimensions were removed, owner reran the same read-only command. Meta returned HTTP 400 / code `100` stating that `hourly_stats_aggregated_by_advertiser_time_zone` is not valid for the `fields` parameter

Source audit found the cause in `scripts/lib/meta-ads-sync-core.js`: `BASELINE_INSIGHT_FIELDS` was derived by removing placement entries from the old mixed `INSIGHT_FIELDS` array, but that old array also contained `HOURLY_BREAKDOWN`. The baseline URL builder correctly set `breakdowns=hourly_stats_aggregated_by_advertiser_time_zone`, but also serialised the same value inside `fields`

This is an **IMPLEMENTATION BUG**. It does **not** demonstrate that hourly reporting itself is unsupported. No Supabase write occurred in the owner dry-run

The corrected generated baseline request now has exactly:

```text
level=ad
breakdowns=hourly_stats_aggregated_by_advertiser_time_zone
fields=account_id,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,date_start,spend,impressions,reach,clicks,inline_link_clicks,ctr,cpc,cpm,frequency,actions,action_values,unique_clicks,unique_ctr,outbound_clicks,outbound_clicks_ctr,cost_per_action_type
time_range={"since":"2026-09-01","until":"2026-09-01"}
```

No hourly identifier or placement dimension appears in `fields`. For `--dry-run` only, the collector now prints a sanitized `Meta request:` object containing `level`, `fields`, `breakdowns` and `date`; it never includes `access_token`

## Account metadata

The successful request proves account access, but this task did not receive live values for account ID, timezone name, UTC offset, currency or status. They remain **NOT RECORDED** rather than inferred. `v26.0` is the API version confirmed by the owner

## Minimal isolated correction

The prior baseline request incorrectly coupled total ad/hour performance to placement dimensions. It has been changed only under `scripts/` to request:

```text
level=ad
breakdowns=hourly_stats_aggregated_by_advertiser_time_zone
```

It no longer requests `publisher_platform`, `platform_position` or `device_platform`. Baseline now requests total-performance fields plus `unique_clicks`, `unique_ctr`, `outbound_clicks`, `outbound_clicks_ctr`, `cost_per_action_type`, `actions` and `action_values`

The prior `public.meta_ads_hourly_insights` table remains untouched. To avoid a placement-independent total row being identified by `unknown` placement values, the new additive, unexecuted migration `supabase/2026-09-03-meta-ads-hourly-performance-baseline.sql` proposes `public.meta_ads_hourly_performance_insights`. Its deterministic key is:

```text
account_id|report_date|hour_start|ad_id-or-account-level
```

No SQL was executed. The new table is intentionally separate because the old table’s `insight_key` includes placement dimensions. The baseline collector’s future non-dry-run default target is the new table; dry runs never call the upsert path

## Progressive validation matrix

| Query | Hourly | Daily | Meta result | Error code | Rows |
|---|---:|---:|---|---:|---:|
| baseline + publisher + position + device (original) | Yes | Not tested | **INCOMPATIBLE COMBINATION** | 100 | Not returned |
| corrected baseline: hourly only, ad level | Yes | — | **SUPPORTED** | — | 24 |
| publisher platform | Not run | Not tested | PENDING | — | — |
| publisher + platform position | Not run | Not tested | PENDING | — | — |
| publisher + position + device platform | Not run | Not tested | PENDING (known original combination fails when paired with hourly) | — | — |
| age | Not run | Not tested | PENDING | — | — |
| gender | Not run | Not tested | PENDING | — | — |
| age + gender | Yes | Not yet run | **INCOMPATIBLE COMBINATION** | 100 | Not returned |
| country | Not run | Not tested | PENDING | — | — |
| region | Not run | Not tested | PENDING | — | — |
| engagement/video/rankings | Not run | Not tested | PENDING | — | — |

No placement, demographic, geo, detailed traffic, video or ranking result is classified as SUPPORTED, SUPPORTED BUT EMPTY, DAILY ONLY or UNSUPPORTED FIELD until its progressive live request completes. Baseline hourly itself is supported

## Required next live reads

Current shell does not contain `META_AD_ACCOUNT_ID`, `META_ACCESS_TOKEN` or `META_API_VERSION`, so the progressive placement/demographic/geo/engagement reads could not be executed here. This report does **not** claim those reads happened

After owner sets transient trusted-shell variables, run these read-only commands for `2026-09-01`:

```powershell
node scripts/meta-ads-sync.js --date 2026-09-01 --dry-run
node scripts/meta-ads-analytics-sync.js --date 2026-09-01 --datasets placement --dry-run
node scripts/meta-ads-analytics-sync.js --date 2026-09-01 --datasets demographics --dry-run
node scripts/meta-ads-analytics-sync.js --date 2026-09-01 --datasets geo_country --dry-run
node scripts/meta-ads-analytics-sync.js --date 2026-09-01 --datasets geo_region --dry-run
node scripts/meta-ads-analytics-sync.js --date 2026-09-01 --datasets engagement --dry-run
```

## Placement and demographics refinement after live update

The owner’s new live results update the matrix as follows:

| Query | Hourly | Daily | Meta result | Error code | Rows |
|---|---:|---:|---|---:|---:|
| corrected baseline, ad/hour | Yes | — | **SUPPORTED** | — | 24 |
| original placement with hourly + publisher + position + device | Yes | Not tested | **INCOMPATIBLE** | 100 | Not returned |
| demographics age + gender | Not classified | Not tested | **NOT CLASSIFIED — transport fetch failure** | — | — |

Baseline dry-run also returned account timezone `Asia/Bangkok`; it did not write Supabase

The rejected placement error listed `action_type` with the placement/hourly dimensions. Source audit confirms the prior placement request did not explicitly set an `action_breakdowns` parameter, but it did request action-like fields through the shared field set: `actions`, `action_values`, `cost_per_action_type`, `outbound_clicks`, and `outbound_clicks_ctr`. Therefore the exact internal Meta cause cannot be asserted beyond the #100 response, but those action-array fields were an avoidable contaminant for a delivery/placement capability test

Placement, demographics and geo now use a scalar-only field set:

```text
campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,
spend,impressions,reach,clicks,inline_link_clicks,ctr,cpc,cpm,frequency,
unique_clicks,unique_ctr
```

They explicitly exclude `actions`, `action_values`, `cost_per_action_type`, `outbound_clicks`, `outbound_clicks_ctr`, video fields and ranking fields. Action arrays stay in the baseline or dedicated engagement pass

The analytics collector prints sanitized `Meta request:` diagnostics in dry-run showing dataset, level, fields, breakdowns and date only. It never prints `access_token`. It also supports progressive modes:

```powershell
# A, B, C: placement, hourly scalar-only
node scripts/meta-ads-analytics-sync.js --date 2026-09-01 --datasets placement --placement-stage publisher --dry-run
node scripts/meta-ads-analytics-sync.js --date 2026-09-01 --datasets placement --placement-stage position --dry-run
node scripts/meta-ads-analytics-sync.js --date 2026-09-01 --datasets placement --placement-stage device --dry-run

# D: placement daily scalar-only if C is rejected
node scripts/meta-ads-analytics-sync.js --date 2026-09-01 --datasets placement --placement-stage device --granularity daily --dry-run

# Demographics progressive scalar-only
node scripts/meta-ads-analytics-sync.js --date 2026-09-01 --datasets demographics --demographics-stage age --dry-run
node scripts/meta-ads-analytics-sync.js --date 2026-09-01 --datasets demographics --demographics-stage gender --dry-run
node scripts/meta-ads-analytics-sync.js --date 2026-09-01 --datasets demographics --demographics-stage age_gender --granularity daily --dry-run

# Geo scalar-only; repeat with --granularity daily only after an hourly rejection
node scripts/meta-ads-analytics-sync.js --date 2026-09-01 --datasets geo_country --dry-run
node scripts/meta-ads-analytics-sync.js --date 2026-09-01 --datasets geo_region --dry-run
```

`fetch failed` is not classified as a Meta capability result. Transport failures are now redacted and labelled as DNS/network failure, timeout, TLS failure, aborted request or generic network failure. A real HTTP response still reports Meta HTTP status/code/message separately

## Complete parameter-map audit after action_type evidence

The new owner evidence showed Meta error #100 listing `action_type` for demographics and geo-country even after scalar-only fields were displayed. The URL builders were audited end-to-end. They create a new `URL` directly and explicitly set only `level`, `time_range`, `breakdowns` (when nonempty), `fields`, `limit`, and `access_token`. They do **not** set `action_breakdowns`, `action_report_time`, `summary_action_breakdowns`, or `time_increment`

Dry-run output now reflects the actual generated URL parameter map, with absent values made explicit:

```text
level=ad
fields=[...]
breakdowns=[...]
action_breakdowns=DEFAULT / OMITTED
action_report_time=<absent>
time_range={"since":"2026-09-01","until":"2026-09-01"}
time_increment=<absent>
limit=500
additional_parameters={}
```

`access_token` is excluded from the map. New live evidence establishes that Meta interprets the omitted value as its default `action_type`. The official SDK defines `action_breakdowns` as a list parameter, and Meta's official Postman collection shows JSON-list serialization for the parameter. Dimension-only requests now explicitly serialise the empty list as `action_breakdowns=[]`; they do not use an undocumented blank string

Diagnostics distinguish `DEFAULT / OMITTED`, `EXPLICIT EMPTY`, and a nonempty list such as `["action_type"]`. The explicit-empty setting applies only to placement, demographics, geo-country and geo-region. Baseline and engagement URL builders are unchanged

Current live classifications:

| Dataset | Classification |
|---|---|
| Baseline hourly | **SUPPORTED — 24 rows, Asia/Bangkok** |
| Engagement hourly | **SUPPORTED — 24 rows, dry-run, no write** |
| Demographics hourly age + gender | **INCOMPATIBLE COMBINATION — HTTP 400 / Meta #100 after EXPLICIT EMPTY** |
| Demographics hourly age only | **INCOMPATIBLE COMBINATION — HTTP 400 / Meta #100** |
| Demographics hourly gender only | **INCOMPATIBLE COMBINATION — HTTP 400 / Meta #100** |
| Demographics daily age + gender | **PENDING RETEST AFTER DAILY NORMALIZER FIX** |
| Geo country | **BLOCKED BY DEFAULT action_type; pending explicit-empty retest** |
| Geo region | **BLOCKED BY DEFAULT action_type; pending explicit-empty retest** |
| Placement | **BLOCKED BY DEFAULT action_type/current combination; pending explicit-empty retest** |

Engagement remains isolated and unchanged: it retains action/video/ranking fields and its `action_breakdowns` behavior remains default/omitted. Non-action dimension passes retain scalar-only fields, no action-array fields, and explicit-empty action breakdowns

## Daily demographics normalizer fix

Owner’s daily `age + gender` request did not receive Meta #100. The collector instead threw locally: `Meta insight is missing a valid date_start or advertiser-timezone hourly breakdown`. This was an implementation/normalization bug: the existing analytics normalizer always required the hourly label even when `--granularity daily` intentionally omitted it

Hourly live classifications are now final for this account/API v26.0:

- hourly + age + gender: **INCOMPATIBLE HOURLY** — Meta #100
- hourly + age: **INCOMPATIBLE HOURLY** — Meta #100
- hourly + gender: **INCOMPATIBLE HOURLY** — Meta #100

Daily age+gender is **not** classified as unsupported. A new daily-only normalizer requires `date_start` but does not require or fabricate `hour_start`, `hour_start_utc`, or an hourly label. Its key is `account_id|report_date|ad_id|demographics_daily|age|gender`, so daily and hourly rows cannot collide

The new additive, unexecuted migration `supabase/2026-09-03-meta-ads-daily-demographics.sql` proposes `public.meta_ads_daily_demographics` with daily grain: account, report date, ad, age and gender. It preserves hierarchy, scalar delivery metrics, account timezone, raw insight, API/fetch metadata and timestamps—without hourly columns

When `dataset=demographics` and `granularity=daily`, the collector now routes to `meta_ads_daily_demographics`; hourly demographics remains routed to `meta_ads_hourly_demographics`. No daily geo/placement table is introduced because live evidence has not yet shown those daily paths are needed

Owner retest only:

```powershell
node scripts/meta-ads-analytics-sync.js --date 2026-09-01 --datasets demographics --demographics-stage age_gender --granularity daily --dry-run
```

The analytics CLI now has validation-only selectors for `publisher`, `publisher+position`, `age`, `gender` and `age+gender`; do not change ingestion query design based only on an unbisected error

For any hourly rejection, rerun the identical dimension set without `hourly_stats_aggregated_by_advertiser_time_zone` and record it as daily only only if that request succeeds. Do not test `impression_device` until the three placement stages above are recorded

For engagement, start with hourly + basic fields, then add video action arrays as one group and rankings as one group. If #100 occurs, bisect the group one field at a time so an unsupported field does not obscure supported fields

## Traffic, actions, video and ranking status

| Category | Live status |
|---|---|
| clicks, inline link clicks, unique clicks, CTR, unique CTR, CPC, CPM, frequency | Baseline field availability detail not yet recorded; baseline query itself is supported |
| outbound clicks / outbound CTR | PENDING; implementation preserves array form only |
| actions / action values / cost per action type | PENDING; implementation preserves arrays only |
| video play/thruplay/p25/p50/p75/p95/p100 | PENDING engagement read |
| quality / engagement-rate / conversion-rate ranking | PENDING engagement read |

## Tests

After the isolated correction, these checks passed:

- `node --check scripts/meta-ads-sync.js`
- `node --check scripts/lib/meta-ads-sync-core.js`
- `node --test tests/meta-ads-sync-core.test.cjs` — includes baseline key without placement dimensions, scalar-only placement/demographics/geo fields, no explicit `action_type` breakdown, sanitized diagnostics, transport classification, rich raw metrics, prior parsing/timezone/pagination/rate-limit coverage
- baseline URL-builder assertions: hourly is absent from `fields`, present in `breakdowns`, placement breakdowns are absent, and diagnostics cannot contain the supplied test token
- `node tests/uat-frontend-safety.test.cjs`
- `git diff --check` for changed isolated files

No backend/UAT guard was bypassed

## Files changed

- modified `scripts/meta-ads-sync.js`
- modified `scripts/lib/meta-ads-sync-core.js`
- modified `tests/meta-ads-sync-core.test.cjs`
- added `supabase/2026-09-03-meta-ads-hourly-performance-baseline.sql` (not executed)
- updated this report

No customer, CRM, server, order, payment, catalog, inventory, renderer, analytics or existing application table file was modified

## Final status

- Production modified: **NO**
- Supabase modified: **NO**
- Meta Ads modified: **NO**
- Live Meta reads performed: **YES** — initial owner baseline dry-run reached Meta and returned HTTP 400 / Meta #100
- Additional corrected/progressive live reads performed in current shell: **NO — credentials are absent**
