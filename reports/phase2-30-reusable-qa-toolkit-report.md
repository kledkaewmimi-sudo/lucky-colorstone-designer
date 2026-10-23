# Lucky Colorstone Phase 2.30 — Reusable QA Toolkit

Date: 2026-10-23 Asia/Bangkok
Mode: local implementation and verification
Production deployment: none
Production business data modified: none
Supabase or Render changes: none
Real payments or customer orders: none

## Status

**PASS — local toolkit implemented and verified.**

The repository now has:

- A machine-readable QA registry.
- Stable category commands in `package.json`.
- A registry search command.
- A QA environment doctor.
- Curated catalog, CRM, layout, browser, checkout, and security suites.
- Promoted Phase 2.29/2.29B browser coverage without historical candidate paths.
- Generic local artifact-integrity verification.
- A read-only Production smoke command.
- Explicit quarantine records for unreliable historical suites.
- An AGENTS reuse policy.
- A curated GitHub Actions baseline.

No Production deployment or external write was performed.

## Tools Promoted

### Phase 2.29 / 2.29B CRM and customer ordering

Promoted to:

- `qa/tests/crm-catalog-browser.test.mjs`

This consolidates existing phase evidence into canonical coverage for:

- CRM Layout → Customer Step 3 order synchronization.
- Cross-table spacer/charm merged ordering.
- Save Layout and CRM reload.
- CRM Inventory Save.
- Banner preset creation, assignment, edit, persistence, and no-banner behavior.
- Mobile and desktop customer cards.
- No page, console, or mock HTTP errors.

The promoted test no longer embeds a historical candidate path. It resolves:

1. `QA_APP_ROOT`, when provided.
2. The current repository when it contains current QA markers.
3. The newest local production candidate containing those markers.
4. The repository root as the generic fallback.

### Step 3 → Step 4 browser smoke

Promoted to:

- `qa/tests/step3-step4-smoke.test.mjs`

Coverage:

- Mobile 390px and desktop 1440px.
- Landing → Step 1 → Step 2 → Step 3.
- Lucky design acceptance or manual completion.
- Step 4 rendering boundary.
- Page/console error checks.

### Artifact integrity

Promoted and generalized from historical artifact/provenance scripts:

- `qa/tools/artifact-integrity.mjs`
- `qa/lib/file-hash.mjs`

It verifies:

- Required source files and built static files.
- Source-to-built SHA-256 equality.
- Required pendant assets.
- Exclusion of server files and environment files.
- Aggregate build fingerprint.

### Protected staged artifact integrity

Promoted to:

- `qa/tools/staged-artifact.mjs`

It compares a protected `*.vercel.app` staged deployment with the current built
candidate without promoting, aliasing, or modifying it. Verified against the
current Phase 2.29B staged deployment: 7/7 files matched.

### Production read-only checks

Promoted to:

- `qa/tools/production-readonly.mjs`

Coverage:

- Customer and CRM domain availability.
- Public catalog/settings APIs.
- Anonymous CRM access remains blocked.
- Settings JSON shape and duplicate-free layout arrays.
- Required Heart/Star pendant assets.
- No writes.

### Shared browser/static-server infrastructure

Added:

- `qa/lib/app-root.mjs`
- `qa/lib/browser-fixtures.mjs`
- `qa/lib/evidence.mjs`
- `qa/lib/file-hash.mjs`
- `qa/lib/registry.mjs`
- `qa/lib/static-server.mjs`

This consolidates repeated fixture-server, browser context, JSON evidence, and hashing logic rather than creating another phase-local copy.

## Tools Reused

| Product area | Reused canonical tools |
| --- | --- |
| Catalog | Catalog polling, CL01, product badges, Mallow/Pony, Thai integrity |
| CRM | CRM order details, cost snapshots, snapshot persistence |
| Layout | Customer funnel safety, mixed geometry, Landing → Step 1 |
| Rendering | Promoted CRM/catalog workflow, Step 3 → Step 4 smoke |
| Checkout | Fit tolerance, mixed pricing, funnel/checkout authority |
| Security | LINE callback, identity, OA friendship, UAT integration guards |
| Deployment | Artifact integrity, Production read-only verification |

The promoted browser workflow retains the Phase 2.29/2.29B behavior while removing Phase-specific paths.

Archival report tools were not moved, deleted, or rewritten.

## QA Registry

Created:

- `qa/registry.json`
- `qa/README.md`
- `qa/quarantine.json`

Registry totals:

| Status | Count |
| --- | ---: |
| Active | 22 |
| Quarantined | 3 |
| Environment-gated | 1 |
| **Total** | **26** |

Each active entry includes:

- Canonical path.
- Purpose and category.
- Stable command.
- Dependencies.
- Required environment.
- Safety level, write scope, and network scope.
- Known status and last verification.
- Product areas.
- Tags and suite membership.
- Evidence location.

## New Executable Commands

Added to `package.json`:

| Command | Result |
| --- | --- |
| `npm run qa:doctor` | PASS — 24 checks |
| `npm run qa:find -- --category layout --tag order` | PASS — finds `browser.crm-catalog-workflow` |
| `npm run test:catalog` | PASS — 27 assertions |
| `npm run test:crm` | PASS — 19 assertions |
| `npm run test:layout` | PASS — 50 Node assertions + 30 promoted browser checks |
| `npm run test:browser` | PASS — 30 CRM/catalog checks + Step 4 at 390px/1440px |
| `npm run test:checkout` | PASS — 53 assertions |
| `npm run test:security` | PASS — 29 assertions |
| `npm run qa:predeploy` | PASS — 133 Node assertions, 30 browser checks, 39 artifact checks |
| `npm run qa:production` | PASS — 22 read-only checks |

