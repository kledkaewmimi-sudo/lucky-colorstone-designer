# UAT Mixed wrist-baseline completion

## Owner Business Decision

This change applies only to Mixed Size. Fixed 4mm, 6mm, and 10mm retain their owner-tested pre-Mixed discrete capacity behavior.

## Mixed Wrist-Based Completion Rule

Mixed completes inclusively from the selected wrist circumference in millimetres through that circumference plus 5mm. It is `UNDER_WRIST` below the selected wrist, `COMPLETE_WITHIN_5MM` inside the interval, and `OVERFLOW_INVALID` above it.

For a 16.0cm wrist, the interval is 160mm through 165mm. 166mm and 17x10mm (170mm) are invalid.

## Current Length Model Audit

Mixed `usedLengthMm` is the literal sum of current physical stone diameters plus physical charm/spacer footprints from canonical geometry. The selected wrist is stored in centimetres as `State.wristSize`; Fixed manufacturing length remains `(wristSize + 1.5cm) * 10`. Retained empty slots are excluded from physical length and preserve only editor/render position.

## All Wrist Boundary Matrix

The configured source-of-truth wrist range is 14.0cm through 20.0cm in 0.5cm increments. Tests cover lower minus 1, lower, every millimetre through lower plus 5, and lower plus 6 for each configured value.

## Placeable Size Logic

Mixed placement uses the selected wrist baseline plus 5mm. At 158mm for a 16.0cm wrist, 4mm and 6mm are allowed and 10mm is rejected. Supported sizes remain 4mm, 6mm, and 10mm.

## Fixed Mode Preservation

Fixed completion and placement continue to use their pre-Mixed discrete target-capacity rule. Fixed ignores the Mixed wrist baseline argument, and fixed matrix regression tests remain green.

## Delete/Re-Add Preservation

Retained empty entries remain zero physical length. Replacements at the retained position use their actual new 4mm, 6mm, or 10mm footprint without reflowing later sequence entries.

## Step3/Step4 Shared Gate

Resolved-layout eligibility is derived once and reused by Step 3 validation, Next, Step 4 physical validation, checkout physical eligibility, and Mixed active-placeholder semantics. All Mixed application call sites now pass `State.wristSize * 10` (or the resolved bracelet configuration equivalent).

## Model Mismatch Check

No model mismatch was found. The physical model is an unscaled literal footprint sum, and ordinary Mixed compositions can reach the selected-wrist interval (for example, 16x10mm reaches 160mm for a 16.0cm wrist). The explicitly supplied 17x10mm example is correctly invalid at 170mm.

## Tests

The pre-fix new wrist matrix failed: 14.0cm lower-minus-1 returned legacy `UNDER_TARGET`, and 158mm at a 16.0cm wrist incorrectly allowed 10mm. Post-fix, 103 relevant tests pass, including all-wrist Mixed boundaries, placeable sizes, fixed regressions, delete/re-add, renderer restoration, pricing, and unchanged LINE/OA suites. `node --check` passed for `app.js` and `bracelet-geometry.js`; `git diff --check` passed.

## UAT Deployment

This frontend-only change will deploy to UAT after the controlled `uat` commit. Render is not required.

## Owner Retest

Owner real-device retest remains required; this report does not claim owner verification of the deployment.

## Production Isolation

Only `origin/uat` and UAT Vercel are in scope. Production is unchanged.
