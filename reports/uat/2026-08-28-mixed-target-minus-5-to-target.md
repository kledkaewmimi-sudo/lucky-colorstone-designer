# UAT Mixed target-minus-5 to target completion

## Owner Final Business Decision

Mixed Size uses the existing manufacturing target: `(selected wrist size + 1.5cm) * 10`. Fixed 4mm, 6mm, and 10mm remain unchanged and retain their owner-tested discrete terminal capacity behavior.

## Why WristWrist+5 Was Rejected

The prior Mixed wrist-through-wrist-plus-5 interval made a 16.0cm design complete at only 160mm through 165mm. That was inconsistent with the existing 175mm manufacturing target and with the comparable Fixed physical results.

## Canonical Target-5Target Rule

Mixed is incomplete below `targetLengthMm - 5mm`, complete inclusively from `targetLengthMm - 5mm` through `targetLengthMm`, and overflow-invalid above target. The active helper calls this `UNDER_TARGET_MINUS_5`, `COMPLETE_WITHIN_TARGET_RANGE`, and `OVERFLOW_INVALID`.

## 16cm Acceptance Example

For 16.0cm, the manufacturing target is 175mm and the valid Mixed interval is 170mm through 175mm. 169mm is incomplete; 170mm through 175mm are complete; 176mm is invalid. Seventeen 10mm stones total 170mm and are complete.

## All Wrist Matrix

The source-of-truth wrist range is 14.0cm through 20.0cm in 0.5cm increments. Every configured wrist is tested at lower-minus-1, lower, each value through target, and target-plus-1.

## Mixed Placement Upper Bound

Mixed placement permits a proposed physical composition only through the manufacturing target, never above it. At 168mm for a 175mm target, 4mm and 6mm are placeable; 10mm is rejected. Once the lower completion boundary is reached, further legal edits remain optional, never mandatory for Next.

## Completion vs Optional Further Editing

Entering the 5mm window below target makes Mixed complete even when an optional smaller stone could still fit. Step 3 and Step 4 allow progress at that point; the user can still edit if the proposed total remains at or below target.

## Fixed Preservation

Fixed mode retains its pre-Mixed discrete capacity branch. Regression coverage confirms 16cm Fixed 10mm at 17 beads, 6mm at 29 beads, and 4mm at 43 beads remain complete.

## Delete/Re-Add Preservation

Retained empty slots remain zero physical length. A replacement at that preserved position uses its current 4mm, 6mm, or 10mm footprint and does not reflow later sequence entries.

## Visual/Business Agreement

Renderer geometry, dotted placeholders, ordering, positioning, and sticky behavior are unchanged. A trailing placeholder is active only below the lower Mixed completion boundary when a supported size is placeable; it does not communicate a required addition inside the complete interval. Retained deletion placeholders remain separate and visible.

## Shared Step3/Step4 Gate

The same derived completion result drives Mixed placement, Step 3 validation/Next, Step 4 physical validation, checkout physical eligibility, and active placeholder semantics. No selected-wrist-through-wrist-plus-5 rule remains active.

## Tests

The new red tests failed on the previous wrist-baseline runtime: 149mm at a 14.0cm wrist was classified overflow and 170mm at 16.0cm was rejected. After the change, 106 relevant tests pass, including all-wrist Mixed boundaries, 17x10mm acceptance, placement, fixed regression, delete/re-add, renderer restoration, pricing, and unchanged LINE/OA tests. `node --check` passed for `app.js` and `bracelet-geometry.js`; `git diff --check` passed.

## UAT Deployment

This frontend-only change will deploy to UAT after the controlled `uat` commit. Render is not required.

## Owner Retest

Owner real-device retest remains required; this report does not claim owner verification of the deployment.

## Production Isolation

Only `origin/uat` and UAT Vercel are in scope. Production is unchanged.
