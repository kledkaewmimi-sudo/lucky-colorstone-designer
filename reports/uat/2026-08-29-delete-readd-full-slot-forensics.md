# Delete/Re-add Full Slot Forensics — UAT

## Owner Reproduction After Previous Fixes

Owner real-device testing still reproduces a visible gap after delete/re-add. This change does not claim the gap is fixed or identify its cause before a device capture is collected.

## Why Previous Hypotheses Were Insufficient

Earlier checks covered retained-empty counts, unique IDs, and terminal capacity placeholders. They did not preserve a single trace that joins canonical state, component list, resolved layout nodes, rendered SVG nodes, and angular neighbor distances for the same owner action sequence.

## Full Slot Snapshot

In UAT only, open Step 3 with `?slot_forensics=1`. The overlay captures every render to `window.__slotForensics.captures` and exposes one-click `Capture A`, `Capture B`, and `Capture C` controls. It also automatically captures:

- `STATE_A_BEFORE_DELETE` immediately before the delete mutation;
- `STATE_B_AFTER_ONE_DELETE` after the following render;
- `STATE_C_AFTER_ONE_READD` after the following add render.

Each snapshot includes action/render sequence, canonical/list/resolved/DOM totals, every slot’s source and order indexes, identity, size/physical/render metadata, resolved geometry, SVG group attributes and image href, placeholder subtype, decorative rail node, and full-ring neighbor distances. No user identity or secrets are recorded.

## Visible Gap Classification

The overlay derives its classification from the rendered SVG group and its resolved geometry, not from counts alone. It reports `RETAINED_EMPTY`, `TRAILING_PLACEHOLDER`, `ANGLE_GAP_WITH_NO_NODE`, `MISSING_COMPONENT_NODE`, or `NONE`; the decorative cream SVG rail is recorded separately as `DECORATIVE_PLACEHOLDER_RAIL` so it cannot be mistaken for a component slot.

## Node vs Angular Gap

For every adjacent placed pair, the capture records source indexes, angle delta, actual arc spacing, expected visual spacing from current render sizes, and the residual visual gap. A residual over 1 mm is flagged as an angular gap with no empty SVG node.

## Retained Metadata Classification

`uniqueId` and `sourceIndex` are positional metadata. `sizeMm` is physical and angular layout metadata; `renderSizeMm` is visual metadata. The diagnostic reports `OLD_SIZE_METADATA_ACTIVE_AFTER_READD: YES` only when the resolved node’s physical or render size differs from its current canonical item.

## Neighbor Distance Analysis

Use `STATE_C_AFTER_ONE_READD.neighborDistances` to locate an outlier. The matching `nodes` entries identify the exact inputs and SVG groups on either side of the arc; this is the required proof path for any subsequent behavioral fix.

## Exact Root Cause

Not yet proven. The owner-visible real-device trace has not been supplied to this workspace. No inference has been made from unit counts or synthetic data.

## Minimal Fix

None applied. The only application change is UAT-gated diagnostic instrumentation.

## Full-Ring Regression

`tests/delete-readd-slot-forensics.test.mjs` passes three checks: UAT diagnostic coverage, a 170 mm 20-component Mixed full ring (13×10, 6×6, 1×4) for same/smaller/larger middle re-adds, and replacement angular footprint derived from 4 mm rather than the deleted 10 mm. These are code-level regression checks only; they do not replace the owner device trace.

## Separate Payment Issue Recorded

`KNOWN_SEPARATE_ISSUE: STEP4_CHECKOUT_FIT_TOLERANCE_GATE`

No payment or checkout code was changed.

## UAT Deployment

Not deployed in this change set. Deploy the UAT branch, then reproduce the owner sequence with `?slot_forensics=1` and export `window.__slotForensics.captures` after State C.

## Owner Retest

Pending the UAT diagnostic deployment and owner real-device capture. The required evidence is the full JSON capture plus a screenshot of the visible gap at State C.

## Production Isolation

Production is unchanged. The diagnostic is both hard-coded to `APP_ENV === 'uat'` and query-gated.
