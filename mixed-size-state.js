export const FIXED_BEAD_SIZES = Object.freeze(['4', '6', '10']);
export const MIXED_BEAD_SIZE_MODE = 'mixed';

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
  return FIXED_BEAD_SIZES
    .map(Number)
    .filter((size) => stone.sizes.map(Number).includes(size));
}

export function stoneSupportsSize(stone, size) {
  return getStoneSupportedSizes(stone).includes(normalizeMixedPlacingSize(size));
}

function getSelectedStoneItems(selectedStones = []) {
  return Array.isArray(selectedStones)
    ? selectedStones.filter((item) => item && String(item.componentType || item.type || 'stone').toLowerCase() === 'stone')
    : [];
}

export function validateMixedSequenceForFixedSize(selectedStones, catalog, targetSize) {
  const normalizedTargetSize = normalizeFixedBeadSize(targetSize);
  if (!normalizedTargetSize) return { ok: false, reason: 'invalid_target_size', unsupportedStones: [] };

  const catalogById = new Map((Array.isArray(catalog) ? catalog : []).map((stone) => [String(stone?.id || ''), stone]));
  const unsupportedStones = getSelectedStoneItems(selectedStones)
    .filter((item) => !stoneSupportsSize(catalogById.get(String(item.stoneId || item.id || '')), normalizedTargetSize))
    .map((item) => ({ stoneId: String(item.stoneId || item.id || ''), size: Number(item.size) }));

  return unsupportedStones.length === 0
    ? { ok: true, targetSize: Number(normalizedTargetSize), unsupportedStones: [] }
    : { ok: false, reason: 'unsupported_stones', targetSize: Number(normalizedTargetSize), unsupportedStones };
}

export function transitionBraceletSizeMode(state = {}, targetMode, catalog = []) {
  const currentMode = normalizeBraceletSizeMode(state.beadSize);
  const requestedMode = String(targetMode ?? '').trim();
  if (![...FIXED_BEAD_SIZES, MIXED_BEAD_SIZE_MODE].includes(requestedMode)) {
    return { ok: false, reason: 'invalid_target_size', unsupportedStones: [] };
  }
  const nextMode = requestedMode;
  const selectedStones = Array.isArray(state.selectedStones) ? state.selectedStones : [];

  if (nextMode === MIXED_BEAD_SIZE_MODE) {
    const initialPlacingSize = currentMode === MIXED_BEAD_SIZE_MODE
      ? normalizeMixedPlacingSize(state.mixedPlacingSize)
      : Number(currentMode);
    return { ok: true, state: { ...state, beadSize: MIXED_BEAD_SIZE_MODE, mixedPlacingSize: initialPlacingSize } };
  }

  if (currentMode === MIXED_BEAD_SIZE_MODE) {
    const validation = validateMixedSequenceForFixedSize(selectedStones, catalog, nextMode);
    if (!validation.ok) return validation;
    return {
      ok: true,
      state: {
        ...state,
        beadSize: nextMode,
        mixedPlacingSize: Number(nextMode),
        selectedStones: selectedStones.map((item) => (
          String(item?.componentType || item?.type || 'stone').toLowerCase() === 'stone'
            ? { ...item, size: Number(nextMode) }
            : item
        ))
      }
    };
  }

  return { ok: true, state: { ...state, beadSize: nextMode, mixedPlacingSize: Number(nextMode) } };
}

export function setMixedPlacingSize(state = {}, size) {
  return {
    ...state,
    mixedPlacingSize: normalizeMixedPlacingSize(size, state.mixedPlacingSize)
  };
}
