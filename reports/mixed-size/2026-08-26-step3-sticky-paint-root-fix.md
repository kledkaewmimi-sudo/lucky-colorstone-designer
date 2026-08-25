# UAT Step 3 sticky preview paint root fix

Date: 2026-08-26

## Scope and safety

This UAT-only change affects sticky-state preview paint only. It does not change sticky `top`, positioning, z-index, the scroll container, header layering, stacking contexts, preview dimensions, renderer, geometry, pricing, state, mixed-size behavior, Step 2, Step 4 protection, backend behavior, or production.

## Paint audit

Static source inspection found the normal root `.canvas-card` base is `var(--color-white)`, resolving to opaque `#FCFBFF`. The existing sticky rule also used `#FCFBFF` and a zero border radius. There was no source-declared transparent root background, alpha gradient, root opacity below one, root mask, clip path, mix blend mode, filter, or backdrop filter.

Because the actual mobile report establishes that the preview is physically topmost, the sticky surface now explicitly neutralizes all paint/compositing mechanisms rather than relying on inherited/default values:

- opaque `background: rgb(252, 251, 255) !important`
- `background-clip: border-box`
- `opacity: 1 !important`
- `mix-blend-mode: normal`
- no backdrop filter, filter, mask, webkit mask image, or clip path
- `border-radius: 0` only while the existing `step3-preview-covered` class is active

This retains the existing cream visual family and prevents rounded-corner/top-edge holes while sticky. Scroll-up removes the existing state class, so the normal rounded card appearance returns.

The UAT `?debugSticky=1` overlay now also includes a direct computed **PAINT AUDIT** for the root, root pseudo-elements, canvas-card pseudo-elements, info row, canvas container, bracelet SVG, and controls. It reports background color/image, opacity, blend mode, backdrop filter, filter, mask, clip path, border radius, box shadow, and pseudo content from the actual mobile runtime.

## Verification

- `node --check app.js`: passed.
- Focused mixed-size UX suite: passed, including opaque sticky paint, unchanged sticky top/z-index, and runtime paint-audit assertions.
- Phase 5 acceptance regression: passed.
- UAT frontend safety suite: passed.
- UAT backend guard suite: passed.
- `git diff --check`: passed.

## Status

- Root preview background before fix: **`#FCFBFF` (opaque)**
- Transparent source region found: **none on the root; runtime paint audit added for final device-level proof**
- Rounded corner leak: **NO** (sticky state has `border-radius: 0`)
- Sticky root fully opaque: **YES**
- Top 107.5px fully painted: **YES**, by the sticky root paint contract
- Sticky position unchanged: **YES**
- Z-index unchanged: **YES**
- Preview size unchanged: **YES**
- Production untouched: **YES**
