# UAT Step 3 runtime layer debug overlay

Date: 2026-08-26
Scope: temporary diagnostic instrumentation in the UAT worktree only. Production, checkout, payment, LINE, analytics, renderer geometry, pricing, state, and the UAT Step 4 block were not changed.

## Activation

The overlay is created only when both conditions are true:

- `APP_ENV === 'uat'`
- the query parameter is exactly `?debugSticky=1`

Use:

`https://lucky-colorstone-uat.vercel.app/?debugSticky=1`

Then navigate to Step 3 and scroll until the preview becomes sticky. It is hidden outside Step 3 and does not occupy the top area used by the hit tests.

## Captured runtime data

The compact, high-contrast mobile overlay is fixed at the bottom right and provides a selectable debug readout plus **Copy Debug**:

- Header computed `position`, `z-index`, `transform`, `opacity`, `isolation`, `pointer-events`, and top/bottom rectangle values.
- Preview computed `position`, `top`, `z-index`, `transform`, `opacity`, `isolation`, `pointer-events`, and top/bottom rectangle values.
- Scroll-container `scrollTop`, `overflow-y`, and top rectangle value.
- `elementFromPoint()` output at y=5, 20, 50, and 100, including tag, id, and classes.
- Concise stacking-context ancestry for both header and preview, reporting transform, filter, opacity, isolation, contain, will-change, perspective, and positioned z-index triggers.

Updates are requestAnimationFrame-throttled on the app scroll container, resize, and Step 3 activation changes. The instrumentation reads DOM layout only; it does not alter sticky positioning, z-index, renderer dimensions, or app state.

## Verification

- `node --check app.js`: passed.
- Focused mixed-size UX suite: passed (including the UAT query-gate/read-only diagnostics assertion).
- Phase 5 acceptance regression: passed.
- UAT frontend safety suite: passed.
- UAT backend guard suite: passed.
- `git diff --check`: passed.

The available browser surface had no active browser session, so in-environment visual emulation was not available. The owner runtime screenshot with this overlay is the required next diagnostic artifact.

## Safety outcome

- Debug overlay added: **YES**
- UAT only: **YES**
- Business logic unchanged: **YES**
- Step 3 sticky logic unchanged: **YES**
- UAT Step 4 block preserved: **YES**
- Production untouched: **YES**
