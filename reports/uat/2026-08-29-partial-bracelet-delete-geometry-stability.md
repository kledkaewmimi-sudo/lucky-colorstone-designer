# Partial Bracelet Delete Geometry Stability

## Owner Video Evidence

On an incomplete Step 3 bracelet, deleting one placed component collapsed the remaining components into a smaller ring and made their visual diameter larger. Completed-ring delete/re-add remained approved and must not change.

## Reproduction

For a 16 cm wrist in Fixed 10 mm mode, eight placed 10 mm stones originally rendered with nine available 10 mm capacity positions: 170 mm visual loop. Deleting the middle stone retained an empty 10 mm slot but suppressed every available-capacity position, leaving an 80 mm visual loop. The unchanged SVG radius was then scaled over 80 mm rather than 170 mm.

## Complete vs Partial Delete Comparison

Completed 17 x 10 mm: before and after delete both have a 170 mm visual loop; the retained empty slot replaces the removed 10 mm node, so no reflow occurs.

Partial 8 x 10 mm: before delete has 80 mm placed visual footprint plus nine capacity positions. After delete, the retained slot still has a 10 mm visual footprint. Suppressing all capacity positions incorrectly reduced the total virtual loop from 170 mm to 80 mm.

## Geometry Before Delete

The renderer uses `loopCircumferenceMm = totalVirtualDiameter` and maps each component size to angular width. The pre-delete partial loop included the wrist-derived available-capacity placeholders, so unaffected nodes had stable angle, center, and scale.

## Geometry After Delete

Physical used length correctly dropped by the deleted component size because retained empties have zero physical length. The old trailing-placeholder suppression also removed the remaining visual loop capacity, which changed angular width, center angle, and `scaleMmToPx` for every survivor.

## Exact Root Cause

`createResolvedBraceletLayout()` used the physical completion state to suppress all trailing capacity placeholders whenever a retained empty existed. That conflated physical completion length with visual design-loop length. It is why partial deletion rebuilt a short, visually enlarged ring.

## Physical Length vs Visual Layout

Physical length remains authoritative for completion, pricing, and checkout: retained empties contribute 0 mm. Visual layout now counts a retained empty's preserved size when calculating remaining display capacity. This keeps the selected wrist's design loop stable without treating an empty slot as physical bracelet length.

## Minimal Fix

The renderer now computes trailing visual-capacity count from `visualUsedLengthMm` (all component-list sizes, including retained-slot visual footprint), while `completionEligibility` continues to use authoritative physical used length. The SVG radius, start angle, bead sizing formula, completion rules, and placement priority were not changed.

For a complete bracelet, the remaining visual space is below one placeable component, so the approved one-retained-gap result remains unchanged. For a partial bracelet, the pre-existing available capacity remains visible and the deleted component is represented by exactly one retained slot.

## 4mm Regression

Partial 4 mm middle delete preserves every unaffected source identity, angular position, angular width, and visual size. Re-add restores the retained identity without loop reflow.

## 6mm Regression

Partial 6 mm middle delete preserves every unaffected source identity, angular position, angular width, and visual size. Re-add restores the retained identity without loop reflow.

## 10mm Regression

Partial 10 mm middle delete preserves every unaffected source identity, angular position, angular width, and visual size. Completed 17 x 10 mm deletion remains one retained slot and zero trailing capacity placeholders.

## Mixed Regression

Partial Mixed sequences were tested deleting a 10 mm, 6 mm, and 4 mm component. Each retained visual footprint keeps the loop circumference and every unaffected placement stable; re-add consumes the retained identity.

## Re-add Regression

Existing retained-slot placement continues to replace the first retained slot before append. Regression coverage verifies identity preservation and no remaining empty slot after replacement.

## Closed-Bug Regression

The UAT focused closed-bug suite passed 90/90: partial placement stability, full-ring one/two-delete behavior, retained-slot re-add, duplicate-placeholder prevention on completed bracelets, physical empty length, Fixed and Mixed completion, 1/2/3 mm final gaps, Step 2, Step 4 fit eligibility, pricing, LIFF configuration, and renderer invariants. `node --check app.js`, `node --check bracelet-geometry.js`, and `git diff --check` also passed.

## UAT Deployment

UAT only. The committed UAT branch revision is deployed through the existing UAT deployment path; Production files and configuration are excluded.

## Owner Real-Device Acceptance

Owner retest remains required on `https://uat.customize.luckycolorstone.com/`: partial delete/re-add for 4 mm, 6 mm, 10 mm, and Mixed; then completed-ring delete/re-add. Expected: only the deleted position changes, with no survivor reflow or visual enlargement.

## Production Isolation

No Production files, branch, deployment, payment settings, LINE/OA configuration, or backend code were changed.
