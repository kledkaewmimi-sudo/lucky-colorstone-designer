# Lucky Colorstone Existing Tools Inventory Audit

Audit date: 2026-10-23 Asia/Bangkok
Scope: repository-wide read-only audit
Production deployment: none
Business/data modifications: none
Existing tools deleted, moved, or rewritten: none

## Executive Summary

The repository contains substantial QA value, but it is spread across canonical tests, phase reports, candidate snapshots, temporary scripts, operational migration scripts, and archived worktrees.

The primary conclusion is:

- **614 primary QA/operations tool files** were discovered outside generated dependency/build directories.
- These contain **613 unique file contents**; only one exact duplicate pair exists among primary tools.
- **190 executable files are under the canonical `tests/` tree**: 117 Node tests, 17 Playwright specs, and 56 support, fixture, gallery, and browser-harness modules.
- **392 report-scoped tools** exist under `tools/`, `_tools`, `_analysis`, `*-tools`, or as ad hoc production `_*.cjs/.mjs` scripts.
- Another **10,357 executable-looking files** are mirrored or snapshot copies in `.local-candidates`, `.worktrees`, nested candidate directories, or release evidence. These should not be treated as independent tools.
- Only **57/190** executable files under `tests/` are tracked by Git.
- Only **44/392** report-scoped tools are tracked by Git.
- The root `package.json` has no test, lint, QA, or browser scripts. It exposes only `npm start`.
- The only GitHub Actions workflow tests Meta Ads ingestion; the customer funnel, CRM, catalog, layout, checkout, security, and deployment gates are not enforced in CI.
- A syntax scan of 607 primary JavaScript-family tools found **605 pass / 2 fail**.
- A targeted canonical test run found **7 failures across 21 tests in five suites**. A repository-wide Node test discovery did not complete as a clean one-command gate and was stopped after more than three minutes.

The immediate recommendation is to create one machine-readable registry and a small set of stable commands before adding more phase-specific scripts.

## Counting Method

### Included as primary tools

- All executable files under `tests/`.
- All executable files under `scripts/`.
- `luckyvault/` CLI and tests.
- `.github/workflows/`.
- Top-level `tmp-*.cjs` utilities.
- Report scripts under `tools/`, `_tools`, `_analysis`, `*-tools`, or production `_*.cjs/.mjs` utility files.

### Counted separately as mirrors or snapshots

- `.local-candidates/`.
- `.worktrees/`.
- Nested `reconciled-candidate/`, `merged-candidate/`, `candidate-baseline-*`, and release evidence trees.
- `tiktok-pixel-events-api-clean/` and `tiktok-pixel-events-api-production/`.

### Excluded from tool counts

- `node_modules/`, `.git/`, build output under `.vercel/output/`, static runtime source, product assets, catalog JSON, screenshots, logs, and persisted business data.

The category counts below are primary-category assignments using path and capability keywords. Canonical tests can cover more than one capability, so a separate overlapping coverage view is also provided.

## Total Discovered Tool Count

| Measure | Count |
| --- | ---: |
| Executable candidates across selected source/report/snapshot roots | 16,572 |
| Primary QA/operations tools | **614** |
| Unique primary file contents | 613 |
| Exact duplicate primary copies | 1 extra copy |
| Mirrored/snapshot executable files | 10,357 |
| Canonical `tests/` executable files | 190 |
| Node test files (`*.test.mjs` / `*.test.cjs`) | 117 |
| Playwright specs (`*.spec.mjs`) | 17 |
| Test support, fixtures, servers, gallery, and browser helpers | 56 |
| Canonical reusable operations scripts under `scripts/` | 16 |
| LuckyVault CLI and test files | 2 |
| CI workflow files | 1 |
| Top-level temporary tools (`tmp-*.cjs`) | 13 |
| Report-scoped tools | 392 |
| Syntax failures in primary JS-family tools | 2 |
| Primary tools modified since 2026-09-23 | 536 |

## Tool Categories and Counts

