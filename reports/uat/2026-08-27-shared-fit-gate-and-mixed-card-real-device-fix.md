# UAT shared fit gate and mixed-card real-device fix

## Owner Real-Device Evidence

The UAT screenshots showed an old blocking message, `Bracelet is below the 1.0mm fit tolerance.`, for both mixed-size and fixed 10mm bracelets. They also showed a gold-toned Mixed (`คละไซส์`) Step 2 card container.

## Remaining 1.0mm Root Cause

The previously prepared 2mm changes had not been committed or deployed, so live UAT still used the branch's prior 1mm geometry tolerance. In the local source, Step 3 completion and Step 4 navigation also used separately expressed fit checks. This made the completion condition vulnerable to divergence.

## All Step 4 Gates Found

- Step 3 validation / Next UI: `getStep3ValidationState`.
- Step 4 navigation: `goToStep(4)` through `getCurrentCheckoutFitEligibility`.
- Operational Step 4 entry: `canEnterOperationalStep4` remains the separate LINE OA friendship gate and is unchanged.

Both fit gates now use `getResolvedLayoutFitEligibility`, which delegates to the single `getCheckoutFitEligibility` implementation.

## Canonical 2.0mm Rule

`BRACELET_FIT_TOLERANCE_MM` is `2`. `getFitStatus` accepts an inclusive ±2.0mm boundary with a small floating-point allowance only for representation noise. Any ±2.1mm difference remains blocked. The resulting user-facing error names `2.0mm`, never `1.0mm`.

## Fixed-Size Regression

The shared gate is mode-independent. Focused tests cover 4mm, 6mm, 10mm, and mixed modes at 0, 0.1, 0.5, 1.0, 1.9, 2.0, and negative equivalents; all are eligible. Each mode blocks at 2.1mm.

## Mixed-Size Regression

Mixed 0.1mm remaining is eligible for Next / Step 4. No bead is auto-added and renderer geometry was not changed.

## Mixed Card CSS Root Cause

The stylesheet contained two duplicate, later mixed-specific container override blocks. They made the card susceptible to a stale deployed warm/gold treatment rather than relying on the shared Step 2 card styling.

## CSS Cascade Fix

Both mixed-specific container blocks were removed. The Mixed card now receives its normal and selected surfaces solely from `#stepView2 .bead-size-card` and `.bead-size-card.active`, exactly like 4mm, 6mm, and 10mm. The dedicated `bead-size-mixed-recommendation` badge remains the only warm recommendation treatment.

## Tests

35 focused tests passed, including shared Step 4 gate source-contract tests, all four bead-size modes, 2.0mm boundaries, 2.1mm rejection, old-copy absence, and the CSS cascade contract. `node --check app.js`, `node --check bracelet-geometry.js`, and `git diff --check` passed.

## UAT Deployment

Frontend-only change. A controlled UAT commit and `origin/uat` push are required for Vercel UAT deployment. Render is not required.

## Owner Retest

After Vercel UAT reports Ready, test Mixed at 0.1mm and Fixed 10mm within 2mm, then confirm that the unselected Mixed card surface matches 4mm/6mm/10mm while `แนะนำ` remains visible.

## Production Isolation

No production code, configuration, deployment, catalog, renderer geometry, checkout guard, OA friendship logic, or analytics behavior was changed.

## Final Status

Ready for owner real-device retest after the controlled UAT frontend deployment.
