# Meta Ads GitHub Actions — clean Production promotion

## Base and branch

- Remote base: `origin/main` at `8d2823c3fef6aebe5a138c74bf9e9ed1f482d908`
- Clean branch: `meta-ads-github-actions-production`
- Branch was created directly from `origin/main`, not from `uat`
- Runtime/workflow promotion commit: `4bd4864ff41574138f27e4a3fd7238351c78de18`

`uat` and `origin/main` were divergent, so no merge, rebase, force push, or direct push to main was used.

## Runtime dependency closure

The Production workflow starts only:

```text
node scripts/meta-ads-scheduled-worker.js --job scheduled
```

The worker uses Node built-ins (`fs`, `os`, `path`, `child_process`, `Intl`) and starts only these isolated collectors:

1. `scripts/meta-ads-sync.js` — hourly baseline Meta Insights read and idempotent upsert to `meta_ads_hourly_performance_insights`.
2. `scripts/meta-ads-analytics-sync.js` — daily `demographics` / `age_gender` read and idempotent upsert to `meta_ads_daily_demographics`.
3. `scripts/lib/meta-ads-sync-core.js` — shared parsing, timezone conversion, request construction, payload normalization, pagination/rate-limit helpers, and Supabase upsert request creation.

No additional application module is imported. The repository’s existing `package.json` and valid lockfile already exist on `origin/main`; the promoted scripts require no new package. The workflow uses Node 20 (compatible with `engines.node >=18`) and `npm ci`.

Production Ads tables were reported as already created and are not runtime inputs as files. No Supabase migration was promoted. The core test was made self-contained by asserting the established baseline column contract instead of reading an unneeded migration file.

## Candidate history audit

| Commit | Subject | Required files / decision |
| --- | --- | --- |
| `d07b532` | Add isolated Meta Ads hourly ingestion | Runtime foundation; included final files, not its report/migration. |
| `784aeee` | Expand isolated Meta Ads analytics datasets | Required analytics collector/core final state; reports/migration excluded. |
| `00f5d8f` | Separate Meta hourly performance baseline | Required baseline final state; report/migration excluded. |
| `590e436`, `6067822`, `943d471`, `149ad4f` | Meta request/compatibility fixes | Required final runtime behavior; documentation-only changes excluded. |
| `90ac4eb` | Support daily Meta demographics grain | Required daily normalizer/routing; migration excluded because Production table exists. |
| `c937874` | Match Meta baseline payload to performance schema | Required payload fix; report excluded. |
| `cf223fb` | Add isolated Meta Ads scheduler worker | Required worker/test final state. |
| `fa55040` | GitHub Actions scheduler | Required workflow/test final state; prior Render-deprecation report excluded. |
| `97f8330` | GitHub Actions scheduler report | Documentation only; not needed to run Production workflow. |

These historical commits mixed Meta code with reports and, in several cases, migrations. Rather than cherry-picking them one by one, their final required file state was reconstructed as one clean, Meta-only commit on top of `origin/main`. No candidate commit touched frontend, CRM, Orders, Stripe/payment, server runtime, catalog, inventory, renderer, Vercel, or Render web-service configuration.

## Promoted paths

```text
A  .github/workflows/meta-ads-scheduled-ingestion.yml
A  scripts/lib/meta-ads-sync-core.js
A  scripts/meta-ads-analytics-sync.js
A  scripts/meta-ads-scheduled-worker.js
A  scripts/meta-ads-sync.js
A  tests/meta-ads-scheduled-worker.test.cjs
A  tests/meta-ads-scheduled-workflow.test.cjs
A  tests/meta-ads-sync-core.test.cjs
```

The workflow has `cron: '5 * * * *'`, `workflow_dispatch`, `permissions: contents: read`, and concurrency group `meta-ads-scheduled-ingestion` with `cancel-in-progress: false`. It maps only the five expected GitHub secrets and calls no `server.js`, Render command, deployment command, frontend, CRM, or application API.

## Verification

Passed in the clean Production-based worktree:

```text
npm.cmd ci
node --check scripts/meta-ads-sync.js
node --check scripts/meta-ads-analytics-sync.js
node --check scripts/meta-ads-scheduled-worker.js
node --test tests/meta-ads-sync-core.test.cjs
node --test tests/meta-ads-scheduled-worker.test.cjs
node --test tests/meta-ads-scheduled-workflow.test.cjs
```

`npm.cmd ci` installed 80 packages successfully. It reported the existing dependency audit result (4 vulnerabilities: 3 moderate, 1 high) and a pending optional `sharp` install-script approval; neither is introduced by this promotion and the Meta worker uses no `sharp` dependency.

`tests/uat-frontend-safety.test.cjs` is absent on `origin/main`, so it could not be run from this clean production-based branch. It was not copied from UAT because that would broaden the promotion beyond the isolated Meta subsystem. The promoted workflow contract test confirms the isolated worker path, schedule, dispatch trigger, permissions, concurrency, secrets mapping, no literal-secret pattern, no `server.js`, and no Render invocation.

Targeted committed-content scan found no access-token or service-role-key literal. No secret was printed or committed.

## Promotion status

- Workflow file present on clean branch: **YES**
- Feature branch pushed: **YES** — `origin/meta-ads-github-actions-production` at `cb9f855735559b62347089f9bd9238899c8ca060`
- `main` modified: **NO**
- Frontend affected: **NO**
- CRM affected: **NO**
- Orders affected: **NO**
- Stripe affected: **NO**
- Existing application tables affected: **NO**

Do not merge this branch into main until owner approval.
