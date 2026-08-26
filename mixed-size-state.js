export const FIXED_BEAD_SIZES = Object.freeze(['4', '6', '10']);
export const MIXED_BEAD_SIZE_MODE = 'mixed';

export function isExplicitBeadSizeMode(value) {
  const mode = String(value ?? '').trim();
  return FIXED_BEAD_SIZES.includes(mode) || mode === MIXED_BEAD_SIZE_MODE;
}

function normalizeFixedBeadSize(value) {
  const size = String(value ?? '').trim();
  return FIXED_BEAD_SIZES.includes(size) ? size : '';
}

export function normalizeBraceletSizeMode(value, fallback = '6') {
  const mode = String(value ?? '').trim();
  if (mode === MIXED_BEAD_SIZE_MODE) return mode;
  if (mode === '8') return '10';
  return normalizeFixedBeadSize(mode) || normalizeFixedBeadSize(fallback) || '6';
}

export function normalizeMixedPlacingSize(value, fallback = '6') {
  return Number(normalizeFixedBeadSize(value) || normalizeFixedBeadSize(fallback) || '6');
}

export function getStoneSupportedSizes(stone) {
  if (!Array.isArray(stone?.sizes)) return [];
  return FIXED_BEAD_SIZES.map(Number).filter((size) => stone.sizes.map(Number).includes(size));
}

export function stoneSupportsSize(stone, size) {
  return getStoneSupportedSizes(stone).includes(normalizeMixedPlacingSize(size));
}

export function normalizeMixedSizeFilter(value, fallback = '6') {
  const filter = String(value ?? '').trim();
  return filter === 'all' || FIXED_BEAD_SIZES.includes(filter) ? filter : fallback;
}

export function stoneMatchesMixedSizeFilter(stone, filter) {
  const normalizedFilter = normalizeMixedSizeFilter(filter, 'all');
  return normalizedFilter === 'all' ? getStoneSupportedSizes(stone).length > 0 : stoneSupportsSize(stone, normalizedFilter);
}

export function getMixedPlacementSizeForStone(stone, mixedPlacingSize) {
  const size = normalizeMixedPlacingSize(mixedPlacingSize);
  return stoneSupportsSize(stone, size) ? size : null;
}

function selectedStoneItems(selectedStones = []) {
  return Array.isArray(selectedStones) ? selectedStones.filter((item) => String(item?.componentType || item?.type || 'stone').toLowerCase() === 'stone') : [];
}

export function validateMixedSequenceForFixedSize(selectedStones, catalog, targetSize) {
  const normalizedTargetSize = normalizeFixedBeadSize(targetSize);
  if (!normalizedTargetSize) return { ok: false, reason: 'invalid_target_size', unsupportedStones: [] };
  const byId = new Map((catalog || []).map((stone) => [String(stone?.id || ''), stone]));
  const unsupportedStones = selectedStoneItems(selectedStones)
    .filter((item) => !stoneSupportsSize(byId.get(String(item.stoneId || item.id || '')), normalizedTargetSize))
    .map((item) => ({ stoneId: String(item.stoneId || item.id || ''), size: Number(item.size) }));
  return unsupportedStones.length === 0
    ? { ok: true, targetSize: Number(normalizedTargetSize), unsupportedStones: [] }
    : { ok: false, reason: 'unsupported_stones', targetSize: Number(normalizedTargetSize), unsupportedStones };
}

export function transitionBraceletSizeMode(state = {}, targetMode, catalog = []) {
  const currentMode = isExplicitBeadSizeMode(state.beadSize)
    ? String(state.beadSize)
    : null;
  const requestedMode = String(targetMode ?? '').trim();
  if (![...FIXED_BEAD_SIZES, MIXED_BEAD_SIZE_MODE].includes(requestedMode)) return { ok: false, reason: 'invalid_target_size', unsupportedStones: [] };
  const selectedStones = Array.isArray(state.selectedStones) ? state.selectedStones : [];
  if (requestedMode === MIXED_BEAD_SIZE_MODE) {
    const mixedPlacingSize = currentMode === MIXED_BEAD_SIZE_MODE
      ? normalizeMixedPlacingSize(state.mixedPlacingSize)
      : (currentMode ? Number(currentMode) : normalizeMixedPlacingSize(state.mixedPlacingSize));
    return { ok: true, state: { ...state, beadSize: MIXED_BEAD_SIZE_MODE, mixedPlacingSize } };
  }
  if (currentMode === MIXED_BEAD_SIZE_MODE) {
    const validation = validateMixedSequenceForFixedSize(selectedStones, catalog, requestedMode);
    if (!validation.ok) return validation;
    return { ok: true, state: { ...state, beadSize: requestedMode, mixedPlacingSize: Number(requestedMode), selectedStones: selectedStones.map((item) => String(item?.componentType || item?.type || 'stone').toLowerCase() === 'stone' ? { ...item, size: Number(requestedMode) } : item) } };
  }
  return { ok: true, state: { ...state, beadSize: requestedMode, mixedPlacingSize: Number(requestedMode) } };
}

export function setMixedPlacingSize(state = {}, size) {
  return { ...state, mixedPlacingSize: normalizeMixedPlacingSize(size, state.mixedPlacingSize) };
}
