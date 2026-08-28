# UAT target +5mm completion rule

## Owner Business Decision

Completion is now the inclusive physical interval from the bracelet target length through target plus 5mm. This applies to fixed 4mm, 6mm, and 10mm designs and to Mixed 4/6/10 designs.

## Why Discrete Terminal Rule Was Replaced

The previous terminal rule treated a bracelet as complete when no supported size fit without exceeding the target. It could therefore complete a design below target while a physically valid 4mm or 6mm addition within the allowed overrun still existed.

## Canonical Target +5mm Rule

`getBraceletCompletionEligibility()` is the shared source for physical status. It reports target length, maximum overrun (5mm), maximum allowed length, used length, both remaining measures, supported placeable sizes, completion, overflow, and one of `UNDER_TARGET`, `COMPLETE_WITHIN_OVERRUN`, or `OVERFLOW_INVALID`.

The 2mm fit calculation remains geometry diagnostic metadata only; it is not an active Step 3, Step 4, or placement authority.

## Pre-Fix Red Tests

Four executable contract tests failed against the prior runtime: Mixed 172mm of a 175mm target did not offer 4mm/6mm, and 17x10mm, 29x6mm, and 43x4mm were incorrectly accepted below a 175mm target. The same tests pass with the new interval rule.

## Fixed Behavior

At a 175mm target, 17x10mm (170mm), 29x6mm (174mm), and 43x4mm (172mm) remain under target. Their next legal beads produce 180mm, 180mm, and 176mm respectively and complete. The 14.0cm through 20.0cm, 0.5cm-step wrist matrix confirms a reachable completed layout for every fixed size.

## Mixed Behavior

Mixed evaluates each supported physical size independently. At 172mm of a 175mm target, 4mm and 6mm are placeable (176mm and 178mm); 10mm is rejected (182mm). Mixed remains incomplete below target and completes only on reaching the inclusive target-to-target-plus-5 interval.

## Placement Eligibility

Every physical component placement uses the same maximum-length boundary: proposed used length must be no more than target plus 5mm. Completion and placement no longer use contradictory terminal formulas.

## Placeholder Semantics

Renderer geometry, positions, dotted placeholders, and retained deletion slots are unchanged. Only active-target semantics were aligned: a trailing placeholder is active only while under target and a supported Mixed size is placeable; retained deletion slots remain visible and can be re-filled when their replacement is physically legal.

## Accessory Footprints

Existing canonical geometry supplies total used length, including charm and spacer footprints once. The interval rule consumes that total and does not require accessories for completion.

## Shared Step3/Step4 Gate

Resolved layout stores the derived canonical eligibility result. Step 3 validation, Next, Step 4 physical validation, checkout physical eligibility, and active placeholder semantics read that same result. LINE identity and OA friendship gates remain separate after physical completion.

## Boundary Tests

Tests cover target minus 10, minus 6, minus 4, minus 3, minus 1, target, target plus 1, plus 3, plus 5, and plus 6. Below target is incomplete, target through plus 5 is complete, and plus 6 is overflow-invalid.

## Fixed Wrist Matrix

The test matrix covers all 13 selectable wrist sizes from 14.0cm to 20.0cm in 0.5cm increments for 4mm, 6mm, and 10mm. Each has a reachable length in the complete interval and rejects the immediate next bead beyond target plus 5.

## Renderer Preservation

No circular distribution, slot position, start angle, bead order, sticky behavior, or placeholder geometry changed. Renderer restoration regression tests remain green.

## Tests

Pre-fix target-plus-5 contract: 4 failing tests. Post-change completion/renderer suite: 22 passing tests. Geometry, pricing, LINE identity/callback, OA, and Start-flow regression suite: 73 passing tests. `node --check` passed for `app.js` and `bracelet-geometry.js`.

## UAT Deployment

This frontend-only change is deployed to UAT after the controlled `uat` commit and verification. Render is not required.

## Owner Retest

Owner real-device retest remains required; this report does not claim the behavior is owner-verified.

## Production Isolation

Only the UAT branch and UAT frontend deployment are in scope. Production is unchanged.
