# Step 2 Real-Device State Trace — UAT

## Owner Runtime Evidence

Owner reports the Step 2 selection/navigation blocker in both normal UAT and `slot_forensics` UAT. The visual card becomes active, but Next displays the required no-selection toast and does not enter Step 3.

## Why Source Tests Are Insufficient

Fresh-state transition tests pass in source, but they cannot observe a real mobile event ordering, duplicate DOM, state reset, or navigation interruption. This diagnostic records those runtime boundaries directly on the owner device.

## Step2 Debug Contract

`?step2_debug=1` is UAT-only and query-gated. It adds a fixed `STEP2 RUNTIME TRACE ACTIVE` panel and a `COPY STEP2 TRACE` button. It does not assign application state, change validation, or alter Step 2 navigation. The complete trace is exposed as `window.__step2Debug` and can be copied from the mobile panel without developer tools.

## Runtime State Fields

The panel shows `CLICKED_CARD`, `ACTIVE_CARD`, `STATE_BEAD_SIZE`, `STATE_MIXED_PLACING_SIZE`, `EXPLICIT_SELECTION`, `VALIDATION_RESULT`, `CURRENT_STEP`, `NEXT_HANDLER_CALLS`, `LAST_TRANSITION_RESULT`, and `LAST_RENDER_SEQUENCE`.

## Validation Trace

Each trace row includes event sequence, clicked value, active card, current state, and validation result. It records `STEP2_RENDER`, `CARD_POINTERDOWN`, `CARD_CLICK`, `BEFORE_SIZE_TRANSITION`, `AFTER_SIZE_TRANSITION`, `AFTER_STEP2_RENDER`, `NEXT_CLICK`, `BEFORE_VALIDATION`, and `AFTER_VALIDATION`.

## Navigation Trace

When Step 2 proceeds, the trace records `BEFORE_GOTO_STEP3` and `AFTER_GOTO_STEP3`. This distinguishes a validation block from a subsequent navigation block.

## Root Cause Status

Not yet proven. No behavioral fix was applied.

## UAT Deployment

Deploy this UAT-only diagnostic and use `https://uat.customize.luckycolorstone.com/?step2_debug=1`. It may be combined with `slot_forensics=1`.

## Production Isolation

Production is unchanged. The diagnostic is hard-gated by `APP_ENV === 'uat'` and the explicit query parameter.
