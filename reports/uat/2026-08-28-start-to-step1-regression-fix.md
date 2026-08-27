# Start-to-Step 1 regression correction

## Owner Video Evidence

The owner real-device video is authoritative: tapping `เริ่มออกแบบ` entered `กำลังเปิด...`, waited, then restored the normal Landing Start button without entering Step 1.

## Exact Runtime Comparison

`feab30daabef03f05092d1054b5fed56e8f628a0` changed one global runtime behavior outside the Step 3 renderer/placement scope: `renderApp` moved `renderStepper()` from before `await renderStepViews()` to after it. The Landing Start, LIFF initialization, identity synchronization, callback bootstrap, and Landing state functions were otherwise unchanged from parent `bcc8963c75082683a348a9c455bd00f0c22e6810`.

The global render reorder did not itself clear loading or restore Landing: `renderApp`, `renderStepViews`, and `renderStepper` do not set `State.landingDismissed = false`, and the successful Start branch sets `State.currentStep = 1` and `State.landingDismissed = true` before rendering.

## Exact Return-to-Landing Path

The observed normal-button restoration comes from `setupLandingEvents()`:

1. `requireLineLoginForCustomization()` returns `false` when identity/profile synchronization fails or a LINE login/entry redirect does not start.
2. `liffLoginInProgress` remains false.
3. The `!canContinue` branch called `resetLandingStartState()`.
4. That reset stopped loading and restored the ordinary Landing Start button, silently presenting a normal retry as if no authentication failure had occurred.

The live `/api/liff-config` endpoint was checked and returned HTTP 200 with the UAT environment and a configured LIFF ID. No secret value was logged or recorded.

## Minimal Correction

The known-good global `renderApp` order is restored. Atomic rendering is now local to the Step 2 -> Step 3 navigation boundary: while Step 3 catalog work prepares, the existing Step 2 UI remains committed; the Step 3 body is activated before its stepper is rendered in the same continuation.

The failed Start branch now uses the existing `showLineConnectPrompt` retry/error presentation instead of silently resetting to the normal Start button. Profile-sync failures retain their existing diagnostic toast. Login/entry-start failures display the existing safe retry message. No code forces Step 1 after failed authentication.

## Preserved Step 3 Contract

No Step 3 renderer, geometry, placement, fit, deletion, or sticky code was changed. Dotted placeholders, retained empty slots, non-reflow deletion, first-empty-slot replacement, final-slot placement compatibility, and the inclusive 2.0mm final fit contract remain covered by the existing restoration tests.

## Verification

Focused verification passed: 46 tests.

- Existing canonical LINE identity -> Step 1.
- Logged-in LIFF with missing application identity -> profile synchronization -> Step 1.
- Initial identity callback -> clean Step 1 state before render.
- Successful Start has no branch that resets `landingDismissed` or renders Landing.
- Authentication failure blocks Step 1 and exposes retry/error UI.
- Step 2 -> Step 3 remains atomic locally.
- Restored Step 3 renderer, deletion slots, fixed/mixed geometry, and 2.0mm fit tests remain green.
- `node --check app.js` and `git diff --check` passed.

Owner real-device retest is still required before calling the runtime fixed.

## Production Isolation

No production, Step 2 styling, Step 3 renderer/geometry, catalog, prices, Supabase, OA friendship, handoff storage, or Step 4 transaction code was modified.
