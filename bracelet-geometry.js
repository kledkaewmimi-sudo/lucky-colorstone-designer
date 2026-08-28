export const BRACELET_FIT_TOLERANCE_MM = 2;
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

  return {
    usedLengthMm,
    targetLengthMm: targetLength,
    differenceMm,
    fitStatus,
    isWithinTolerance: fitStatus === 'within_tolerance'
  };
}

export function getCheckoutFitEligibility(geometry = {}) {
  const fitStatus = getFitStatus(geometry.differenceMm);
  if (fitStatus === 'within_tolerance') {
    return { eligible: true, reason: null, fitStatus };
  }
  return {
    eligible: false,
    reason: fitStatus === 'overflow' ? 'Bracelet exceeds the 2.0mm fit tolerance.' : 'Bracelet is below the 2.0mm fit tolerance.',
    fitStatus
  };
}

// The 2mm fit status remains diagnostic metadata. Physical placement itself is
// discrete: a component may not take the occupied bracelet length past capacity.
export function getNextComponentPlacementEligibility({ usedLengthMm = 0, targetLengthMm = 0, componentLengthMm = 0 } = {}) {
  const nextUsedLengthMm = positiveNumber(usedLengthMm) + positiveNumber(componentLengthMm);
  const targetLength = positiveNumber(targetLengthMm);
  const differenceMm = nextUsedLengthMm - targetLength;
  const fitStatus = getFitStatus(differenceMm);
  const overflowBoundary = Number.EPSILON * Math.max(1, Math.abs(nextUsedLengthMm), Math.abs(targetLength)) * 8;
  return {
    eligible: differenceMm <= overflowBoundary,
    differenceMm,
    fitStatus,
    isComplete: false
  };
}

export function getDiscreteBraceletCompletionEligibility({
  mode = 'mixed',
  usedLengthMm = 0,
  targetLengthMm = 0,
  fixedComponentLengthMm = 0,
  supportedComponentLengthsMm = [4, 6, 10]
} = {}) {
  const usedLength = positiveNumber(usedLengthMm);
  const targetLength = positiveNumber(targetLengthMm);
  const overflowBoundary = Number.EPSILON * Math.max(1, Math.abs(usedLength), Math.abs(targetLength)) * 8;
  const candidateLengthsMm = (mode === 'fixed' ? [fixedComponentLengthMm] : supportedComponentLengthsMm)
    .map(positiveNumber)
    .filter((lengthMm) => PHYSICAL_STONE_SIZES_MM.has(lengthMm));
  const isOverflow = usedLength - targetLength > overflowBoundary;
  const canPlaceSupportedStone = !isOverflow && candidateLengthsMm.some((componentLengthMm) =>
    getNextComponentPlacementEligibility({ usedLengthMm: usedLength, targetLengthMm: targetLength, componentLengthMm }).eligible
  );
  const fitStatus = getFitStatus(usedLength - targetLength);

  return {
    eligible: !isOverflow && !canPlaceSupportedStone,
    reason: isOverflow ? 'Bracelet exceeds physical capacity.' : canPlaceSupportedStone ? 'Add another supported stone to complete the bracelet.' : null,
    fitStatus,
    isOverflow,
    canPlaceSupportedStone,
    candidateLengthsMm
  };
}