On Windows systems where PowerShell execution policy blocks `npm.ps1`,
`npm.cmd run <script>` is the equivalent working invocation.

## Verification Evidence

- `reports/qa/doctor/latest.json`
- `reports/qa/catalog/latest.json`
- `reports/qa/crm/latest.json`
- `reports/qa/layout/latest.json`
- `reports/qa/browser/latest.json`
- `reports/qa/browser/browser-acceptance.json`
- `reports/qa/browser/step3-step4-smoke.json`
- `reports/qa/checkout/latest.json`
- `reports/qa/security/latest.json`
- `reports/qa/all/latest.json`
- `reports/qa/deployment/artifact-integrity.json`
- `reports/qa/deployment/staged-artifact.json`
- `reports/qa/deployment/predeploy-latest.json`
- `reports/qa/production/latest.json`

## Reliability Triage

### Confirmed current regressions

No new application regression was confirmed by the curated suites.

### Outdated tests

`tests/mixed-size-ux.test.mjs`

- 3 failed source-string assertions.
- The same failures occur against a clean `HEAD` archive.
- Quarantined; application behavior was not changed to satisfy stale strings.

`tests/lumi/step3-onboarding-full-flow.spec.mjs`

- Timed out waiting for onboarding completion in the current dirty worktree.
- The file is untracked and not part of clean `HEAD`.
- Quarantined from the baseline browser gate.

### Environment-dependent tests

`tests/analytics-v2-server.test.mjs`
`tests/analytics-visitor-summary.test.mjs`

- Fail closed without:
  - `APP_ENV=uat`
  - `UAT_BACKEND=true`
  - UAT Supabase URL, key, and project reference
- Marked `environment-gated`; excluded from local/CI baseline.

### Broken scripts/tests

`tests/beryl-visuals.test.mjs`

- Fails from duplicate declarations in its constructed data module.
- The same failure occurs against clean `HEAD`.
- Quarantined.

`reports/production/_audit-callers.cjs`

- Invalid regular-expression flags.
- Preserved for archive; not registered as active.

`reports/production/_v2-customer-callsites.cjs`

- Uses ES module syntax in a `.cjs` file.
- Preserved for archive; not registered as active.

### Untracked current-worktree suites

- `tests/lumi/compatible-mode-fallback.test.mjs`
- `tests/lumi/composition-diagnostics.test.mjs`
- `tests/lumi/customer-profile.test.mjs`

Observed result: 7 failures across the three suites.

Clean-HEAD comparison is unavailable because these files are untracked. They remain quarantined until the Lumi contract is reviewed.

Detailed comparison:

- `reports/qa/quarantine/clean-head-comparison.json`

## CI Coverage

Created:

- `.github/workflows/qa-baseline.yml`

Triggers:

- Pull requests to `main` or `uat`.
- Pushes to `main` or `uat`.
- Manual dispatch.

The workflow runs only curated registry tools:

1. QA doctor
2. Catalog suite
3. CRM suite
4. Layout suite
5. Checkout suite
6. Security suite
7. Browser suite

It does not run:

- Quarantined historical suites.
- Environment-gated UAT analytics suites.
- Production writes.
- Production deployment.

The workflow installs Chromium explicitly. Advanced CRM/banner browser checks
skip with a recorded reason when no production candidate is available in a
clean CI checkout; generic Step 3 → Step 4 smoke still runs.

## AGENTS Reuse Policy

Updated `AGENTS.md` requires agents to:

1. Search `qa/registry.json`.
2. Prefer canonical tools.
3. Extend related tests before creating new ones.
4. Run related regressions.
5. Run `qa:predeploy` before a release and `qa:production` only as a read-only post-deploy check.
6. Record reused tool IDs and evidence paths in final reports.
7. Keep `remote-write-approved` tools disabled without separate owner authorization.

## Safety Controls

- Default suites use static or fixture-only behavior.
- Browser fixtures replace remote APIs and do not contact Production.
- `qa:production` is GET-only and records `writesPerformed: false`.
- `qa:predeploy` verifies local artifacts only and does not deploy.
- Production settings, catalog, Supabase, orders, and payments were untouched.
- Historical tools and evidence remain preserved.
- Quarantined tests are excluded by registry status, not deleted.

## Git Working-Tree Changes

Modified:

- `AGENTS.md`
- `.vercelignore`
- `package.json`
- `README.md`

Added:

- `.github/workflows/qa-baseline.yml`
- `qa/`
- `reports/qa/`
- `reports/tool-inventory-audit.md`
- `reports/phase2-30-reusable-qa-toolkit-report.md`

No commit was created. Existing dirty files and untracked worktree content were
left untouched.

## Remaining Priorities

1. Track the three `ciEligible: false` canonical tests so CI can enforce Thai integrity, Mallow/Pony, and customer-funnel coverage:
   - `tests/thai-text-integrity.test.mjs`
   - `tests/mallow-pony-charms-uat.test.mjs`
   - `tests/customer-funnel-navigation-safety.test.mjs`
2. Repair or rebase the quarantined Beryl and mixed-size UX tests in a dedicated QA task.
3. Triage the untracked Lumi contract failures without changing application behavior merely to satisfy stale expectations.
4. Move environment-gated analytics tests into a dedicated isolated-UAT workflow.
5. Replace remaining repeated static/API fixture scripts with `qa/lib` incrementally.
6. Add a short-lived Vercel staged-artifact URL check when Vercel credentials are available in CI.
7. Decide whether `@supabase/supabase-js` should become a pinned optional dependency for dry-run migration utilities.

## Final Verdict

**PASS for the local Phase 2.30 toolkit.**

The repository now has a discoverable, registry-driven QA system with accurate
exit codes, local-safe defaults, explicit quarantine status, and CI coverage for
the verified baseline. Production was not modified or deployed.
