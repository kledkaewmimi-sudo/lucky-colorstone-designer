# Core renderer known-good restoration

## Owner Video Evidence

The owner video is authoritative: Step 2's body remained visible after the stepper moved to Step 3; the dotted empty-slot ring was absent; and deleting a normal placed bead appeared to reflow later positions. It also showed an incomplete state after placement had rejected a final supported component.

## Regression Introduction

`bcc8963c75082683a348a9c455bd00f0c22e6810` (`fix render physical underfill gaps in UAT`) introduced the physical-underfill preview. It removed empty and trailing placeholder nodes for underfill layouts and spread only placed components over the target circumference.

## Known-Good Commit/Implementation

The known-good Step 3 renderer source is `d892d16576435a97c81c4796ab0e118d33182d68`, immediately before the physical-gap experiment. Its `createResolvedBraceletLayout` always maps retained empty loop slots and derives trailing placeholder nodes, then distributes the virtual slot sequence around the circle.

## Step2-Step3 Transition Root Cause

`renderApp` rendered the stepper before awaiting `renderStepViews`. Step 3 catalog warm-up may await before active view classes are changed, exposing a Step 3 stepper with the Step 2 body. Rendering the view first keeps the existing body visible through preparation and commits the active Step 3 body before the Step 3 stepper.

## Placeholder Ring Restoration

The physical-gap branches were removed. The restored layout includes retained empty loop slots and `trailingPlaceholderCount` for all layout states. The existing SVG placeholder DOM/class contract remains: `bead-node placeholder`, dotted stroke `3 3`, and active-slot dotted stroke `4 2`.

## Delete Position Restoration

Normal removal retains the source array index by replacing the item with `createEmptyLoopSlot`. The renderer maps that index to a placeholder node, and subsequent add operations fill the first retained empty slot before appending. The existing special Bee Heart removal behavior is unchanged.

## Last-Slot Dead Zone Root Cause

The prior add/fill path compared raw remaining millimetres to the next component length, while completion used the inclusive +/-2.0mm physical-fit rule. A final component that ended within the allowed positive 2.0mm boundary could therefore be rejected before it reached the shared completion gate.

## Fit/Placement Compatibility

`getNextComponentPlacementEligibility` now uses the existing geometry fit status for the placement upper boundary. Underfilled construction remains allowed; an addition is rejected only when it would exceed +2.0mm. Step 3 completion and Step 4 continue to use `getCheckoutFitEligibility` and require final fit within +/-2.0mm. ResolvedLayout remains runtime-only and is not persisted.

## Interaction Tests

Focused tests passed: 78 checks.

- Step 2-to-Step 3 commits the body before the stepper.
- Empty Step 3 retains dotted placeholders.
- Add A/B/C, delete B, and replacement position contracts retain normal source slots.
- Final-slot fit cases pass for fixed 4mm, 6mm, 10mm, and mixed 4/6/10.
- An underfilled mixed case retains a supported placeable component.
- Existing geometry, pricing, state, LINE identity/OA, deferred-auth, and UAT safety checks passed.

Static source/DOM-contract coverage was performed locally. A real-device browser session was unavailable in this environment; owner retest remains required.

## UAT Deployment

UAT deployment is performed only after the scoped commit is pushed to `origin/uat`. No backend file changed, so Render deployment is not required.

## Owner Retest

Required. Verify the owner video sequences on a real device: Step 2 -> Step 3 transition; empty dotted ring; add/delete/re-add stable slot; and complete/underfilled final-slot behavior for 4mm, 6mm, 10mm, and mixed.

## Production Isolation

Only UAT frontend renderer/navigation/geometry tests and this UAT report are in scope. No production, catalog, Step 2 styling, sticky behavior, LINE/OA flow, Supabase, transaction, or backend file is changed.
