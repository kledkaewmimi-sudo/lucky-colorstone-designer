# Delete/Re-add Render-Sequence Forensics — UAT

## Owner Feedback Previous Report Incomplete

The prior export proved only that the final 17-node state was structurally full. It did not retain all mutation and post-readd paint boundaries, so it could not prove or reject a transient divergence.

## Complete Capture Timeline

`?slot_forensics=1` now preserves ordered history for:

| State | Capture boundary |
| --- | --- |
| A | Before delete mutation |
| B | Immediately after delete mutation, before SVG render |
| C | First SVG render after delete |
| D | Before re-add mutation |
| E | Immediately after re-add mutation, before SVG render |
| F | First SVG render after re-add |
| G | Next animation-frame paint after re-add |
| H | Final settled animation-frame paint after re-add |

G and H do not force a renderer invocation. Their `RENDER_SEQUENCE` therefore makes any absence of a second renderer run explicit while still recording the actual painted DOM state.

## State A-H Comparison Table

Each snapshot includes action/render sequences; canonical, component-list, resolved, and DOM totals; occupancy/empty/placeholder totals; completion; all slot/node records; and the full neighbor-distance list. History is append-only and the mobile export serializes the complete `slotForensics` object, including `history`.

## First Post-Delete Render

State C is the first rendered SVG after the delete mutation. It can be compared with B to distinguish mutated logical state from unreconciled pre-delete DOM.

## First Post-Readd Render

State F is the first rendered SVG after the re-add mutation. It is the baseline for all transient-divergence comparisons.

## Final Settled Render

State H is captured after two animation frames. It carries `firstPostReaddComparison`, containing per-slot and summary differences from State F.

## Canonical vs ComponentList vs Resolved vs DOM

Every snapshot reports canonical, component-list, resolved, and DOM totals separately, including occupied, empty, and placeholder counts. The DOM record separately counts stone, empty, and placeholder groups and preserves each node’s class, image href, and placeholder subtype.

## Neighbor Gap Comparison

Every adjacent pair, including wrap-around, records source indexes, angle delta, arc distance, expected visual spacing, residual gap, and `RESIDUAL_GAP_GT_1MM`.

## Transient Divergence Analysis

State F versus H detects node count, empty/placeholder count, identity, kind, size, render size, angle, angle width, center, DOM image, and source-index differences. The export identifies the first divergence rather than inferring from final counts.

## Angular Outlier Analysis

For a 17×10 mm final ring, expected angular width is approximately 21.1765°. The trace evaluates all neighbor pairs, including last-to-first, to identify a residual gap over 1 mm.

## Root Cause Status

Not yet proven. The final owner snapshot rules out a final empty-slot leak; the next A–H owner export is required before any behavioral change.

## Next Owner Capture Instructions

Open `https://uat.customize.luckycolorstone.com/?slot_forensics=1`, perform exactly one delete and one re-add, wait briefly for the settled panel summary, then tap `Export / Copy Trace` and provide the full copied JSON. Confirm the panel shows States A–H in `history`.

## Production Isolation

This is UAT-only, query-gated diagnostic instrumentation. Production is unchanged.
