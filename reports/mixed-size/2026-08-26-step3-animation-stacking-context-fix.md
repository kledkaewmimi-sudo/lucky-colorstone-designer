# UAT Step 3 animation stacking-context fix

Date: 2026-08-26

## Root cause

The Step 3 source had this persistent entrance animation:

```css
#stepView3.step-view {
  animation: step3FadeIn 0.4s ease-out forwards;
}

@keyframes step3FadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

The animation name was `step3FadeIn`, duration `0.4s`, and fill mode `forwards`. An opacity animation that fills forwards can retain the stacking context it created even when the final computed opacity is `1`. That could confine the sticky preview’s `z-index: 20` inside the Step 3 parent context, allowing the sibling header at `z-index: 10` to paint above the entire Step 3 context.

The previous `elementFromPoint()` result did not disprove this because the covered header intentionally has `pointer-events: none`; hit testing skips it even if it is visually painted above another element. The UAT debug overlay now labels this limitation and reports Step 3’s full computed animation state.

## Fix

The cosmetic Step 3 entrance animation and its keyframes were removed. `#stepView3.step-view` now has:

```css
animation: none;
opacity: 1;
transform: none;
filter: none;
isolation: auto;
```

This removes the animation-induced persistent parent stacking context while preserving the existing sticky implementation, `top: 0`, preview `z-index: 20`, header `z-index: 10`, full preview dimensions, opaque sticky background, renderer, pricing, geometry, state, fixed/mixed behavior, UAT safety blocks, and production isolation.

## Verification

- `node --check app.js`: passed.
- Focused mixed-size UX suite: passed, confirming no `step3FadeIn`, no Step 3 animation, transform none, sticky top/z-index contract, opaque sticky paint, and one renderer.
- Phase 5 acceptance regression: passed.
- UAT frontend safety suite: passed.
- UAT backend guard suite: passed.
- `git diff --check`: passed.

The available browser surface has no active session, so owner verification on the affected mobile WebView is required after deployment. Use `?debugSticky=1` if the issue remains; the copy output now includes the Step 3 animation state and explicitly labels hit tests as non-authoritative for paint order when the header has `pointer-events: none`.

## Status

- Step 3 animation found: **YES**
- Animation fill mode: **forwards**
- Animation can retain stacking context: **YES**
- Root cause confirmed: **YES**
- Step 3 parent stacking context removed: **YES**
- Sticky top/z-index unchanged: **YES**
- Preview background unchanged: **YES**
- Production untouched: **YES**
