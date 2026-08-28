# Single-delete and Mixed final-gap stabilization

## Owner Real-Device Evidence

One delete could visibly remove a second component, distort the dotted ring, and Mixed final gaps could appear blocked.

## Single-Delete Reproduction

The red test deletes the middle item in `10, 10, 6`. The retained empty slot carried `size: 10`; the app-level capacity trim consumed that retained size as physical length and could trim a surviving trailing item.

## Exact Delete Root Cause

`getLoopItemLengthMm()` returned the retained empty slot's former size. It is used by `adjustBeadsToNewCapacity()` and availability calculations, so a semantic placeholder was treated as a second physical component.

## State Mutation Before/After

Delete now remains one indexed replacement: `stone -> empty` at the chosen source index. Its physical length is zero. Renderer-only placeholder size is supplied by `getLoopItemRenderSizeMm()`, retaining sequence position without entering capacity math.

## Dotted Ring Root Cause

The unexpected second trim created a changed/invalid loop input for the renderer. The renderer itself was not changed. Retained placeholders still carry a visual size only.

## Renderer Preservation

No circular distribution, start angle, placeholder style, or renderer geometry code changed.

## Mixed Final-Gap Requirement

The existing canonical rule is correct: Mixed is complete from target minus 5mm through target. At target 175mm, 172/173/174mm are complete.

## Stale Completion Gate Audit

Step 3 validation, Next, `goToStep(4)`, and checkout all resolve `summary.completionEligibility` through `getResolvedLayoutFitEligibility()`. No divergent current source gate was found; the regression tests cover the 1/2/3mm final gaps.

## Step3/Step4 Shared Eligibility

Both paths consume the same completion eligibility result. Fixed behavior remains the pre-Mixed discrete model.

## Fixed Preservation

16cm fixed 10mm/17 beads, 6mm/29 beads, and 4mm/43 beads remain complete.

## Step4 Charm Regression

No Step 4 or charm rendering source was modified. Existing Step 4 preview preparation regression remains green.

## Tests

64 focused tests passed, including the new red/green delete and final-gap tests, renderer restoration, fixed/mixed completion, pricing, LINE identity, and OA tests. Syntax and diff checks passed.

## UAT Deployment

Pending controlled UAT commit and Vercel deployment.

## Owner Retest

Required; this report does not claim real-device confirmation.

## Production Isolation

Production was not modified.