| Category | Primary tools | Notes |
| --- | ---: | --- |
| Catalog | 30 | Stones, charms, spacers, badges, product records, Thai text and category checks |
| CRM | 37 | Orders, inventory, purchases, shipping, cost snapshots, CRM save harnesses |
| Layout | 48 | Geometry, fit, mixed sizes, slot retention, pendant placement, layout ordering |
| Bracelet Rendering | 150 | Lumi, visual/gallery, screenshot, viewport, CTA, onboarding, render diagnostics |
| Checkout | 10 | Stripe/payment contracts, checkout fit, order totals, pricing |
| Backend | 43 | API/server, Supabase, analytics, Meta Ads, webhook, health, backup |
| Security | 51 | LINE auth, LIFF, session/CSRF, access control, secrets, exposure, security suites |
| Deployment | 73 | Provenance, artifact integrity, stage/live checks, Vercel, rollback |
| Cross-cutting / General QA | 172 | Performance, source-diff, call-site tracing, one-off investigation utilities |
| **Total** | **614** | |

### Canonical test capability coverage — overlapping

| Capability | Matching canonical files |
| --- | ---: |
| Catalog | 11 |
| CRM | 5 |
| Layout / geometry / funnel safety | 31 |
| Bracelet rendering / Lumi / browser visuals | 122 |
| Checkout / price / cost | 3 |
| Backend / API / analytics / Meta | 17 |
| Security / auth / identity | 19 |
| Deployment / live smoke / release | 5 |

The overlap is intentional: one browser test can cover layout, catalog, authentication, and Step 4 navigation.

## Reusable Tools

### Tier 1 — Recommended canonical tools

| Tool | Category | Purpose | Command | Dependencies / risk |
| --- | --- | --- | --- | --- |
| `tests/thai-text-integrity.test.mjs` | Catalog / Data integrity | Exact Thai literal and malformed-text checks | `node --test tests/thai-text-integrity.test.mjs` | Node only; currently untracked |
| `tests/catalog-polling-option-e.test.mjs` | Catalog / Backend | Catalog refresh and polling behavior | `node --test tests/catalog-polling-option-e.test.mjs` | Node only; currently modified in worktree |
| `tests/product-card-badges-uat.test.mjs` | Catalog | Product badge behavior | `node --test tests/product-card-badges-uat.test.mjs` | Node only |
| `tests/crm-order-details.test.mjs` | CRM | CRM order-card projection and saved preview | `node --test tests/crm-order-details.test.mjs` | Node only |
| `tests/crm-order-cost-snapshot.test.cjs` | CRM / Checkout | Cost snapshot semantics | `node --test tests/crm-order-cost-snapshot.test.cjs` | Node only |
| `tests/customer-funnel-navigation-safety.test.mjs` | Layout / Checkout / Security | Step 3 completion, Step 4 transition, checkout authority | `node --test tests/customer-funnel-navigation-safety.test.mjs` | Static source-contract checks; no payment |
| `tests/mixed-size-geometry.test.mjs` | Layout / Rendering | Mixed bead geometry and fit invariants | `node --test tests/mixed-size-geometry.test.mjs` | CPU-heavy but deterministic |
| `tests/lumi/step3-onboarding-full-flow.spec.mjs` | Rendering | Full Landing → Step 4 browser journey | `node node_modules/@playwright/test/cli.js test tests/lumi/step3-onboarding-full-flow.spec.mjs --workers=1 --timeout=180000` | Playwright, browsers; optional `LUMI_GATE_URL` live mode |
| `tests/line-auth-browser-reproduction.spec.mjs` | Security / Authentication | Landing-to-LIFF start flow | `node tests/line-auth-browser-reproduction.spec.mjs` | Playwright; hardcoded Windows Chrome path |
| `tests/lumi/browser-fixtures/server.mjs` | Rendering support | Static Lumi harness server | `node tests/lumi/browser-fixtures/server.mjs` | Fixed port 4173 |
| `tests/lumi/gallery/server.mjs` | Rendering support | Static app + API fixture server | `node tests/lumi/gallery/server.mjs` | Fixed port 4174 |
| `tests/meta-ads-manual-worker.test.cjs` | Backend | Meta manual worker validation | `node --test tests/meta-ads-manual-worker.test.cjs` | Active in CI |
| `reports/production/production-bugfix-batch-20261011/tools/crm-charm-save-harness.mjs` | CRM / Security | Synthetic authenticated CRM charm save contract | `node reports/production/production-bugfix-batch-20261011/tools/crm-charm-save-harness.mjs` | Spawns local backend; no production writes |
| `reports/production/production-bugfix-batch-20261012/tools/run-security-suites.mjs` | Security | Runs nine hardened security suites | `node reports/production/production-bugfix-batch-20261012/tools/run-security-suites.mjs` | Requires `LCS_BASELINE_DIR`; hardcoded default |
| `reports/production/production-bugfix-batch-20261012/tools/artifact-fingerprint.mjs` | Deployment | Deterministic artifact fingerprint | `node reports/production/production-bugfix-batch-20261012/tools/artifact-fingerprint.mjs <artifactDir> --json` | Node only; reusable |
| `reports/uat/phase2-28-tools/release-integrity-audit.mjs` | Deployment | Compare candidate and release artifacts | `node reports/uat/phase2-28-tools/release-integrity-audit.mjs` | Hardcoded Phase 2.27/2.28 paths and expected files |
| `reports/uat/phase2-28-tools/verify-protected-stage.mjs` | Deployment | Hash-check protected staged artifact | `node reports/uat/phase2-28-tools/verify-protected-stage.mjs <stage-url>` | Vercel CLI; candidate path hardcoded |
| `reports/uat/phase2-28-tools/badge-acceptance.mjs` | Catalog / Rendering | Mobile/desktop badge acceptance | `node reports/uat/phase2-28-tools/badge-acceptance.mjs <static-url> <api-url> <out-dir>` | Playwright and optional OIDC |
| `reports/production/phase2-29b-production-layout-order-sync-20261023-1101/tools/fixture-dynamic-order.mjs` | Layout / CRM | Authenticated reorder/save/reload/restore test | `node <path>/fixture-dynamic-order.mjs` | Live read-only catalog/settings plus local mutable fixture |
| `reports/production/phase2-29b-production-layout-order-sync-20261023-1101/tools/verify-production-order.mjs` | Layout / Deployment | Final customer order and refresh verification | `node <path>/verify-production-order.mjs` | Playwright; live reads; LIFF QA bypass |
| `luckyvault/luckyvault.ps1` | Backend / Recovery | Backup and restore verification wrapper | `powershell -File luckyvault/luckyvault.ps1 status` | PowerShell, PostgreSQL 17 client/server; secrets env-only |

