# UAT Step 3 sticky bracelet preview

Date: 2026-08-25
Scope: `D:\Projects\lucky-colorstone-uat`, branch `uat` only.

## Implementation

- Added one shared Step 3 preview sentinel and made the existing `canvas-card` sticky for every bracelet mode: fixed 4mm, fixed 6mm, fixed 10mm, and mixed.
- A passive, requestAnimationFrame-throttled window scroll listener applies `is-compact-sticky` only after the preview's sentinel passes the viewport top.
- The normal full preview remains at the top. The compact sticky state reduces the live SVG to 146–160px on mobile, keeps wrist/price information, minimizes padding, hides nonessential helper/inspiration controls, and retains a compact reset action.
- The implementation uses the existing single `braceletSvg` and `renderBraceletCanvas(resolvedLayout)` call. No design state, layout, or renderer was duplicated.
- No scroll position is set or reset by the sticky-preview logic.

## Preserved behavior

- Fixed and mixed renderer paths remain canonical and unchanged.
- Mixed size selector visibility remains controlled only by canonical mixed mode; it remains hidden in fixed modes.
- Step 2's vertical card layout, order, and wrist images are unchanged.
- Geometry, pricing, order/CRM data, checkout, backend routing, UAT guards, and production integrations were not changed.

## Verification

Passed:

```text
node --check app.js
node --test tests/mixed-size-ux.test.mjs tests/mixed-size-phase5-acceptance.test.mjs tests/uat-backend-guard.test.cjs tests/uat-frontend-safety.test.cjs
git diff --check
```

Result: 25 tests passed, 0 failed. Existing Node module-type warnings only.

No interactive browser is available in this session, so owner mobile verification remains required for rendered sticky spacing and tap comfort after deployment.

## Deployed UAT static verification

Read-only checks against `https://lucky-colorstone-uat.vercel.app` confirmed the deployed source has one bracelet SVG, the sticky and compact preview rules, the existing canonical renderer call, passive scroll scheduling, and the fixed-mode mixed-selector hidden rule.

## Status

- STICKY PREVIEW IMPLEMENTED: YES
- COMPACT SCROLLED STATE: YES
- FIXED MODES SUPPORTED: YES
- MIXED MODE SUPPORTED: YES
- LIVE RENDER UPDATES PRESERVED: YES
- CATALOG REMAINS USABLE: YES
- NO SCROLL RESET ON ADD/REMOVE: YES
- RECENT STEP 2/3 UI FIXES PRESERVED: YES
- UAT STEP 4 BLOCK PRESERVED: YES
- UAT BRANCH PUSHED: YES (`0122254`)
- UAT DEPLOYED STATIC SOURCE: PASS
- PRODUCTION UNTOUCHED: YES
