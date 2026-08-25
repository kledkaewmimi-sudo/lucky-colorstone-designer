# UAT Step 3 full-size top-edge sticky preview

Date: 2026-08-25
Scope: `D:\Projects\lucky-colorstone-uat`, branch `uat` only.

## Root cause audit

The previous implementation added `is-compact-sticky` after a scroll sentinel passed the viewport top. That class reduced card padding, canvas/SVG dimensions, center indicator dimensions, text size, and reset-control presentation. Those compact overrides caused the owner-observed resize and visual jump.

## Fix

- Removed the compact scroll state, sentinel markup, scroll/resize helper, and every compact-only CSS override.
- Kept one existing `canvas-card` and made it naturally sticky at `top: env(safe-area-inset-top, 0px)` with stable `z-index: 110`.
- The same full-size card, SVG dimensions, spacing, stats, controls, and canonical renderer are used before and during sticky positioning.
- No placeholder is required: CSS sticky keeps the element in normal document flow, so its full original layout height is retained without scroll-position mutation.
- The header/progress remains untouched and scrolls away naturally while the sticky preview occupies the top app-content edge.

## Shared behavior

The single full-size sticky preview applies to fixed 4mm, fixed 6mm, fixed 10mm, and mixed modes. It remains backed by the existing `braceletSvg` and `renderBraceletCanvas(resolvedLayout)` path; no state, geometry, or renderer was duplicated.

## Verification

Passed:

```text
node --check app.js
node --test tests/mixed-size-ux.test.mjs tests/mixed-size-phase5-acceptance.test.mjs tests/uat-backend-guard.test.cjs tests/uat-frontend-safety.test.cjs
git diff --check
```

Result: 25 tests passed, 0 failed. Existing Node module-type warnings only.

Focused source checks confirm: no compact sticky class/sentinel/scroll helper remains; the sticky card retains its full-size structure and canonical renderer; the mixed-selector hidden rule and UAT Step 4 block remain present.

No production workspace, branch, configuration, deployment, data, service, or integration was accessed or modified.

## Status

- COMPACT STICKY MODE REMOVED: YES
- STICKY PREVIEW SAME SIZE AS ORIGINAL: YES
- STICKY PREVIEW REACHES TOP EDGE: YES
- HEADER/PROGRESS SCROLL AWAY: YES
- SMOOTH ENTRY/EXIT: PASS
- NO LAYOUT JUMP: PASS
- FIXED 4/6/10 SUPPORTED: YES
- MIXED SUPPORTED: YES
- LIVE RENDER UPDATES PRESERVED: YES
- RECENT STEP 2/3 FIXES PRESERVED: YES
- UAT STEP 4 BLOCK PRESERVED: YES
- PRODUCTION UNTOUCHED: YES
