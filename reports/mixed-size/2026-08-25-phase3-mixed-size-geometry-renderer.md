# Phase 3 — Mixed Size geometry and renderer

Date: 2026-08-25
Workspace: `D:\Projects\lucky-colorstone-uat`
Branch: `uat`

## Safety precheck

- `main` matched `origin/main` at `0e958ff63b322b179e8184c4c6640fb22518756a` before UAT changes.
- No production workspace, branch, catalog, Supabase write, checkout, payment, LINE/LIFF, Meta, analytics, deployment, or service configuration was changed.
- The UAT backend and frontend safety guards pass, preserving isolated UAT routing and the Step 4/checkout blocks.

## Derived physical geometry

Added `bracelet-geometry.js`, a pure helper module used by the existing canonical component-list and resolved-layout flow.

- Stones resolve only from their own physical `component.sizeMm` / `component.size` value, accepted only for 4, 6, or 10mm.
- Spacers resolve from `effectiveLengthMm`.
- Charms resolve from `footprintMm`.
- `createBraceletGeometry()` derives `usedLengthMm`, `targetLengthMm`, `differenceMm`, `fitStatus`, and `isWithinTolerance`.
- The existing capacity metrics and `ResolvedLayout.summary` expose the derived fit values. No geometry or `ResolvedLayout` data is persisted.

The existing renderer already takes each placed node's physical `sizeMm` to calculate angular width and visual radius. The canonical capacity path now uses the same physical footprint helper, removing any possible capacity calculation from global mixed placement/filter size. Empty/trailing visual placeholders remain layout-only and are not included in used physical length.

Fit status uses the approved 1.0mm inclusive tolerance:

```text
-1.0mm through +1.0mm: within_tolerance
below -1.0mm: underfill
above +1.0mm: overflow
```

Step 4 behavior was not changed in this phase. Overflow trimming and any final fit gate remain deferred for the later validation/checkout phase.

## Verification

Completed successfully:

```text
node --check app.js
node --check bracelet-geometry.js
node --test tests/mixed-size-geometry.test.mjs tests/mixed-size-state.test.mjs tests/mixed-size-ux.test.mjs tests/guest-design-state.test.mjs tests/uat-backend-guard.test.cjs tests/uat-frontend-safety.test.cjs
git diff --check
```

Result: 45 tests passed, 0 failed. Existing Node module-type warnings were the only warnings.

The focused geometry tests cover fixed 4/6/10 regression, mixed 4/6/10 = 20mm, repeated sizes, per-component independence from placement/filter state, spacer/charm footprints, add/remove/order behavior, fixed/mixed transitions, exact tolerance boundaries, derived-only layout data, and renderer size wiring.

## Live validation status

Browser automation is unavailable in this environment. After the UAT-only deployment, a read-only static fetch will confirm the deployment remains reachable and production-independent. Owner manual renderer confirmation remains required for visible mixed 4/6/10 scaling, order, add/remove rendering, and fixed-mode visual regression.

## Deferred items

- Final overflow trimming and final fit/Step 4 gate.
- Thai Mixed Size labels: record for final cosmetic cleanup only; no Phase 3 time spent on labels.
