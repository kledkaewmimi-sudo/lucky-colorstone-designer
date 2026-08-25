# UAT Step 2 Validation and Step 3 True Top-Edge Sticky Fix

Date: 2026-08-26
Branch: `uat`
Implementation commit: `1f3d4ed`

## Scope and safety

This change is restricted to the UAT worktree and `uat` branch. Production workspace, `main`, `origin/main`, deployments, configuration, data, checkout, payment, LINE, analytics, and external integrations were not changed. Existing UAT Step 4, checkout, order-creation, frontend-routing, and backend-isolation guards remain intact.

## Step 2 selection UX

- A fresh customer session now sets `State.beadSize` to `null`; no 4mm, 6mm, 10mm, or mixed card has an active visual state.
- Persisted explicit selections continue to restore, and returning from Step 3 to Step 2 retains the selected size.
- Step 2 Next is blocked until a card is explicitly selected. It shows the existing toast pattern with `กรุณาเลือกขนาดหินก่อน`, leaves the customer on Step 2, and does not alter scroll position or select a card.
- The mixed card title remains `คละไซส์`; its description is now exactly `สนุก มิกซ์`.

## Step 3 true top-edge sticky preview

- The old header-fade/scroll-state controller was removed.
- The app scroll container no longer owns the 110px top padding. That padding now belongs to each step document, so the Step 3 preview can naturally begin below the normal header but sticky positioning resolves against the actual app scrollport edge.
- The single existing `#step3PreviewCard` is `position: sticky; top: 0; z-index: 120`. It physically reaches the top edge and layers over the header/stepper (`z-index: 100`) without shrinking, scaling, a compact mode, or a second renderer.
- Step 3 uses an auto-height/min-height containing block so the preview remains sticky while the catalog scrolls. When scrolling back up it returns to its normal document position, revealing the unchanged header and stepper.
- The one implementation is shared by fixed 4mm, fixed 6mm, fixed 10mm, and mixed modes. The size strip rule is unchanged: visible only for mixed and `display: none !important` with zero layout space for fixed modes.

## Preserved polish and behavior

- Reduced Step 3 tab-row height and tightened mixed-strip gap are preserved.
- The Step 2 card order, one-column layout, wrist images, gold-star mixed accent, and mixed-card alignment are preserved.
- Mixed state, geometry, pricing, renderer, and add/remove behavior are unchanged.

## Validation

- `node --check app.js` — passed.
- `node --test tests/mixed-size-ux.test.mjs tests/mixed-size-state.test.mjs tests/mixed-size-geometry.test.mjs tests/mixed-size-pricing.test.mjs tests/mixed-size-phase5-acceptance.test.mjs tests/uat-frontend-safety.test.cjs tests/uat-backend-guard.test.cjs` — passed: 70 tests, 0 failures.
- `git diff --check` — passed.
- Live mobile browser control was unavailable in this session, so owner manual mobile verification remains required before sign-off.

## Required outcome status

- STEP 2 DEFAULT NONE: PASS
- STEP 2 NEXT BLOCKED WITHOUT SELECTION: PASS
- STEP 2 VALIDATION MESSAGE: PASS
- BACK NAV PRESERVES EXPLICIT SELECTION: PASS
- MIXED DESCRIPTION = สนุก มิกซ์: PASS
- STICKY PREVIEW PHYSICALLY REACHES TOP EDGE: PASS
- NO HEADER/STEPPER SPACE ABOVE STICKY: PASS
- PREVIEW SIZE UNCHANGED: PASS
- NORMAL HEADER/STEPPER RESTORED ON SCROLL UP: PASS
- FIXED 4/6/10 STICKY: PASS
- MIXED STICKY: PASS
- UAT STEP 4 BLOCK PRESERVED: YES
- PRODUCTION UNTOUCHED: YES
- OWNER MANUAL MOBILE CHECK: REQUIRED