### Tier 2 — Reusable after consolidation

- Facebook/Meta ingestion: `scripts/meta-ads-*.js`, `scripts/lib/meta-ads-sync-core.js`, `.github/workflows/meta-ads-scheduled-ingestion.yml`.
- Shared artifact/provenance checks: repeated `production-provenance-audit.mjs` and `artifact-integrity-audit.mjs`.
- Browser fixture servers: two `server.mjs` files and many phase-local API mocks.
- Visual capture/contact sheets: `tests/lumi/gallery/*` and repeated `capture*.mjs` scripts.
- Deployment stage checks: `staged-release-check.mjs`, `verify-protected-stage.mjs`, `release-integrity-audit.mjs`.
- Thai validation: root integrity test plus `check-thai-sources.mjs`, `verify-thai-literals.mjs`, `thai-integrity.mjs`, and `tmp-thai-verify.cjs`.
- Security: `_hf-*` suites plus `run-security-suites.mjs`.
- LuckyVault wrapper: reusable, but must remain environment-driven and Level 1/2/3 claims must remain distinct.

## Tools Reused Across Multiple Phases

Exact-content reuse is low, but conceptual duplication is high.

| Reused tool/pattern | Phases / locations | Assessment |
| --- | --- | --- |
| `production-provenance-audit.mjs` | 6 copies from Phase 2.24B through 2.27 | Consolidate into one parameterized provenance tool |
| `artifact-integrity-audit.mjs` | 5 copies from Phase 2.24B through 2.26d | Consolidate |
| `crm-charm-save-harness.mjs` | Production bugfix batches 2026-10-11 and 10-12 | Promote one canonical authenticated harness |
| `lucky-coverage-matrix.mjs` | Same two production batches | Near-repeat; parameterize fixture |
| `run-security-suites.mjs` | Same two production batches | Keep one canonical suite runner |
| `post-release-domain-check.mjs` | Phase 2.25 and 2.26 | Consolidate |
| `release-integrity-audit.mjs` | Phase 2.27 and 2.28 | Parameterize candidate/release directories |
| `verify-production-customer.mjs` | Phase 2.29 and 2.29B | Exact duplicate; promote to canonical browser smoke |
| Local static/API server pattern | At least 280 scripts under `tests/` and `reports/` contain server or Playwright setup code | Strong candidate for shared `qa/lib` |
| Browser launch pattern | At least 190 scripts launch Chromium/WebKit directly | Standardize context, viewport, LIFF mock, and diagnostics |
| SHA-256 artifact verification | At least 215 scripts use SHA-256 checks | Standardize manifest and evidence output |
| Environment-dependent tooling | At least 160 files reference secrets/provider environment variables | Registry must mark required env and write permissions |

