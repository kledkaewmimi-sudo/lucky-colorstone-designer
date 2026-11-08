// Mirrored from existing Step 3 behavior: app.js selectedCharmIds preserves at most two
// anchored IDs; bee_heart is a loop sequence item; Step 3 (app.js + lumi/import/step3-import.js)
// accepts loop charms, anchored talismans and spacers in every bead mode (4mm / 6mm / 10mm / mixed).
// This advisory adapter is not runtime authority.
export const LUMI_STEP3_CHARM_CONSTRAINTS = Object.freeze({
  sourceOfTruth:'existing_step3_runtime',
  sourceReferences:Object.freeze(['app.js:140,1084-1121,5117-5121','lumi/import/step3-import.js:15,19']),
  maxAnchoredCharms:2,
  anchoredCharmRepresentation:'separate_ids',
  loopCharmRepresentation:'sequence_item',
  loopAllowedStoneSizesMm:Object.freeze([4,6,10]),
  placementTypes:Object.freeze(['anchored','loop'])
});
