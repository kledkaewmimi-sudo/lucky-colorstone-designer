# Delete/Re-add Full Slot Forensics — UAT

## Owner Reproduction After Previous Fixes

Owner real-device testing still reproduces a visible gap after delete/re-add. This change does not claim the gap is fixed or identify its cause before a device capture is collected.

The owner-provided final render snapshot is structurally full: 17 canonical items, 17 component-list items, 17 resolved nodes, 17 DOM component nodes, all occupied 10 mm stones, and `complete: true`. This does not support a final-state retained-empty or placeholder leak.

## Why Previous Hypotheses Were Insufficient

Earlier checks covered retained-empty counts, unique IDs, and terminal capacity placeholders. They did not preserve a single trace that joins canonical state, component list, resolved layout nodes, rendered SVG nodes, and angular neighbor distances for the same owner action sequence.

## Full Slot Snapshot

In UAT only, open Step 3 with `?slot_forensics=1`. The overlay captures every render to `window.__slotForensics.captures` and exposes one-click `Capture A`, `Capture B`, and `Capture C` controls. It also automatically captures:

- `STATE_A_BEFORE_DELETE` immediately before the delete mutation;
- `STATE_B_AFTER_ONE_DELETE` after the following render;
- `STATE_C_AFTER_ONE_READD` after the following add render.

Each snapshot includes action/render sequence, canonical/list/resolved/DOM totals, occupied/empty/placeholder totals, every slot’s source and order indexes, identity, size/physical/render metadata, resolved geometry, SVG group attributes and image href, placeholder subtype, decorative rail node, and full-ring neighbor distances. No user identity or secrets are recorded.

The exported trace now contains ordered `history` rather than only the last named capture. It automatically records `STATE_A_BEFORE_DELETE`, `STATE_B_AFTER_ONE_DELETE`, `STATE_C_IMMEDIATE_AFTER_READD`, and `STATE_D_FINAL_SETTLED_RENDER`. State D is captured after two animation frames and contains a per-slot comparison against the latest State C, including node appearance/disappearance and kind, size, angle, angle-width, and center changes.

## Visible Gap Classification

The overlay derives its classification from the rendered SVG group and its resolved geometry, not from counts alone. It reports `RETAINED_EMPTY`, `TRAILING_PLACEHOLDER`, `ANGLE_GAP_WITH_NO_NODE`, `MISSING_COMPONENT_NODE`, or `NONE`; the decorative cream SVG rail is recorded separately as `DECORATIVE_PLACEHOLDER_RAIL` so it cannot be mistaken for a component slot.

## Node vs Angular Gap

For every adjacent placed pair, the capture records source indexes, angle delta, actual arc spacing, expected visual spacing from current render sizes, and the residual visual gap. A residual over 1 mm is flagged as an angular gap with no empty SVG node.

For the owner’s 17×10 mm final ring, the expected uniform angular width is `360 / 17 = 21.1765°`. The final snapshot’s supplied `angleWidthDeg` matches that expectation. A transient or visual-only divergence remains unproven until the State C-to-D comparison is exported.

## Retained Metadata Classification

`uniqueId` and `sourceIndex` are positional metadata. `sizeMm` is physical and angular layout metadata; `renderSizeMm` is visual metadata. The diagnostic reports `OLD_SIZE_METADATA_ACTIVE_AFTER_READD: YES` only when the resolved node’s physical or render size differs from its current canonical item.

## Neighbor Distance Analysis

Use `STATE_C_AFTER_ONE_READD.neighborDistances` to locate an outlier. The matching `nodes` entries identify the exact inputs and SVG groups on either side of the arc; this is the required proof path for any subsequent behavioral fix.

## Exact Root Cause

Not yet proven. The final-state empty-slot hypothesis is not supported by the owner evidence. The remaining question is whether State C and State D expose a transient node/geometry divergence, or whether no such divergence exists and the visible effect is outside the SVG component-node model.

## Minimal Fix

None applied. The only application change is UAT-gated diagnostic instrumentation.

## Full-Ring Regression

`tests/delete-readd-slot-forensics.test.mjs` passes three checks: UAT diagnostic coverage, a 170 mm 20-component Mixed full ring (13×10, 6×6, 1×4) for same/smaller/larger middle re-adds, and replacement angular footprint derived from 4 mm rather than the deleted 10 mm. These are code-level regression checks only; they do not replace the owner device trace. The repository-wide command has five unrelated pre-existing failures: two tests require unavailable UAT backend credentials, one has a Beryl test-module declaration error, and two assert UI patterns already absent before this change.

## Separate Payment Issue Recorded

`KNOWN_SEPARATE_ISSUE: STEP4_CHECKOUT_FIT_TOLERANCE_GATE`

No payment or checkout code was changed.

## UAT Deployment

Deployed to the isolated UAT project and verified served at `https://uat.customize.luckycolorstone.com/app.js`. Reproduce the owner sequence with `?slot_forensics=1` and export `window.__slotForensics.captures` after State C.

## Owner Retest

Pending the UAT diagnostic deployment and owner real-device capture. The required evidence is the full JSON capture plus a screenshot of the visible gap at State C.

## Production Isolation

Production is unchanged. The diagnostic is both hard-coded to `APP_ENV === 'uat'` and query-gated.
