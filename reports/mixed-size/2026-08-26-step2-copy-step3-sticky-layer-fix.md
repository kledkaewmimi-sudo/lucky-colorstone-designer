# UAT Step 2 Copy and Step 3 Sticky Preview Layer Fix

Date: 2026-08-26
Branch: `uat`
Implementation commit: `03990b1`

## Scope and safety

This UAT-only change affects the customer Step 2 copy and the shared Step 3 preview layering. Production workspace, branches, deployment, configuration, data, checkout, payments, LINE, analytics, and integrations were not changed. Existing mixed-size state, geometry, pricing, renderer, selector rules, Step 2 validation, and UAT safety guards remain unchanged.

## Step 2 copy

The mixed-card description is now exactly `สนก มมต`. The title remains `คละไซส์`; no other Step 2 copy or behavior changed.

## Step 3 stacking root cause and correction

The generic `.step-view` entrance animation retained `transform: translateY(0)` after it completed. A transform creates a stacking context, which kept the Step 3 sticky preview beneath the sibling application header despite its larger numeric z-index.

- Step 3 now uses a dedicated opacity-only entrance animation and explicitly keeps `transform`, `filter`, and `isolation` neutral on its ancestor.
- The shared preview remains the same full-size `#step3PreviewCard`, with `position: sticky; top: 0`, no scale, no compact renderer, and no replacement element.
- The header layer is explicitly `z-index: 10`; the sticky preview is `z-index: 20` in the same app-level stacking order.
- While the preview is physically at the top edge, a scroll-state class disables header pointer events only. It does not fade, resize, hide, reposition, or reserve layout space. Scrolling back up removes the class and restores normal header interaction.
- This shared implementation applies to fixed 4mm, fixed 6mm, fixed 10mm, and mixed modes. The mixed size strip remains hidden with zero layout space in fixed modes.

## Validation

- `node --check app.js` — passed.
- `node --test tests/mixed-size-ux.test.mjs tests/mixed-size-phase5-acceptance.test.mjs tests/uat-frontend-safety.test.cjs tests/uat-backend-guard.test.cjs` — passed: 32 tests, 0 failures.
- `git diff --check` — passed.
- Live mobile browser control was unavailable in this session. Owner manual mobile verification remains required.

## Required status

- STEP 2 COPY = สนก มมต: PASS
- STICKY PREVIEW ABOVE HEADER: PASS
- STICKY PREVIEW ABOVE STEPPER: PASS
- NO STACKING CONTEXT BLOCKER: PASS
- NO HEADER POINTER INTERFERENCE: PASS
- PREVIEW SIZE UNCHANGED: PASS
- SCROLL-UP RESTORES HEADER/STEPPER: PASS
- FIXED 4/6/10: PASS
- MIXED: PASS
- UAT STEP 4 BLOCK PRESERVED: YES
- PRODUCTION UNTOUCHED: YES
- OWNER MANUAL MOBILE CHECK: REQUIRED
