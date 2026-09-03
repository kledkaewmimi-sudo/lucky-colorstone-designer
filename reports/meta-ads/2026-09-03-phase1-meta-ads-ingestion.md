# Phase 1: Meta Ads API → Supabase ingestion (isolated)

## Safety audit

- Customer frontend: `index.html`, `index.css`, `app.js`.
- CRM: `crm.html`, `crm.css`, `crm.js`.
- Existing backends: `server.js` and `server.ps1`; neither is used or modified.
- Existing shared browser data layer: `data.js`; not used or modified.
- Existing analytics tables are `analytics_sessions`, `analytics_events`, and `analytics_errors` in `supabase/schema.sql`; they are not changed.
- Deployment is static Vercel with `/api/*` proxied to Render, while local development uses `server.ps1`. This collector is a manual Node process and has no deployment/scheduler integration.

Safe files added: `supabase/2026-09-03-meta-ads-hourly-insights.sql`, `scripts/meta-ads-sync.js`, `scripts/lib/meta-ads-sync-core.js`, and `tests/meta-ads-sync-core.test.cjs`.

Files that must remain untouched: all customer, CRM, server, data, order, payment, inventory, catalog, renderer, existing analytics, and existing Supabase schema files named above.

## Meta capability and method

The collector calls `/{META_API_VERSION}/act_<id>/insights` with `level=ad`, a bounded `time_range`, and `breakdowns=hourly_stats_aggregated_by_advertiser_time_zone,publisher_platform,platform_position,device_platform`. Meta returns the advertiser-local hourly label such as `09:00:00 - 09:59:59`; `date_start` plus its leading time is the stored report hour. It retrieves `timezone_name` from `/{version}/act_<id>?fields=id,timezone_name,timezone_offset_hours_utc` before querying Insights and refuses to write without it.

The production Meta account must validate the requested breakdown combination. Meta restricts permitted combinations by account/API version; a validation failure stops before any Supabase write. Pagination follows the API-provided `paging.next`. HTTP 429 and Meta error codes 4, 17, 32, and 613 retry with bounded exponential backoff (honouring `Retry-After`).

Use a read-only Meta token with `ads_read` and access to the target ad account. For a system-user token, keep it in a trusted environment and rotate before expiry; Meta token/app and rate-limit rules vary by token/app/account usage, so monitoring response headers and errors is required. The tested/default API version is explicit through `META_API_VERSION` (default `v24.0`), never inferred from a moving endpoint.

## Timezone and idempotency

`report_date`, `hour_start`, and `account_timezone` preserve Meta's advertiser-local reporting identity. `hour_start_utc` is populated only when the IANA timezone maps the local hour to exactly one UTC instant. Repeated DST hours are deliberately marked `ambiguous` rather than assigned a false UTC value.

`insight_key` is unique and deterministic: account + report date + report hour + ad (or account-level sentinel) + publisher platform + platform position + device platform. The collector POSTs with `on_conflict=insight_key` and `resolution=merge-duplicates`, so historical reruns update rather than duplicate data.

## Manual run only

```powershell
$env:META_AD_ACCOUNT_ID = 'act_123'
$env:META_ACCESS_TOKEN = '...'
$env:META_API_VERSION = 'v24.0'
$env:META_ADS_SUPABASE_URL = 'https://your-project.supabase.co'
$env:META_ADS_SUPABASE_SERVICE_ROLE_KEY = '...'
node scripts/meta-ads-sync.js --date 2026-09-01
node scripts/meta-ads-sync.js --since 2026-08-30 --until 2026-09-01
```

Use `--dry-run` to read/parse Meta without a Supabase write. No scheduler, production SQL execution, deployment, or production ingestion is included. A later isolated scheduler can run this command in a separate trusted job/worker after owner approval.

Migration to review and apply manually after approval: `supabase/2026-09-03-meta-ads-hourly-insights.sql`.

## Verification

`node --check` passed for the collector and core module. `node --test tests/meta-ads-sync-core.test.cjs` passes parsing, timezone handling (including an ambiguous DST hour), missing metrics, actions JSON, dimensions, deterministic upsert request, pagination, empty results, and a Meta API failure. `tests/uat-frontend-safety.test.cjs` also passes.

The existing `tests/analytics-v2-server.test.mjs` could not start the guarded UAT server because the current shell intentionally has no required UAT environment values (`APP_ENV`, `UAT_BACKEND`, and `UAT_SUPABASE_*`). No environment was added and no server behavior was changed to bypass that safeguard.
