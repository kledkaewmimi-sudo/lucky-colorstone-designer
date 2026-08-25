export const FIT_TOLERANCE_MM = 1;
const PHYSICAL_STONE_SIZES_MM = new Set([4, 6, 10]);

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function getComponentPhysicalLengthMm(component) {
  if (!component) return 0;

  if (component.type === 'stone') {
    const sizeMm = positiveNumber(component.sizeMm ?? component.size);
    return PHYSICAL_STONE_SIZES_MM.has(sizeMm) ? sizeMm : 0;
  }

  if (component.type === 'spacer') {
    return positiveNumber(component.effectiveLengthMm ?? component.sizeMm ?? component.size);
  }

  if (component.type === 'charm') {
    return positiveNumber(component.footprintMm ?? component.sizeMm ?? component.size);
  }

  return positiveNumber(component.sizeMm ?? component.size);
}

export function getTotalUsedLengthMm(components = []) {
  return components.reduce((total, component) => total + getComponentPhysicalLengthMm(component), 0);
}

export function getFitStatus(differenceMm, toleranceMm = FIT_TOLERANCE_MM) {
  const difference = Number(differenceMm);
  const tolerance = positiveNumber(toleranceMm) || FIT_TOLERANCE_MM;
  if (!Number.isFinite(difference)) return 'underfill';
  if (difference < -tolerance) return 'underfill';
  if (difference > tolerance) return 'overflow';
  return 'within_tolerance';
}

export function createBraceletGeometry({ components = [], targetLengthMm = 0, toleranceMm = FIT_TOLERANCE_MM } = {}) {
  const usedLengthMm = getTotalUsedLengthMm(components);
  const targetLength = positiveNumber(targetLengthMm);
  const differenceMm = usedLengthMm - targetLength;
  const fitStatus = getFitStatus(differenceMm, toleranceMm);

  return {
    usedLengthMm,
    targetLengthMm: targetLength,
    differenceMm,
    fitStatus,
    isWithinTolerance: fitStatus === 'within_tolerance'
  };
}

export function getCheckoutFitEligibility(geometry = {}) {
  const fitStatus = geometry.fitStatus || getFitStatus(geometry.differenceMm);
  if (fitStatus === 'within_tolerance') {
    return { eligible: true, reason: null, fitStatus };
  }
  return {
    eligible: false,
    reason: fitStatus === 'overflow' ? 'Bracelet exceeds the 1.0mm fit tolerance.' : 'Bracelet is below the 1.0mm fit tolerance.',
    fitStatus
  };
}
