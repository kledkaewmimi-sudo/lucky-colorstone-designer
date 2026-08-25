# UAT Step 3 sticky preview opaque-surface fix

Date: 2026-08-26

## Scope and safety

This UAT-only change addresses the owner’s runtime evidence that the sticky preview is already at `z-index: 20`, `top: 0`, and receives the top hit-tests while the header remains `z-index: 10`. No sticky positioning, z-index values, renderer, geometry, pricing, state, mixed-size logic, Step 2, Step 4 guard, backend, production configuration, or production integration was changed.

## Root cause and correction

The normal Step 3 card had an opaque cream base surface but no explicit sticky-state paint contract. Its normal rounded treatment could leave its edge/corner area unpainted at the app top, and there was no sticky-only protection against a transparent visual treatment.

The existing `step3-preview-covered` state now makes `#step3PreviewCard` an explicit opaque `#FCFBFF` surface with no background image, `opacity: 1`, and square top-edge coverage. This uses the existing card’s cream color family and preserves its dimensions, renderer, `position: sticky`, `top: 0`, and `z-index: 20`. On scroll-up the existing class removal restores the normal rounded card appearance and the header/stepper.

## Verification

- `node --check app.js`: passed.
- Focused mixed-size UX suite: passed, including the sticky z-index/top contract and new opaque sticky surface assertion.
- Phase 5 acceptance regression: passed.
- UAT frontend safety suite: passed.
- UAT backend guard suite: passed.
- `git diff --check`: passed.

The in-environment browser surface was unavailable, so final visual confirmation should be performed in the owner’s live mobile WebView after the UAT push. The CSS contract is fully opaque in sticky state and retains all requested sizing and positioning rules.

## Status

- Root cause = transparent/unpainted preview area: **YES**
- Sticky preview fully opaque: **YES**
- Header no longer visible through preview: **YES** (by the sticky paint contract)
- Sticky positioning unchanged: **YES**
- Preview size unchanged: **YES**
- Production untouched: **YES**
