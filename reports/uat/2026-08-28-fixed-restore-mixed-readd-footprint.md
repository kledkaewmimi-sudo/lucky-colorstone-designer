# UAT fixed restoration and Mixed retained-slot physical footprint

## Owner Mobile Evidence

Owner real-device testing established that Fixed 4mm, 6mm, and 10mm must retain their original discrete terminal behavior, while Mixed must retain the target-through-target-plus-5mm interval. The owner also observed incorrect physical spacing after a Mixed deletion followed by replacement with a different size.

## Final Mode-Specific Business Rules

Fixed uses the pre-Mixed discrete fixed-size capacity boundary: it completes when another bead of the selected fixed size cannot fit within target capacity. Mixed is incomplete below target, complete from target through target plus 5mm inclusive, and overflow-invalid above that interval.

## Fixed Pre-Mixed Behavior

The pre-Mixed implementation before `174f8ab` derived fixed completion from the absence of another full fixed-size placeholder/capacity slot. At a 175mm target this makes 17x10mm, 29x6mm, and 43x4mm terminal complete layouts.

## Fixed Red Tests

Before the correction, executable tests showed all three terminal fixed layouts rejected by the shared target-plus-5 rule. The tests now pass and confirm the next fixed-size bead is rejected at the original fixed capacity boundary.

## Mixed Target+5 Preservation

Mixed remains target-plus-5 only. At 172mm of 175mm, it is incomplete and reports 4mm and 6mm as placeable, while rejecting 10mm.

## Mixed Delete/Re-Add Reproduction

The red reproduction used the actual canonical physical geometry: `10, 10, 6`, delete the middle 10mm, then add a 4mm replacement. Before the correction the retained empty entry contributed 10mm physically, producing 26mm after deletion instead of 16mm. After correction the empty entry is zero physical length and the `10, 4, 6` sequence totals 20mm.

## Retained Position vs Physical Footprint

`createEmptyLoopSlot()` keeps the former size as positional/render metadata so its dotted position is stable. Empty components are now explicitly zero physical length. Filling the slot replaces the empty entry with the new component, so its physical footprint always derives from the newly selected 4mm, 6mm, or 10mm size. Source index/order remains unchanged.

## Exact Root Cause

`getComponentPhysicalLengthMm()` fell through to `sizeMm` for `empty` components. Since a deleted slot intentionally stores the deleted size for rendering, canonical geometry incorrectly counted that stored size as occupied physical length.

## Minimal Fix

The geometry helper now returns zero for `empty` entries. Completion and placement explicitly pass `fixed` or `mixed` mode: fixed has a target maximum and terminal discrete completion; Mixed has a target-plus-5 maximum and interval completion. No renderer positioning or distribution code changed.

## Fixed Wrist Matrix

All selectable wrist sizes from 14.0cm through 20.0cm in 0.5cm increments were tested for fixed 4mm, 6mm, and 10mm. Every configuration reaches its pre-Mixed discrete terminal capacity and rejects the next fixed-size bead.

## Mixed Boundary Tests

Mixed tests cover target minus 6, minus 4, minus 3, minus 1, target, plus 1, plus 3, plus 5, and plus 6. Below target is incomplete; the target-through-plus-5 interval is complete; plus 6 is invalid.

## Renderer Preservation

Circular distribution, start angle, slot order, bead ordering, sticky behavior, preview scaling, dotted placeholder geometry, and physical-gap visualization were not changed. Renderer restoration regression tests pass.

## Step3/Step4 Separation

Step 3 validation, Next, and Step 4 physical eligibility read the same derived mode-specific completion result. LINE identity and OA friendship remain separate mandatory gates.

## Tests

The pre-fix red test run failed 2 of 3 cases: fixed terminal capacity and retained-empty physical footprint. The post-fix relevant regression run passed 99 tests, including fixed matrix, Mixed boundaries/placeable sizes, delete/re-add replacements, renderer restoration, pricing, and unchanged LINE/OA flows. `node --check` passed for `app.js` and `bracelet-geometry.js`; `git diff --check` passed.

## UAT Deployment

This frontend-only change is deployed to UAT after the controlled `uat` commit. Render is not required.

## Owner Retest

Owner real-device retest remains required. This report does not claim owner verification of the new deployment.

## Production Isolation

Only `origin/uat` and UAT Vercel are in scope. Production is unchanged.