## Duplicated / Obsolete Candidates

### Exact duplicates

Only one exact duplicate group exists among primary tools:

- `phase2-29-production-layout-banner-20261023-0943/tools/verify-production-customer.mjs`
- `phase2-29b-production-layout-order-sync-20261023-1101/tools/verify-production-customer.mjs`

### Repeated basenames

- 6 copies of `production-provenance-audit.mjs`.
- 5 copies of `artifact-integrity-audit.mjs`.
- 2 copies each of:
  - `server.mjs`
  - `verify-production-customer.mjs`
  - `verify-stage.mjs`
  - `crm-charm-save-harness.mjs`
  - `lucky-coverage-matrix.mjs`
  - `run-security-suites.mjs`
  - `post-release-domain-check.mjs`
  - `release-integrity-audit.mjs`

### Phase-specific and low-reuse

- All 392 report-scoped tools are phase-specific unless registered.
- 13 top-level `tmp-*.cjs` files are ad hoc analysis utilities.
- Candidate directories contain 2,335 executable files; worktrees contain 1,459.
- Many report tools hardcode phase names, candidate paths, expected hashes, fixed dates, or output locations.

### Stale or unsafe examples

- `README.md` documents `npm run dev`, but `package.json` has no `dev` script.
- `reports/production/production-bugfix-batch-20261012/playwright.config.mjs` uses an absolute path to its `reconciled-candidate` and is not a repository-level config.
- `reports/production/production-bugfix-batch-20261012/tools/post-deploy-verify-turn9-2.mjs` contains fixed historical hashes and is not reusable as-is.
- `tests/line-auth-browser-reproduction.spec.mjs` hardcodes `C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`.
- `scripts/migrate-json-to-supabase.js` and `scripts/update-category-labels.js` depend on `@supabase/supabase-js`; `npm ls @supabase/supabase-js --depth=0` reports it is not installed.
- Several root analytics tests require an isolated UAT backend environment and fail when run directly without `APP_ENV=uat`, `UAT_BACKEND=true`, and UAT Supabase variables.
- `scripts/complete-ord-266992-cost-snapshot.js`, `scripts/write-approved-historical-cost-snapshots.js`, and similar scripts are one-off data mutations, not general QA tools.

## Broken / Unreliable Tools

### Syntax failures

Two of 607 checked JavaScript-family primary tools fail `node --check`:

1. `reports/production/_audit-callers.cjs`
   - Invalid regular-expression flags caused by an unescaped `/api/analytics/` token.
2. `reports/production/_v2-customer-callsites.cjs`
   - ES module `import` syntax in a `.cjs` file.

### Targeted canonical test run

A targeted run of five canonical files executed 21 tests:

- 14 passed.
- 7 failed.

Observed failures:

- `tests/beryl-visuals.test.mjs` — duplicate declarations in its constructed data module.
- `tests/lumi/compatible-mode-fallback.test.mjs` — 3 assertion/API-contract failures.
- `tests/lumi/composition-diagnostics.test.mjs` — bounded-attempt assertion failure.
- `tests/lumi/customer-profile.test.mjs` — 2 goal validation/deduplication contract failures.

