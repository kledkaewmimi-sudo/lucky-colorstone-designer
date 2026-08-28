# UAT Discrete Completion Stabilization

## Why Universal 2mm Was Invalid

The former shared checkout gate required `abs(differenceMm) <= 2` for every mode. A 16.0 cm wrist produces a 175 mm bracelet target. In fixed 10 mm mode, 17 beads occupy 170 mm and 18 beads occupy 180 mm, so no integer bead count can satisfy that continuous tolerance. The red test confirmed the valid 17-bead terminal layout was blocked.

The 2 mm fit status is retained as diagnostic geometry metadata only. It is no longer the Step 3, Step 4, or add-placement completion criterion.

## Pre-Mixed Fixed Behavior

The last pre-Mixed fixed implementation in commit `6af9c45^` treated a fixed bracelet as full when its discrete placeholder capacity was exhausted (`numPlaceholders === 0`) without overflow. This restoration uses the equivalent business rule rather than renderer state: a fixed bracelet is terminal when another bead of its selected fixed diameter cannot physically fit.

## Fixed Completion Restoration

Fixed 4 mm, 6 mm, and 10 mm placement now uses a strict physical capacity boundary (`next used length <= target length`). Completion is true at the terminal discrete capacity, including 16.0 cm / 10 mm at 170 mm. Deleting a bead makes that diameter placeable again; re-adding returns to terminal completion.

## Mixed Placeability Completion

Mixed completion evaluates all supported stone diameters: 4 mm, 6 mm, and 10 mm. It is incomplete while any supported stone can fit. It is terminal once none can fit without exceeding physical capacity. Anchored charm/spacer footprints remain included through the resolved-layout capacity metrics; they are not required as completion items.

## Dead-Zone Elimination

Add eligibility and completion use the same strict geometry boundary. Therefore, for a non-overflow layout, either at least one valid mode-supported stone can be placed or the layout is complete. The former 2 mm gap between placement and final validation is no longer used by the application flow.

## All Wrist/Fixed-Size Matrix

The test matrix covers every selectable wrist size from 14.0 cm through 20.0 cm in 0.5 cm increments, for fixed 4 mm, 6 mm, and 10 mm. Each configuration reaches `floor(target / bead size)` terminal beads and is completable.

## Renderer Preservation

No renderer visual, placeholder-ring, retained-slot, deletion-position, bead-order, or sticky-layer code was changed. The existing restoration test remains green.

## Step4 Separation

Step 3 validation, Step 3 Next, `goToStep(4)`, and checkout use the same resolved-layout discrete completion eligibility. The separate LINE identity and OA friendship operational gates remain unchanged and mandatory.

## Tests

Red before implementation:

- 16.0 cm / fixed 10 mm terminal layout was rejected by the universal 2 mm gate.
- Mixed exhaustive scan found no-placeable/incomplete states under the former shared tolerance formulas.

Green after implementation:

- 44 completion/geometry/pricing/renderer tests passed.
- 42 LINE/OA regression tests passed.
- `node --check app.js` and `node --check bracelet-geometry.js` passed.

## UAT Deployment

Frontend-only UAT deployment is required after the controlled commit. Render is not required.

## Owner Retest

This change is ready for owner real-device retest. It does not claim the UAT flow is fixed until that retest succeeds.

## Production Isolation

Production was not changed.
