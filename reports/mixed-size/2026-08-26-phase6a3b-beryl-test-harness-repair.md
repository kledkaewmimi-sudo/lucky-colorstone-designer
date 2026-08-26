# Phase 6A.3B — Beryl test-harness repair

Date: 2026-08-26  
Worktree: `D:\Projects\lucky-colorstone-prod-promotion`  
Branch: `feature/mixed-size-production-promotion`

## Root cause

`tests/beryl-visuals.test.mjs` previously generated one `data:` ES module by concatenating `beryl-visuals.js` and `beryl-catalog-preview.js`. The first module exports `BERYL_CATALOG_FADE_MS`, `BERYL_CATALOG_HOLD_MS`, and `BERYL_VISUAL_IMAGES`. The second module imports those same bindings from `./beryl-visuals.js`. Concatenation left the import declaration inside the generated module, so Node 24 parsed declarations for each of those identifiers twice and rejected the synthetic module with `SyntaxError: Identifier 'BERYL_CATALOG_FADE_MS' has already been declared`.

This is a test harness construction defect only. Production loads `beryl-visuals.js` and `beryl-catalog-preview.js` as separate ES modules through their normal import boundary, so the duplicate declaration never exists at runtime.

## Repair

The test now dynamically imports each Beryl module by its actual file URL. Assertions are unchanged: scheduler sequence/timing, permanent three-layer preview cycling, remount behavior, and Step 3 controller lifecycle are all exercised against the real module relationship.

## Scope verification

- `beryl-visuals.js` has no diff from either the promotion HEAD before this phase or `origin/main`.
- `beryl-catalog-preview.js` has no diff from either the promotion HEAD before this phase or `origin/main`.
- No catalog, customer flow, mixed-size, server, LINE, Stripe, CRM, or analytics runtime files changed.

## Verification

- `node --test tests/beryl-visuals.test.mjs`: 5 passed, 0 failed.
- `node --test tests/*.test.mjs`: 105 passed, 0 failed.
- `git diff --check`: passed.

No production deployment, main-branch push, live checkout, or LINE message occurred.
