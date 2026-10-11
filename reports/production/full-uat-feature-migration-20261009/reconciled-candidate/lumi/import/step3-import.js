import { createBraceletGeometry, getBraceletCompletionEligibility } from '../../bracelet-geometry.js';
import { validateLumiDesignContract } from '../contracts/design-contract.js';
import { LUMI_ERROR_CODES, lumiError } from '../foundation/errors.js';
const mapById = (items) => new Map((items || []).map((item) => [String(item.id), item]));
// Design import follows the owner's 2026-10-11 policy: the material must be active/representable,
// while a temporarily zero stock level is a fulfillment state that the authoritative checkout stock
// validation still refuses. A permanently inactive, deleted or discontinued material stays rejected.
const usable = (item) => item && item.active !== false;
export function prepareLumiStep3Import({ contract, state, snapshot }) {
  const design = validateLumiDesignContract(contract);
  if (Number(state?.wristSize) !== design.bracelet.wristSizeCm) throw lumiError(LUMI_ERROR_CODES.WRIST_CONTEXT_MISMATCH, 'Lumi wrist context does not match current customer state.');
  if (String(state?.beadSize) !== design.bracelet.beadMode || (design.bracelet.beadMode === 'mixed' && Number(state?.mixedPlacingSize) !== design.bracelet.mixedPlacingSizeMm)) throw lumiError(LUMI_ERROR_CODES.BEAD_CONTEXT_MISMATCH, 'Lumi bead context does not match current customer state.');
  const stones = mapById(snapshot?.stones), charms = mapById(snapshot?.charms), spacers = mapById(snapshot?.spacers);
  const nextStones = design.bracelet.components.map((component, index) => {
    const id = component.materialId;
    if (component.type === 'stone') { const stone = stones.get(id); if (!stone) throw lumiError(LUMI_ERROR_CODES.MATERIAL_NOT_FOUND, 'Stone not found.', { id }); if (!usable(stone)) throw lumiError(LUMI_ERROR_CODES.MATERIAL_INACTIVE, 'Stone unavailable.', { id }); if (!stone.supportedSizesMm.includes(component.sizeMm)) throw lumiError(LUMI_ERROR_CODES.SIZE_UNSUPPORTED, 'Stone size unsupported.', { id, sizeMm: component.sizeMm }); if (design.bracelet.beadMode !== 'mixed' && component.sizeMm !== Number(design.bracelet.beadMode)) throw lumiError(LUMI_ERROR_CODES.SIZE_UNSUPPORTED, 'Fixed bead mode requires matching stones.', { id }); return { componentType: 'stone', stoneId: id, size: component.sizeMm, uniqueId: index + 1 }; }
    if (component.type === 'spacer') { const spacer = spacers.get(id); if (!spacer) throw lumiError(LUMI_ERROR_CODES.MATERIAL_NOT_FOUND, 'Spacer not found.', { id }); if (!usable(spacer) || !Number.isFinite(spacer.effectiveLengthMm) || spacer.effectiveLengthMm <= 0) throw lumiError(LUMI_ERROR_CODES.MATERIAL_INACTIVE, 'Spacer unavailable or unrepresentable.', { id }); return { componentType: 'spacer', spacerId: id, size: spacer.effectiveLengthMm, uniqueId: index + 1 }; }
    const charm = charms.get(id); if (!charm) throw lumiError(LUMI_ERROR_CODES.MATERIAL_NOT_FOUND, 'Loop charm not found.', { id }); if (!usable(charm) || !charm.loopPlaceable) throw lumiError(LUMI_ERROR_CODES.DESIGN_UNREPRESENTABLE, 'Charm cannot be placed in Step 3 sequence.', { id }); return { componentType: 'charm', charmId: id, size: charm.footprintMm, uniqueId: index + 1 };
  });
  const anchored = design.bracelet.anchoredCharmIds.map(String);
  if (anchored.length > 2) throw lumiError(LUMI_ERROR_CODES.CHARM_LIMIT_EXCEEDED, 'Too many anchored charms.');
  anchored.forEach((id) => { const charm = charms.get(id); if (!charm) throw lumiError(LUMI_ERROR_CODES.MATERIAL_NOT_FOUND, 'Anchored charm not found.', { id }); if (!usable(charm)) throw lumiError(LUMI_ERROR_CODES.MATERIAL_INACTIVE, 'Anchored charm unavailable.', { id }); if (charm.loopPlaceable) throw lumiError(LUMI_ERROR_CODES.DESIGN_UNREPRESENTABLE, 'Loop charm cannot be anchored.', { id }); });
  const anchoredLength = anchored.reduce((sum, id) => sum + charms.get(id).footprintMm, 0);
  const components = nextStones.map((item) => item.componentType === 'stone' ? { type: 'stone', sizeMm: item.size } : item.componentType === 'spacer' ? { type: 'spacer', effectiveLengthMm: item.size } : { type: 'charm', footprintMm: item.size }).concat(anchored.map((id) => ({ type: 'charm', footprintMm: charms.get(id).footprintMm })));
  const targetLengthMm = (Number(state.wristSize) + 1.5) * 10;
  const geometry = createBraceletGeometry({ components, targetLengthMm });
  const completion = getBraceletCompletionEligibility({ mode: design.bracelet.beadMode === 'mixed' ? 'mixed' : 'fixed', usedLengthMm: geometry.usedLengthMm, targetLengthMm, fixedComponentLengthMm: design.bracelet.beadMode === 'mixed' ? 0 : Number(design.bracelet.beadMode), supportedComponentLengthsMm: [4, 6, 10] });
  if (!completion.eligible) throw lumiError(LUMI_ERROR_CODES.FIT_INVALID, 'Lumi design does not satisfy existing bracelet fit.', { completion });
  return Object.freeze({ selectedStones: Object.freeze(nextStones), selectedCharmIds: Object.freeze(anchored), selectedCharmId: anchored[0] || null, uniqueCounter: nextStones.length, activeSlotIndex: null, newlyAddedIds: Object.freeze([]), geometry, completion, catalogVersion: snapshot.catalogVersion, anchoredLength });
}
export function commitLumiStep3Import(state, prepared) { Object.assign(state, { selectedStones: prepared.selectedStones.map((item) => ({ ...item })), selectedCharmIds: [...prepared.selectedCharmIds], selectedCharmId: prepared.selectedCharmId, uniqueCounter: prepared.uniqueCounter, activeSlotIndex: null, newlyAddedIds: [] }); return state; }