The broad Node test discovery also surfaced additional Lumi contract failures and did not complete as a clean gate within three minutes. These results reflect the current dirty workspace and must be triaged against `HEAD` before being labelled production regressions.

### Environment-gated, not necessarily broken

- `tests/analytics-v2-server.test.mjs`
- `tests/analytics-visitor-summary.test.mjs`

These fail without the isolated UAT backend contract and should be explicitly environment-tagged rather than discovered by the default local test command.

## Actively Maintained / Current

Highest-confidence current tools:

- `tests/meta-ads-manual-worker.test.cjs` — referenced by GitHub Actions.
- `tests/thai-text-integrity.test.mjs` — directly aligned with AGENTS Thai-integrity policy.
- `tests/lumi/step3-onboarding-full-flow.spec.mjs` — has documented local/live run instructions.
- `tests/customer-funnel-navigation-safety.test.mjs` — current cross-cutting funnel/checkout contract.
- `luckyvault/luckyvault.ps1` — has dedicated docs and offline tests.
- Phase 2.28/2.29 deployment and badge tools — recently used, but still untracked and phase-named.

“Recently modified” is not proof of maintenance. The registry should record an explicit owner, last verified date, and a known passing command.

## Missing Coverage / Infrastructure Gaps

1. No root-level `npm test` or per-suite package scripts.
2. No root Playwright configuration and no single browser-test entry point.
3. No CI for customer funnel, CRM, layout order, catalog categories, Thai text, checkout authority, or security suites.
4. No machine-readable mapping from regression risk to canonical test.
5. No shared stop/start infrastructure for local servers and API mocks.
6. No shared browser context helper for line/LIFF, onboarding, OIDC bypass, and diagnostics.
7. No standard evidence schema across tools.
8. No checked-in canonical test for the Phase 2.29B merged cross-table layout-order behavior.
9. No automated inventory/CMS-to-customer round-trip test.
10. No automated asset/404 check in CI.
11. No coverage reporting or performance budget.
12. No quarantine list for broken or environment-specific tests.
13. No policy for promoting a phase tool into a permanent test.
14. No drift detection for hardcoded branch, candidate, deployment, alias, or date references.

## Recommended Permanent QA Architecture

### Proposed structure

```text
qa/
  registry.json
  playwright.config.mjs
  lib/
    api-fixtures.mjs
    browser-context.mjs
    evidence.mjs
    file-hash.mjs
    static-server.mjs
    candidate-resolver.mjs
  runners/
    run-suite.mjs
    doctor.mjs
    find-tools.mjs
    promote-phase-tool.mjs
  suites/
    unit.json
    catalog.json
    crm.json
    layout.json
    browser.json
    checkout.json
    backend.json
    security.json
    deployment.json
    live-readonly.json
```

### Registry fields

```json
{
  "id": "layout.customer-order-sync",
  "category": "layout",
  "title": "CRM Layout order reflected in customer Step 3",
  "status": "active",
  "canonicalPath": "tests/browser/layout/customer-order-sync.spec.mjs",
  "command": "npm run test:layout:order-sync",
  "modes": ["fixture", "live-readonly"],
  "requiredEnv": [],
  "writes": "none",
  "network": "fixture-only",
  "browsers": ["chromium", "webkit"],
  "fixtures": ["live-catalog-snapshot", "authenticated-crm-mock"],
  "evidence": "reports/qa/layout/order-sync/latest.json",
  "owner": "catalog-layout",
  "lastVerified": "2026-10-23",
  "supersedes": [],
  "risk": "medium"
}
```

### Required command surface

```text
npm test
npm run test:unit
npm run test:catalog
npm run test:crm
npm run test:layout
npm run test:browser
npm run test:checkout
npm run test:backend
npm run test:security
npm run test:deploy
npm run qa:doctor
npm run qa:find -- --category layout --tag order
npm run qa:run -- layout.customer-order-sync --mode fixture
```

### Safety tiers

