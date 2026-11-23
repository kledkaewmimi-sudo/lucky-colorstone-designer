import { LUMI_ERROR_CODES, lumiError } from '../foundation/errors.js';
export const LUMI_DESIGN_CONTRACT_VERSION = 1;
const TYPES = new Set(['stone', 'spacer', 'charm']);
const SIZES = new Set([4, 6, 10]);
const safeText = (value, max = 160) => typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : '';
export function validateLumiDesignContract(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw lumiError(LUMI_ERROR_CODES.CONTRACT_INVALID, 'Lumi design must be an object.');
  if (input.contractVersion !== LUMI_DESIGN_CONTRACT_VERSION) throw lumiError(
    input.contractVersion == null ? LUMI_ERROR_CODES.CONTRACT_INVALID : LUMI_ERROR_CODES.CONTRACT_VERSION_UNSUPPORTED,
    'Unsupported Lumi design contract version.');
  if (input.source !== 'lumi' || !input.bracelet || typeof input.bracelet !== 'object') throw lumiError(LUMI_ERROR_CODES.CONTRACT_INVALID, 'Invalid Lumi design envelope.');
  const bracelet = input.bracelet;
  if (!Number.isFinite(Number(bracelet.wristSizeCm)) || Number(bracelet.wristSizeCm) <= 0) throw lumiError(LUMI_ERROR_CODES.CONTRACT_INVALID, 'Invalid wrist context.');
  if (!['4', '6', '10', 'mixed'].includes(String(bracelet.beadMode))) throw lumiError(LUMI_ERROR_CODES.CONTRACT_INVALID, 'Invalid bead mode.');
  if (!Array.isArray(bracelet.components) || bracelet.components.length === 0 || !Array.isArray(bracelet.anchoredCharmIds)) throw lumiError(LUMI_ERROR_CODES.CONTRACT_INVALID, 'Invalid Lumi component lists.');
  if (!safeText(input.recommendationId)) throw lumiError(LUMI_ERROR_CODES.CONTRACT_INVALID, 'Invalid recommendation ID.');
  for (const component of bracelet.components) {
    if (!component || typeof component !== 'object' || !TYPES.has(component.type) || !safeText(component.materialId)) throw lumiError(LUMI_ERROR_CODES.CONTRACT_INVALID, 'Invalid Lumi component.');
    if (component.type === 'stone' && !SIZES.has(Number(component.sizeMm))) throw lumiError(LUMI_ERROR_CODES.CONTRACT_INVALID, 'Stone size must be 4, 6, or 10mm.');
    if (component.type !== 'stone' && component.sizeMm != null) throw lumiError(LUMI_ERROR_CODES.CONTRACT_INVALID, 'Only stones may declare a size.');
  }
  if (bracelet.anchoredCharmIds.some((id) => !safeText(id)) || bracelet.anchoredCharmIds.length > 2) throw lumiError(LUMI_ERROR_CODES.CHARM_LIMIT_EXCEEDED, 'Too many or invalid anchored charms.');
  return normalizeLumiDesign(input);
}
export function normalizeLumiDesign(input) {
  const bracelet = input.bracelet;
  return Object.freeze({ contractVersion: LUMI_DESIGN_CONTRACT_VERSION, recommendationId: String(input.recommendationId).trim(), source: 'lumi', bracelet: Object.freeze({ wristSizeCm: Number(bracelet.wristSizeCm), beadMode: String(bracelet.beadMode), mixedPlacingSizeMm: bracelet.beadMode === 'mixed' ? Number(bracelet.mixedPlacingSizeMm) : null, components: Object.freeze(bracelet.components.map((c) => Object.freeze({ type: c.type, materialId: String(c.materialId).trim(), sizeMm: c.type === 'stone' ? Number(c.sizeMm) : null, role: safeText(c.role, 64) || null }))), anchoredCharmIds: Object.freeze(bracelet.anchoredCharmIds.map((id) => String(id).trim())) }), metadata: Object.freeze({ patternId: safeText(input.metadata?.patternId, 80) || null, generatedAt: safeText(input.metadata?.generatedAt) || null, catalogVersion: safeText(input.metadata?.catalogVersion) || null, knowledgeVersion: safeText(input.metadata?.knowledgeVersion) || null }) });
}
