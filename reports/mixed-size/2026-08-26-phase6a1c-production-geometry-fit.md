# Phase 6A.1C: Production per-component geometry and fit

## Scope

This phase adds only per-component physical geometry, target comparison, the
approved 1.0mm fit tolerance, and mixed-to-fixed trailing trimming. Pricing,
order payloads, checkout, server code, CRM, restore, LINE, and analytics were
not changed.

## Canonical geometry

`createBraceletGeometry()` in `bracelet-geometry.js` is the single geometry
calculation. It derives (without persistence):

- `usedLengthMm`
- `targetLengthMm`
- `differenceMm` (`usedLengthMm - targetLengthMm`)
- `fitStatus`

Each placed stone resolves only from its stored physical `size` (4, 6, or
10mm). Spacers resolve from `effectiveLengthMm`; charms resolve from the
production charm footprint resolver and are passed as `footprintMm`. Missing,
unsupported, or non-positive dimensions return `fitStatus: 'invalid'` with an
`invalidComponents` report—there is no mixed-mode or implicit 6mm fallback.

`ResolvedLayout` remains a render-time derivation and is not added to customer
state, browser storage, orders, or persisted data.

## Target length source

The established production/UAT rule is retained exactly:

`targetLengthMm = (State.wristSize + TOLERANCE_CM) * 10`

`TOLERANCE_CM` remains the existing 1.5cm bracelet allowance. The fit decision
uses unrounded precision: -1.0mm through +1.0mm inclusive is
`within_tolerance`; below is `underfill`, above is `overflow`.

## Mixed-to-fixed behavior

The existing transition first validates that every placed stone supports the
requested fixed size. A failed validation returns the unsupported components
and does not mutate the design. A successful conversion changes every stored
stone size to the selected fixed size, recalculates geometry, and trims only
the trailing selected components while the result is overflow. It stops at the
first non-overflow result, preserving retained order and never removing a
middle component, reordering, substituting, or auto-adding. Anchored charm
footprints participate in the overflow calculation but are not mutable
trailing sequence components. If the final result is underfill, it is returned
unchanged for later UI validation.

## Verification

Passed:

- `node --check bracelet-geometry.js`
- `node --check mixed-size-transition-trim.js`
- `node --check app.js`
- focused geometry/fit tests
- existing Phase 6A.1A state tests
- existing Phase 6A.1B selector tests
- `git diff --check`

The focused test covers 4/6/10 stones, charm and spacer footprints, mixed
ordering, selector non-mutation, tolerance boundaries, invalid dimensions,
mixed-to-fixed validation, deterministic trailing-only minimum trim, no
auto-add underfill, and fixed 4/6/10 regression.
