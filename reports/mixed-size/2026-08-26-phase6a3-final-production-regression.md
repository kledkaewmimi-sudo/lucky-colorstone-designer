# Phase 6A.3 — Final production regression and promotion manifest

Date: 2026-08-26  
Promotion worktree: `D:\Projects\lucky-colorstone-prod-promotion`  
Branch: `feature/mixed-size-production-promotion`  
Rollback base: `origin/main` at `0e958ff63b322b179e8184c4c6640fb22518756a`

## Result

The mixed-size-focused regression suite passes (44/44). The complete wildcard suite has one unrelated baseline failure in `tests/beryl-visuals.test.mjs`: its test harness concatenates `beryl-visuals.js` with `beryl-catalog-preview.js`, which then imports bindings already declared in the same generated module. Node 24 correctly rejects that generated module with a duplicate identifier error. None of those three Beryl files differ from `origin/main`.

The analytics callback-order source test was made CRLF/LF-neutral in `tests/analytics-tracking.test.mjs`; it now passes and does not change application runtime code or analytics behavior.

The in-app browser was unavailable in this execution environment, so the visual click-through items (including sticky preview coverage) could not be observed live. Automated source and module-contract coverage passed, but this report does not treat unavailable live visual QA as a deploy pass.

Phase 6B readiness: **NO** until the Beryl test harness is repaired or explicitly baselined, and live browser QA is completed.

## Evidence

- Worktree root resolves to the required isolated promotion repository.
- Branch is six commits ahead of `origin/main`, containing the intended 6A.1A through 6A.2 commits.
- No runtime hits, UAT fixture files, or catalog files were found for: `lucky-colorstone-uat`, `uat.customize`, `UAT_BACKEND`, `debugSticky`, `step3StickyDebugOverlay`, `fixture-only`, `UAT  checkout`, `UAT banner`, or `UAT Step 4 block`.
- Syntax checks passed for `app.js`, `bracelet-geometry.js`, `mixed-order-model.js`, `guest-design-state.js`, `mixed-size-state.js`, `mixed-size-transition-trim.js`, `server.js`, and `server-order-validation.js`.
- Mixed phase and guest-state tests: 44 passed, 0 failed.
- Analytics tracking tests: 7 passed, 0 failed after the test-only line-ending normalization.
- Full wildcard suite: 100 passed, 1 failed (`tests/beryl-visuals.test.mjs`), 0 skipped.
- `git diff --check` passed.

The canonical target-length formula remains `(wristSize + 1.5) * 10` mm. Geometry uses stored stone sizes (4/6/10), `footprintMm` for charms, and `effectiveLengthMm` for spacers. Fit is unrounded and inclusive from -1.0 mm through +1.0 mm.

## PROMOTE

- `app.js`
- `index.html`
- `index.css`
- `data.js`
- `guest-design-state.js`
- `mixed-size-state.js`
- `bracelet-geometry.js`
- `mixed-size-transition-trim.js`
- `mixed-order-model.js`
- `server.js`
- `server-order-validation.js`

## ADAPTED

- `app.js` — connects canonical mixed-size state, geometry, pricing, restore, and existing UI flow.
- `index.html`, `index.css` — retain the established Step 2/Step 3 presentation with mixed-size controls.
- `data.js` — resolves physical-size pricing from catalog `p4`/`p6`/`p10` only.
- `guest-design-state.js` — extends existing snapshot/callback handoff without persisting derived geometry or price.
- `server.js` — calls the side-effect-free validator before its existing checkout construction path.
- `tests/guest-design-state.test.mjs` — extends legacy snapshot coverage.
- `tests/analytics-tracking.test.mjs` — test-only CRLF/LF-neutral source assertion; runtime analytics is unchanged.

## NEW PRODUCTION FILES

- `bracelet-geometry.js`
- `mixed-size-state.js`
- `mixed-size-transition-trim.js`
- `mixed-order-model.js`
- `server-order-validation.js`

## EXCLUDED UAT-ONLY

- None included. No UAT runtime guards, UAT catalog/fixture files, or UAT-only paths are present in the candidate.

## SERVER CHANGES

`server-order-validation.js` validates 4/6/10 physical variants and exact sequence, resolves catalog prices server-side, applies canonical fit validation, preserves legacy fixed payload compatibility, and returns authoritative items/totals. `server.js` retains the existing Stripe checkout, webhook, paid-order, LINE notification, CORS, environment, and Supabase architecture; it only consumes validated authoritative order data. The server never trims, substitutes, or auto-adds components.

## FRONTEND CHANGES

The customer flow supports explicit 4/6/10/fixed-or-mixed selection, stored physical stone sizes, strict per-component geometry, inclusive fit status, trailing-only mixed-to-fixed trimming, and `stoneId_size` variant summaries with non-authoritative browser display prices. Fixed designs retain stored 4/6/10 physical pricing.

## LINE/CALLBACK

The existing guest snapshot and LINE callback handoff retain mixed mode, `mixedPlacingSize`, ordered component identity, and every stone’s physical size. Derived geometry and price are recalculated after restore. LIFF/OA credentials, friend verification, callback URL, and Step 4 authorization flow remain unchanged.

## PAYMENT/STRIPE

No live checkout was created. Existing checkout construction receives only validated authoritative totals/items. Webhook verification, idempotency, payment method configuration, success/cancel URLs, and paid-order authority remain unchanged by source-contract tests.

## CRM

Legacy order fields remain available, with `stoneVariants` carrying `stoneId`, physical `size`, and `quantity`. No schema migration or CRM UI change is required by this candidate.

## ANALYTICS

The existing funnel stages, Meta Pixel, and first-touch UTM behavior remain unchanged. The callback-order source assertion now reads source in a platform-neutral way; no analytics runtime code changed in this final validation.

## ROLLBACK BASE

`0e958ff63b322b179e8184c4c6640fb22518756a`

## PROMOTION HEAD

Pending final report commit.

## Remaining release gates

1. Repair or explicitly baseline the unrelated Beryl visual-test harness failure.
2. Complete live browser customer-flow and sticky-preview QA in an environment with an available browser surface.
3. Only then proceed to the controlled Phase 6B deploy process; no production deployment occurred in this phase.