| Tier | Allowed behavior | Default |
| --- | --- | --- |
| `none` | Static/unit checks; no network writes | Yes |
| `fixture` | Local mutable fixtures and mocks | Yes |
| `remote-read` | GET-only calls to live/approved environments | Explicit |
| `remote-write-approved` | Authenticated writes only after owner approval | Never automatic |

The registry must reject or sharply warn when a tool marked `remote-write-approved` is invoked without an explicit mode and confirmation.

## Proposed AGENTS.md Reuse Policy

Add this after the Verification section:

```markdown
## QA Tool Reuse and Registry Policy

Before implementing a bug fix, feature, migration, or release:

1. Read `qa/registry.json`.
2. Search by category, symptom, changed files, and tags.
3. Prefer the canonical registered tool over copying a phase-specific script.
4. If a canonical tool needs extension, modify that tool and update its tests.
5. Do not copy an entire `reports/**/tools` script into another phase.
6. A new phase tool must declare:
   - category
   - intended use
   - command and arguments
   - required environment
   - whether it writes to fixtures, remote systems, or production
   - fixtures and evidence path
7. Tools that write to Production are never run by default and require
   explicit owner approval for that execution.
8. At task completion, either:
   - promote a reusable phase tool into `tests/` or `qa/lib`, or
   - mark it as investigation-only in the report.
9. Run `npm run qa:doctor` and the narrowest registered suite before deployment.
10. Never claim PASS from UI text or a saved banner; use the registered
    persistence and customer-facing verification tool.
```

## How Codex/DeepSeek Should Automatically Discover Tools

1. Load `qa/registry.json` during task bootstrap.
2. Match the request against `category`, `tags`, `pathsOwned`, and `failureSignatures`.
3. Display the best canonical and related tools before editing.
4. Refuse to create a new tool when an active canonical tool covers the same purpose unless the task explains why reuse is insufficient.
5. Run `qa:doctor` to validate Node, Playwright browsers, provider CLIs, required environment variables, and protected-stage credentials.
6. Choose the least-privileged mode: static → fixture → remote-read → approved remote write.
7. Store structured evidence with tool ID, command, git SHA, worktree state, environment, inputs, assertions, screenshots, and result.
8. After the task, propose registry additions or promotions for new reusable tools.
9. Validate the registry in CI and fail pull requests with duplicate canonical IDs, invalid paths, missing commands, or undeclared write scope.

## Priority and Next Implementation Steps

### P0 — establish control

1. Create `qa/registry.json` with the Tier 1 tools above.
2. Add safe package scripts: `test:unit`, `test:browser`, `qa:doctor`, and category suites.
3. Add a root Playwright config and remove candidate-specific assumptions from it.
4. Quarantine the two syntax-broken tools and known failing stale suites without deleting them.
5. Promote Phase 2.29B order-sync fixture and production order verification into canonical tracked tests.
6. Add Thai-integrity and customer-funnel smoke checks to CI.

### P1 — consolidate common infrastructure

1. Replace repeated local static servers with `qa/lib/static-server.mjs`.
2. Replace repeated API mocks with `qa/lib/api-fixtures.mjs`.
3. Standardize browser/LIFF/context setup.
4. Standardize evidence and SHA-256 manifests.
5. Consolidate provenance and artifact-integrity tools.
6. Consolidate Thai-text checks into one parameterized checker.

### P2 — reduce archival ambiguity

1. Mark candidate/worktree directories as immutable snapshots, not tools.
2. Add a `reports/README` index generated from report metadata.
3. Retire top-level `tmp-*` scripts after moving any useful logic into canonical tools.
4. Keep one-off migration/backfill scripts separate from QA tooling and require dry-run plus explicit confirmation.
5. Add a quarterly stale-tool and duplicate review.

## Audit Limitations / Risks

- The worktree is heavily dirty and contains untracked tests/tools; audit results describe the current workspace, not a clean `HEAD`.
- Category counts are path/capability heuristics, not semantic ownership.
- The complete Node test discovery did not finish as a stable one-command gate.
- No Production deployment, migration, data write, backup, or destructive action was performed.

## Final Verdict

**The repository already has enough reusable automation to support a strong QA system. The main problem is not missing tools; it is missing canonicalization, provenance, environment contracts, and CI enforcement.**
