# รายงาน: Isolated Meta Ads Automated Ingestion Scheduler

## Executive summary

เพิ่ม isolated worker ที่เรียกเฉพาะ collectors ที่ live-verified และ Production-verified แล้ว:

- hourly baseline → `public.meta_ads_hourly_performance_insights`
- daily demographics (`age_gender`) → `public.meta_ads_daily_demographics`

worker อยู่ที่ `scripts/meta-ads-scheduled-worker.js` และไม่ import, start, หรือแก้ `server.js` หรือ frontend/CRM ใด ๆ จึงแยกจาก customer traffic และ backend runtime เดิมโดยสมบูรณ์

**Scheduler implemented: YES**

**Scheduler activated in Production: NO**

## Selected deployment approach

เลือก **หนึ่ง Render Cron Job แบบแยก service** ที่รันทุกชั่วโมง และสั่ง:

```bash
node scripts/meta-ads-scheduled-worker.js --job scheduled
```

เหตุผล: repository ใช้ Vercel สำหรับ static/frontend และมี API rewrite ไปยัง Render-hosted backend อยู่แล้ว (`vercel.json`) แต่ worker นี้ไม่ควรเป็น Vercel route หรืออยู่ใน `server.js` Render Cron Job เป็น isolated service ที่รัน command แล้ว exit, มี environment variables แยกได้, และ Render รับประกันว่า run ของ cron job เดียวกันจะ active ได้ไม่เกินหนึ่ง run; หาก run ก่อนหน้ายังไม่จบ run ถัดไปจะรอ [Render Cron Jobs documentation](https://render.com/docs/cronjobs). Render ระบุด้วยว่า cron schedule ใช้ UTC และ cron job ไม่มี persistent disk จึงไม่มีการพึ่งพา local state สำหรับ correctness [Render Cron Jobs documentation](https://render.com/docs/cronjobs).

ใช้ cron เดียว แทนสาม service cron เพื่อให้ Render single-run guarantee ครอบคลุม hourly, demographics และ reconciliation ทั้งหมด ไม่เกิด overlap ระหว่าง cron services คนละตัว การ upsert ที่มีอยู่ยังเป็น safety net สำหรับ rerun หรือ Meta corrections

## Proposed Render configuration — do not create yet

สร้าง Render Cron Job ใหม่จาก repository/branch ที่ owner อนุมัติเท่านั้น:

| Setting | Proposed value |
| --- | --- |
| Service type | Cron Job |
| Runtime | Node |
| Build command | `npm install` (ตาม existing Node project convention) |
| Start command | `node scripts/meta-ads-scheduled-worker.js --job scheduled` |
| Schedule | `5 * * * *` (UTC) |
| Auto-deploy | owner decision; no activation in this task |

`5 * * * *` รันที่นาที 05 ของทุกชั่วโมง UTC. Worker แปลงเวลาผ่าน `Intl` เป็น `Asia/Bangkok`; จึง run ที่ 02:05 Bangkok จะทำ daily demographics และ run ที่ 03:05 Bangkok จะทำ reconciliation นอกเหนือจาก baseline hourly ปกติ

Render logs แยกออกจาก customer web-service logs และ cron container เป็น ephemeral, ซึ่งตรงกับ failure isolation ที่ต้องการ [Render scheduled-task architecture](https://render.com/articles/how-render-handles-scheduled-tasks).

## Job behavior and date windows

| Bangkok local run | Action | Date range | Target |
| --- | --- | --- | --- |
| Every hour at `:05` | Baseline hourly refresh | yesterday through today | `meta_ads_hourly_performance_insights` |
| 02:05 daily | Baseline + completed-day demographics | demographics: previous completed day | `meta_ads_daily_demographics` |
| 03:05 daily | Baseline + three-day reconciliation for both datasets | previous three completed days; excludes current day | both approved tables |

Hourly collector currently has a date-range interface, not an hour-range interface. Refreshing Bangkok yesterday and today is intentional: it re-reads the most recently completed hours and can replace partial/delayed metrics by deterministic upsert. It does not treat the current Meta hour as final.

At a Bangkok date of `2026-09-04`, examples are:

- ordinary hourly run: baseline `2026-09-03` through `2026-09-04`
- 02:05 daily run: demographics for `2026-09-03`
- 03:05 reconciliation: baseline and demographics `2026-09-01` through `2026-09-03`

Only baseline and daily demographics are invoked. Placement, geo, engagement, Pixel, CAPI, dashboards, order joins, and scheduler changes to existing runtime remain excluded.

## Timezone and grain handling

Worker date selection uses `Asia/Bangkok`, independent of host timezone. The collectors retain Meta advertiser account timezone per row and preserve the existing baseline hourly grain / daily demographics grain. Daily demographics never receives fabricated hours; its target remains `meta_ads_daily_demographics`.

## Overlap and idempotency

Production recommendation is a **single** Render cron service, so Render’s single-run guarantee serializes every scheduled pass. Worker also creates a local exclusive lock file for its active job; it is an additional same-runtime guard only, not distributed coordination. This is appropriate because Render cron containers have no persistent disk and no extra distributed lock infrastructure has been introduced.

Rows are upserted on their existing deterministic `insight_key`. Rerunning any window can refresh `fetched_at` / `updated_at` and corrected Meta values but must not create duplicate keys. No job deletes or truncates data.

## Credentials and durable Meta token gate

Configure these values as secret, server-side environment variables on the isolated Render Cron Job only:

- `META_AD_ACCOUNT_ID`
- `META_ACCESS_TOKEN`
- `META_API_VERSION`
- `META_ADS_SUPABASE_URL`
- `META_ADS_SUPABASE_SERVICE_ROLE_KEY`

Worker validates that all five names are non-empty before it starts any child collector. It logs no value. Never place these secrets in Vercel public variables, HTML, frontend bundles, CRM code, or repository files.

The current Graph API Explorer token is not acceptable for automation. Before activation, use a server-side System User token (or a documented long-lived token strategy appropriate to the owner’s Business/App configuration), assigned only to the target ad account and with least privilege—`ads_read` for this read-only Insights ingestion. Meta’s current Marketing API collection notes support for System User and long-lived user tokens, and that Explorer user tokens expire quickly; it also documents `ads_read` as the read permission for ad-account reporting [Meta Marketing API collection](https://www.postman.com/meta/facebook-marketing-api/documentation/0zr4mes/facebook-marketing-api-mapi?entity=request-31691153-3a5ad088-3918-4c1e-9d1d-1a7cf57bbdd9).

Before activation, owner should document token owner/System User, assigned ad account, granted scopes, expiry date, token-debugger check, and rotation owner. Monitor expiry ahead of time; replace the Render secret, manually dry-run the two collectors with the replacement token in a trusted shell, then revoke the old token only after the replacement succeeds. Do not request `ads_management` unless a future write-to-Meta feature genuinely needs it.

## Observability and failure isolation

Worker emits only safe JSON operational events: job, start/end times, Bangkok timezone, selected date range, and command count. Child collectors emit their existing redacted result metadata including rows read/written. The worker and collectors redact token-like `access_token=` values from errors; service-role keys are never included in commands or log output.

If Meta fails, the child exits nonzero; worker exits nonzero after logging a redacted error. If Supabase fails, the collector exits nonzero without delete/truncate; the next scheduled run can retry safely via idempotent upsert. Neither path calls customer server code, changes application tables, or affects frontend, CRM, Orders, or Stripe.

## Files added/changed

- Added `scripts/meta-ads-scheduled-worker.js` — isolated schedule plan, Bangkok date calculation, credential gate, local overlap guard, safe child-process orchestration, and operational logs.
- Added `tests/meta-ads-scheduled-worker.test.cjs` — date windows, Bangkok timezone, daily/reconciliation behavior, credential gate, local lock, redaction, and failed child-process propagation.
- Added this report.

No existing application file was modified.

## Tests

Passed after implementation:

```text
node --check scripts/meta-ads-scheduled-worker.js
node --test tests/meta-ads-scheduled-worker.test.cjs
node --test tests/meta-ads-sync-core.test.cjs
node tests/uat-frontend-safety.test.cjs
```

Coverage includes hourly range resolution, `Asia/Bangkok` conversion, previous-day daily demographics, three-completed-day reconciliation, credential-missing error, idempotent rerun design through existing upsert contract, local overlap guard, redacted output, generic collector failure propagation (the worker’s Meta/Supabase failure path), plus the existing Meta transport/rate-limit tests and frontend safety guard. No live Meta, Supabase, or scheduler call was made during this task.

## Activation checklist

- [ ] Owner approves one separate Render Cron Job (not the web service)
- [ ] Durable System User/long-lived Meta credential is configured; Explorer token is not used
- [ ] `ads_read` and target ad-account access are verified
- [ ] All five secret environment variables are configured only in the Cron Job
- [ ] Render service/project and branch are verified
- [ ] Manually trigger one worker run and inspect redacted logs
- [ ] Re-read both Ads tables and verify idempotency
- [ ] Owner explicitly approves cron activation

## Commit

Worker implementation commit: `cf223fb11bcb9f5eb683f42fe7806cd63a4b25c9`.

## Final status

- Scheduler implemented: **YES**
- Scheduler activated in Production: **NO**
- Frontend affected: **NO**
- CRM affected: **NO**
- Orders affected: **NO**
- Stripe affected: **NO**
- Existing app tables affected: **NO**
