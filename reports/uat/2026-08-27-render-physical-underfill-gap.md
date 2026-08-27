# Render physical underfill gap

## Owner Evidence

The Step 3 fit gate correctly rejected bracelets outside the inclusive ±2.0mm tolerance, but the preview visually closed the ring. This made the incomplete toast appear contradictory.

## Proven Root Cause

When the remaining length was smaller than one placement-size unit, `trailingPlaceholderCount` was zero. The renderer then used the placed-item total as its circumference, redistributing those beads over all 360 degrees.

## Existing Renderer Behavior

The old underfilled preview used `totalVirtualDiameter` as `loopCircumferenceMm` for all states. With no trailing placeholder, a physically short sequence was geometrically expanded into a closed visual ring.

## Physical Gap Rendering

The runtime-only ResolvedLayout now:

- identifies `fitStatus === 'underfill'` from existing canonical geometry;
- excludes derived and empty placeholder nodes from that preview's occupied span;
- uses the target bracelet circumference for the underfilled preview;
- leaves the unoccupied angular remainder as a real visible gap.

No component is added, resized, reordered, or persisted. For valid and overfilled layouts, the existing renderer path remains unchanged.

## Fit vs Underfill Visualization

- Difference from 0 through -2.0mm: visually closed, matching existing accepted appearance and the inclusive fit rule.
- Difference of -2.1mm or below: visible physical gap and Step 3 remains blocked.

## Fixed Modes

The same target-circumference logic applies to 4mm, 6mm, and 10mm. Their angular widths remain calculated as `item.sizeMm / loopCircumferenceMm`; physical proportions are preserved.

## Mixed Mode

Mixed 4/6/10 sequences use the same renderer path. The placed order is unchanged and each component keeps its existing physical size ratio.

## Overfill Behavior

Overfilled and in-tolerance layouts retain the prior rendering path. No overfilled layout is compressed or made valid by this change.

## Validation Preservation

`createCurrentBraceletResolvedLayout`, `getResolvedLayoutFitEligibility`, `getCheckoutFitEligibility`, `getFitStatus`, Step 3 Next, and `goToStep(4)` were not changed. The canonical inclusive 2.0mm fit rule remains intact.

## Tests

37 focused tests passed. New renderer coverage verifies visible gaps for fixed 4mm/6mm/10mm and mixed layouts at a 2.1mm underfill, closed visuals through the -2.0mm boundary, gap reduction as components are added, physical angular sizing, and unchanged shared validation. Syntax and `git diff --check` passed.

## UAT Deployment

Frontend-only deployment required after controlled commit and push to `origin/uat`. Render is not required.

## Owner Retest

Real-device confirmation is required. Verify that a physically underfilled ring now visibly shows a gap and remains blocked, while a design within 2.0mm remains closed and proceeds to the OA gate.

## Production Isolation

No production branch, deployment, configuration, catalog, Supabase resource, checkout safety, OA logic, or credential was changed.

## Final Status

Ready for owner real-device retest after UAT Vercel deployment; not claimed fixed until that retest passes.
