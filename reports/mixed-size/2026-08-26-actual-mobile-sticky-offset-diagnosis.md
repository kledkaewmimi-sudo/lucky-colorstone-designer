# Actual-mobile Step 3 sticky offset diagnosis instrumentation

Date: 2026-08-26

## Scope and safety

This is a UAT-only, query-gated diagnostic extension for the actual-mobile sticky discrepancy. It is available only when `APP_ENV === 'uat'` and the URL includes `?debugSticky=1`. It collects layout data only; it does not change sticky positioning, z-index, preview size, renderer, geometry, pricing, state, mixed-size logic, Step 4 protection, backend behavior, or production configuration.

## Added actual-mobile runtime evidence

The existing copyable debug snapshot now includes:

- Browser viewport dimensions, document client dimensions, and `window.scrollY`.
- `VisualViewport` width, height, offset top, page top, and scale when supported, with update listeners for viewport resize and scroll.
- Resolved safe-area top/bottom probe values, UAT CSS offset variables, app top rectangle, and content padding/margin/scroll-padding top.
- Full computed layout data for app container, app content, header, Step 3, workspace, and preview: position, top, margin/padding top, transform, z-index, overflow, opacity, isolation, pointer events, rectangle top/bottom, and offset top.
- Sticky geometry: app-content scrollTop, preview rectangle top, computed top, expected `0`, preview-minus-scrollport difference, and the same geometric sticky determination used for diagnosis.
- Hit tests at y=5, 20, 50, 100, 110, and 130.
- Current classes and inline styles on body, app container, app content, Step 3, and preview.
- Active matching CSS media-query rules that affect the sticky participants, restricted to relevant layout properties.
- The existing concise stacking-context ancestry report and Copy Debug button.

Updates remain requestAnimationFrame-throttled on the app scroll container, window resize, VisualViewport changes, and Step 3 activation changes.

## Verification

- `node --check app.js`: passed.
- Focused mixed-size UX suite: passed, including the expanded UAT-only actual-mobile instrumentation assertions.
- Phase 5 acceptance regression: passed.
- UAT frontend safety suite: passed.
- UAT backend guard suite: passed.
- `git diff --check`: passed.

No functional sticky code changed: `syncStep3StickyLayer()` remains unchanged. The next step is evidence collection in the owner’s actual mobile browser/WebView before a functional fix is considered.

## Owner action

Open the same affected mobile browser/WebView at:

`https://lucky-colorstone-uat.vercel.app/?debugSticky=1`

Navigate to Step 3, scroll until the preview freezes, press **Copy Debug**, and send the copied snapshot.
