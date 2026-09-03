# Meta Ads historical date-scoped backfill GitHub Actions workflow

Date: 2026-09-04

## Scope

This review branch was created from `origin/main` at `42ab1c1` (`Merge Meta
CAPI observability patch`). It adds a manual-only historical Meta Ads backfill
workflow. It does not run the workflow, call Meta, or modify Production data.

## Files changed

- `.github/workflows/meta-ads-historical-backfill.yml`
- `tests/meta-ads-historical-backfill-workflow.test.cjs`
- `reports/meta-ads/2026-09-04-historical-date-scoped-backfill-github-actions.md`

## Workflow inputs and date design

The workflow is `workflow_dispatch` only. It has required string inputs:

| Input | Default | Meaning |
| --- | --- | --- |
| `since` | `2026-08-01` | First inclusive calendar date |
| `until` | `2026-08-31` | Last inclusive calendar date |

It validates each input as a real `YYYY-MM-DD` date, rejects an inverted range,
and enumerates dates with `Date` plus `setUTCDate`. The runner timezone cannot
change the generated calendar dates.

For each date `D`, it invokes exactly:

```text
node scripts/meta-ads-sync.js --since D --until D
node scripts/meta-ads-analytics-sync.js --since D --until D --datasets demographics --demographics-stage age_gender --granularity daily
```

The baseline and demographics collectors therefore each make an independent,
single-calendar-date Meta Insights request. A successful zero-row collector
result is summarized as zero rows and the loop continues. A collector API,
authentication, normalization, or Supabase write failure terminates the job.

## Idempotency and safety

The workflow uses the existing collectors unchanged. Their existing deterministic
`insight_key` upsert behavior is retained. No tables are truncated, no rows are
deleted, no alternative keys are created, and `2026-08-26` is not specially
targeted or rewritten by the workflow.

Only existing GitHub Actions secrets are mapped to the job environment:

- `META_AD_ACCOUNT_ID`
- `META_ACCESS_TOKEN`
- `META_API_VERSION`
- `META_ADS_SUPABASE_URL`
- `META_ADS_SUPABASE_SERVICE_ROLE_KEY`

Collector stdout/stderr is captured. The only normal per-date log line is a
safe JSON summary containing date plus baseline and demographics rows read and
written. Failure output is limited to the collector and date that failed; no
credentials or raw payloads are logged by the workflow.

## Validation

Completed on the review branch:

```text
npm ci
node --test tests/meta-ads-sync-core.test.cjs
node tests/meta-ads-scheduled-workflow.test.cjs
node tests/meta-ads-historical-backfill-workflow.test.cjs
node --check scripts/meta-ads-sync.js
node --check scripts/meta-ads-analytics-sync.js
git diff --check
```

All checks passed. The new contract test verifies manual dispatch only, default
inputs, required secret mappings, UTC date iteration, one-date-at-a-time
baseline and demographics invocations, safe summary fields, and no scheduled
trigger or application-server invocation.

## Promotion record

- Review branch: `meta-ads-historical-backfill-production`
- Origin/main base SHA: `42ab1c1`
- Workflow implementation commit SHA: recorded after commit in the review handoff
- No merge to `main` was performed.
- No production data was modified.
- Owner must approve the review branch, merge it, and manually run the workflow.

## Required final status

| Check | Result |
| --- | --- |
| Historical backfill workflow created | YES |
| Date-scoped baseline | YES |
| Date-scoped demographics | YES |
| Existing Aug 26 data preserved | YES |
| Production app changed | NO |
| Production data modified | NO |
| Backfill executed | NO |
| Main modified | NO |
| Owner manual run required | YES |
