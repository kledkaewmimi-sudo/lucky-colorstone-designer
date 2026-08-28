export const BRACELET_FIT_TOLERANCE_MM = 2;
export const MIXED_COMPLETION_WINDOW_MM = 5;
const PHYSICAL_STONE_SIZES_MM = new Set([4, 6, 10]);

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function getComponentPhysicalLengthMm(component) {
  if (!component) return 0;
  if (component.type === 'empty' || component.componentType === 'empty') return 0;
  if (component.type === 'stone') {
    const sizeMm = positiveNumber(component.sizeMm ?? component.size);
    return PHYSICAL_STONE_SIZES_MM.has(sizeMm) ? sizeMm : 0;
  }
  if (component.type === 'spacer') return positiveNumber(component.effectiveLengthMm ?? component.sizeMm ?? component.size);
  if (component.type === 'charm') return positiveNumber(component.footprintMm ?? component.sizeMm ?? component.size);
  return positiveNumber(component.sizeMm ?? component.size);
}

export function getTotalUsedLengthMm(components = []) {
  return components.reduce((total, component) => total + getComponentPhysicalLengthMm(component), 0);
}

export function getFitStatus(differenceMm, toleranceMm = BRACELET_FIT_TOLERANCE_MM) {
  const difference = Number(differenceMm);
  const tolerance = positiveNumber(toleranceMm) || BRACELET_FIT_TOLERANCE_MM;
  if (!Number.isFinite(difference)) return 'underfill';
  const boundary = tolerance + Number.EPSILON * Math.max(1, Math.abs(difference), tolerance) * 8;
  if (difference < -boundary) return 'underfill';
  if (difference > boundary) return 'overflow';
  return 'within_tolerance';
}

export function createBraceletGeometry({ components = [], targetLengthMm = 0, toleranceMm = BRACELET_FIT_TOLERANCE_MM } = {}) {
  const usedLengthMm = getTotalUsedLengthMm(components);
  const targetLength = positiveNumber(targetLengthMm);
  const differenceMm = usedLengthMm - targetLength;
  const fitStatus = getFitStatus(differenceMm, toleranceMm);
  return { usedLengthMm, targetLengthMm: targetLength, differenceMm, fitStatus, isWithinTolerance: fitStatus === 'within_tolerance' };
}

export function getCheckoutFitEligibility(geometry = {}) {
  const fitStatus = getFitStatus(geometry.differenceMm);
  if (fitStatus === 'within_tolerance') return { eligible: true, reason: null, fitStatus };
  return { eligible: false, reason: fitStatus === 'overflow' ? 'Bracelet exceeds the 2.0mm fit tolerance.' : 'Bracelet is below the 2.0mm fit tolerance.', fitStatus };
}

export function getNextComponentPlacementEligibility({ mode = 'mixed', usedLengthMm = 0, targetLengthMm = 0, componentLengthMm = 0 } = {}) {
  const nextUsedLengthMm = positiveNumber(usedLengthMm) + positiveNumber(componentLengthMm);
  const targetLength = positiveNumber(targetLengthMm);
  const differenceMm = nextUsedLengthMm - targetLength;
  const fitStatus = getFitStatus(differenceMm);
  const maxAllowedLengthMm = targetLength;
  const overflowBoundary = Number.EPSILON * Math.max(1, Math.abs(nextUsedLengthMm), Math.abs(maxAllowedLengthMm)) * 8;
  return { eligible: nextUsedLengthMm - maxAllowedLengthMm <= overflowBoundary, differenceMm, fitStatus, isComplete: nextUsedLengthMm >= targetLength - overflowBoundary && nextUsedLengthMm - maxAllowedLengthMm <= overflowBoundary, maxAllowedLengthMm };
}

export function getBraceletCompletionEligibility({ mode = 'mixed', usedLengthMm = 0, targetLengthMm = 0, fixedComponentLengthMm = 0, supportedComponentLengthsMm = [4, 6, 10] } = {}) {
  const usedLength = positiveNumber(usedLengthMm);
  const targetLength = positiveNumber(targetLengthMm);
  const minCompleteLengthMm = mode === 'mixed' ? Math.max(0, targetLength - MIXED_COMPLETION_WINDOW_MM) : targetLength;
  const maxOverTargetMm = 0;
  const maxAllowedLengthMm = targetLength;
  const overflowBoundary = Number.EPSILON * Math.max(1, Math.abs(usedLength), Math.abs(maxAllowedLengthMm)) * 8;
  const candidateLengthsMm = (mode === 'fixed' ? [fixedComponentLengthMm] : supportedComponentLengthsMm).map(positiveNumber).filter((lengthMm) => PHYSICAL_STONE_SIZES_MM.has(lengthMm));
  const overflow = usedLength - maxAllowedLengthMm > overflowBoundary;
  const placeableSizes = !overflow ? candidateLengthsMm.filter((componentLengthMm) => getNextComponentPlacementEligibility({ mode, usedLengthMm: usedLength, targetLengthMm: targetLength, componentLengthMm }).eligible) : [];
  const hasPlaceableStone = placeableSizes.length > 0;
  const complete = !overflow && (mode === 'fixed' ? !hasPlaceableStone : usedLength >= minCompleteLengthMm - overflowBoundary);
  const fitStatus = getFitStatus(usedLength - targetLength);
  return {
    mode, targetLengthMm: targetLength, minCompleteLengthMm, maxCompleteLengthMm: targetLength,
    completionWindowBelowTargetMm: mode === 'mixed' ? MIXED_COMPLETION_WINDOW_MM : 0,
    maxOverTargetMm, maxAllowedLengthMm, usedLengthMm: usedLength,
    remainingToTargetMm: targetLength - usedLength, remainingToMaxAllowedMm: maxAllowedLengthMm - usedLength,
    eligible: complete, complete,
    status: overflow ? 'OVERFLOW_INVALID' : complete ? mode === 'mixed' ? 'COMPLETE_WITHIN_TARGET_RANGE' : 'COMPLETE_WITHIN_OVERRUN' : mode === 'mixed' ? 'UNDER_TARGET_MINUS_5' : 'UNDER_TARGET',
    reason: overflow ? 'Bracelet exceeds physical capacity.' : complete ? null : mode === 'fixed' ? 'Add another fixed-size stone to complete the bracelet.' : 'Add stone components until the bracelet reaches the final completion range.',
    fitStatus, overflow, isOverflow: overflow, placeableSizes, hasPlaceableStone, candidateLengthsMm
  };
}

export function getDiscreteBraceletCompletionEligibility(options = {}) {
  return getBraceletCompletionEligibility(options);
}
