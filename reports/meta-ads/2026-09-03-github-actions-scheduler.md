# Meta Ads scheduler — GitHub Actions

## Decision

GitHub Actions is the selected scheduler target because the owner declined Render Cron’s recurring minimum cost. The worker remains independent of Vercel, Render web service, frontend, CRM, `server.js`, Orders, Stripe, and existing application analytics.

Workflow path: `.github/workflows/meta-ads-scheduled-ingestion.yml`

The workflow invokes exactly one existing isolated entry point:

```bash
node scripts/meta-ads-scheduled-worker.js --job scheduled
```

No ingestion logic was redesigned or moved. The worker continues to invoke only the verified baseline hourly collector and daily demographics collector.

## Workflow behavior

| Feature | Configuration |
| --- | --- |
| Scheduled trigger | `cron: '5 * * * *'` (minute 05, UTC) |
| Manual trigger | `workflow_dispatch` with no date override |
| Permissions | `contents: read` only |
| Concurrency | group `meta-ads-scheduled-ingestion`, `cancel-in-progress: false` |
| Runtime | `ubuntu-latest`, Node.js 20 |
| Dependencies | `npm ci` |

`package-lock.json` exists and uses lockfile version 3, so `npm ci` is the reproducible project-compatible install convention. Node 20 satisfies the repository’s declared `>=18` engine.

The hourly GitHub cron calls the worker once. The worker itself calculates dates in `Asia/Bangkok`:

- every run refreshes hourly baseline for Bangkok yesterday through today;
- at Bangkok 02:05 it also ingests completed-day daily demographics (`age_gender`);
- at Bangkok 03:05 it reconciles the previous three completed days for both approved datasets.

The workflow’s concurrency group serializes scheduled and manually dispatched runs. `cancel-in-progress: false` preserves a running ingestion instead of interrupting it; a queued run follows afterward. Existing deterministic Supabase upserts remain the duplicate-prevention and correction mechanism.

## Secrets

The workflow maps only GitHub Actions Secrets into the worker environment:

- `META_AD_ACCOUNT_ID`
- `META_ACCESS_TOKEN`
- `META_API_VERSION`
- `META_ADS_SUPABASE_URL`
- `META_ADS_SUPABASE_SERVICE_ROLE_KEY`

There are no secret literals in workflow YAML. The workflow does not echo environment variables, upload logs/artifacts, or pass secrets through command-line arguments. The worker validates required names before it runs and the collectors redact token-like values in their errors.

Use a durable server-side Meta System User token with least-privilege `ads_read` and assignment to the target ad account. Do not configure a Graph API Explorer token for automation. Before enabling the workflow, owner must record token expiration/rotation owner and replace the GitHub secret before expiry; validate a replacement token with a manual workflow run before revoking the old token.

## Failure isolation

If Meta or Supabase fails, the workflow job exits failed. No frontend route, customer web service, CRM process, order/payment workflow, or application table is called. The collectors never delete or truncate data; a later scheduled/manual run retries safely through existing idempotent upsert behavior.

## Manual activation checklist

1. Confirm the workflow is reviewed on the intended default branch.
2. Add all five secret names in the correct GitHub repository/environment; do not use repository variables or frontend-visible variables.
3. Confirm the Meta credential is a durable System User/long-lived server-side credential with `ads_read` and target ad-account access.
4. Use **Actions → Meta Ads scheduled ingestion → Run workflow** once.
5. Inspect only redacted workflow logs and verify both approved Ads tables in Production Supabase.
6. Confirm no duplicate `insight_key` rows and that the expected Bangkok date windows were ingested.
7. Owner explicitly approves relying on the hourly schedule.

No GitHub Actions run, Production scheduler activation, deployment, or secret configuration occurred in this task.

## Files changed

- Added `.github/workflows/meta-ads-scheduled-ingestion.yml`
- Added `tests/meta-ads-scheduled-workflow.test.cjs`
- Updated `reports/meta-ads/2026-09-03-automated-ingestion-scheduler.md` to mark Render Cron **NOT SELECTED**
- Added this report

No frontend, CRM, runtime/server, order, payment, existing analytics, or Supabase schema file changed.

## Tests

Passed:

```text
node --check scripts/meta-ads-scheduled-worker.js
node --test tests/meta-ads-scheduled-workflow.test.cjs
node --test tests/meta-ads-scheduled-worker.test.cjs
node --test tests/meta-ads-sync-core.test.cjs
node tests/uat-frontend-safety.test.cjs
```

The workflow contract test verifies schedule, manual dispatch, minimum permissions, concurrency, checkout, Node setup, locked install, exact isolated worker command, all secret mappings, no literal secret pattern, no `server.js` invocation, and no Render invocation. The YAML was also reviewed structurally against this contract; no additional YAML parser dependency was added.

## Commit

GitHub Actions scheduler implementation commit: `fa550404511b413c1633379241f88e89171b0bab`.

## Final status

- Scheduler implementation target: **GitHub Actions**
- GitHub workflow created: **YES**
- Production schedule active: **NO**
- Render Cron used: **NO**
- Frontend affected: **NO**
- CRM affected: **NO**
- Orders affected: **NO**
- Stripe affected: **NO**
- Existing application tables affected: **NO**
