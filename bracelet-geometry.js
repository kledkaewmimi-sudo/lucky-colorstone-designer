export const FIT_TOLERANCE_MM = 1;
const PHYSICAL_STONE_SIZES_MM = new Set([4, 6, 10]);

function validPositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function componentType(component) {
  return String(component?.componentType || component?.type || '').trim().toLowerCase();
}

// Dimensions come from each placed component, never from current selection state.
export function resolveComponentPhysicalLengthMm(component) {
  const type = componentType(component);
  if (!component || !type) return { valid: false, lengthMm: null, reason: 'missing_component_type' };
  if (type === 'stone') {
    const size = validPositiveNumber(component.size ?? component.sizeMm);
    return PHYSICAL_STONE_SIZES_MM.has(size) ? { valid: true, lengthMm: size } : { valid: false, lengthMm: null, reason: 'invalid_stone_size' };
  }
  if (type === 'spacer') {
    const lengthMm = validPositiveNumber(component.effectiveLengthMm);
    return lengthMm === null ? { valid: false, lengthMm: null, reason: 'invalid_spacer_effective_length' } : { valid: true, lengthMm };
  }
  if (type === 'charm') {
    const lengthMm = validPositiveNumber(component.footprintMm);
    return lengthMm === null ? { valid: false, lengthMm: null, reason: 'invalid_charm_footprint' } : { valid: true, lengthMm };
  }
  return { valid: false, lengthMm: null, reason: 'unsupported_component_type' };
}

export function getComponentPhysicalLengthMm(component) {
  const resolution = resolveComponentPhysicalLengthMm(component);
  return resolution.valid ? resolution.lengthMm : null;
}

export function resolveBraceletGeometryComponents(components = []) {
  if (!Array.isArray(components)) return { usedLengthMm: null, invalidComponents: [{ index: null, reason: 'components_not_array' }] };
  let usedLengthMm = 0;
  const invalidComponents = [];
  components.forEach((component, index) => {
    const resolution = resolveComponentPhysicalLengthMm(component);
    if (!resolution.valid) {
      invalidComponents.push({ index, uniqueId: component?.uniqueId ?? null, componentType: componentType(component) || null, reason: resolution.reason });
      return;
    }
    usedLengthMm += resolution.lengthMm;
  });
  return { usedLengthMm: invalidComponents.length ? null : usedLengthMm, invalidComponents };
}

export function getTotalUsedLengthMm(components = []) { return resolveBraceletGeometryComponents(components).usedLengthMm; }

export function getFitStatus(differenceMm, toleranceMm = FIT_TOLERANCE_MM) {
  const difference = Number(differenceMm);
  const tolerance = validPositiveNumber(toleranceMm) ?? FIT_TOLERANCE_MM;
  if (!Number.isFinite(difference)) return 'invalid';
  if (difference < -tolerance) return 'underfill';
  if (difference > tolerance) return 'overflow';
  return 'within_tolerance';
}

export function createBraceletGeometry({ components = [], targetLengthMm = 0, toleranceMm = FIT_TOLERANCE_MM } = {}) {
  const resolution = resolveBraceletGeometryComponents(components);
  const target = validPositiveNumber(targetLengthMm);
  const invalidComponents = [...resolution.invalidComponents];
  if (target === null) invalidComponents.push({ index: null, componentType: null, reason: 'invalid_target_length' });
  const valid = invalidComponents.length === 0;
  const usedLengthMm = valid ? resolution.usedLengthMm : null;
  const differenceMm = valid ? usedLengthMm - target : null;
  const fitStatus = valid ? getFitStatus(differenceMm, toleranceMm) : 'invalid';
  return { usedLengthMm, targetLengthMm: target, differenceMm, fitStatus, isWithinTolerance: fitStatus === 'within_tolerance', valid, invalidComponents };
}

export function getCheckoutFitEligibility(geometry = {}) {
  const fitStatus = geometry.fitStatus || getFitStatus(geometry.differenceMm);
  if (fitStatus === 'within_tolerance') return { eligible: true, reason: null, fitStatus };
  if (fitStatus === 'overflow') return { eligible: false, reason: 'Bracelet exceeds the 1.0mm fit tolerance.', fitStatus };
  if (fitStatus === 'underfill') return { eligible: false, reason: 'Bracelet is below the 1.0mm fit tolerance.', fitStatus };
  return { eligible: false, reason: 'Bracelet geometry is invalid.', fitStatus: 'invalid' };
}
