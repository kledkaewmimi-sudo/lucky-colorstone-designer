const PHYSICAL_STONE_SIZES = new Set([4, 6, 10]);
const BRACELET_ALLOWANCE_CM = 1.5;
const MIXED_COMPLETION_WINDOW_MM = 5;

function invalid(message) { const error = new Error(message); error.statusCode = 409; throw error; }
function positiveNumber(value) { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : null; }
function catalogMap(catalogs, type) { return catalogs?.[type] instanceof Map ? catalogs[type] : new Map(); }
function catalogPrice(item) { const price = Number(item?.pricing?.base ?? item?.price); return Number.isFinite(price) && price >= 0 ? price : null; }
function charmFootprint(item) { return positiveNumber(item?.business?.footprintMm ?? item?.footprintMm); }
function spacerLength(item) { return positiveNumber(item?.business?.effectiveLengthMm ?? item?.effectiveLengthMm); }
function fixedPayloadSize(order) { const size = Number(order?.beadSize); return PHYSICAL_STONE_SIZES.has(size) ? size : null; }
function variantKey(stoneId, size) { return `${stoneId}_${size}`; }

function resolveAuthoritativeStoneVariant(component = {}, catalogStone = null, legacyFixedSize = null) {
  const suppliedSize = component.size ?? component.sizeMm;
  const size = PHYSICAL_STONE_SIZES.has(Number(suppliedSize)) ? Number(suppliedSize) : legacyFixedSize;
  if (!PHYSICAL_STONE_SIZES.has(size)) invalid('Stone variants must specify physical size 4, 6, or 10.');
  if (!catalogStone || !Array.isArray(catalogStone.sizes) || !catalogStone.sizes.map(Number).includes(size)) invalid('The selected stone size is unavailable.');
  const rawPrice = catalogStone[`p${size}`];
  const unitPrice = Number(rawPrice);
  if (rawPrice === null || rawPrice === undefined || rawPrice === '' || !Number.isFinite(unitPrice) || unitPrice < 0) invalid('A selected catalog item has invalid pricing.');
  return { size, unitPrice };
}

function normalizeSuppliedVariants(stoneVariants, sequenceVariantCounts) {
  if (!Array.isArray(stoneVariants)) return null;
  const counts = new Map();
  for (const variant of stoneVariants) {
    const stoneId = String(variant?.stoneId || '').trim();
    const size = Number(variant?.size);
    const quantity = Number(variant?.quantity);
    if (!stoneId || !PHYSICAL_STONE_SIZES.has(size) || !Number.isInteger(quantity) || quantity <= 0) invalid('Stone variants are malformed.');
    const key = variantKey(stoneId, size);
    counts.set(key, (counts.get(key) || 0) + quantity);
  }
  if (counts.size !== sequenceVariantCounts.size || [...counts].some(([key, quantity]) => sequenceVariantCounts.get(key) !== quantity)) invalid('Stone variants do not match bracelet components.');
  return counts;
}

function getServerCompletionEligibility({ beadSize, usedLengthMm, targetLengthMm } = {}) {
  const usedLength = Number(usedLengthMm);
  const targetLength = Number(targetLengthMm);
  const mode = String(beadSize || '').trim().toLowerCase() === 'mixed' ? 'mixed' : 'fixed';
  const fixedComponentLengthMm = mode === 'fixed' ? fixedPayloadSize({ beadSize }) : null;
  const overflow = !Number.isFinite(usedLength) || !Number.isFinite(targetLength) || usedLength > targetLength;
  const complete = !overflow && (mode === 'mixed'
    ? usedLength >= targetLength - MIXED_COMPLETION_WINDOW_MM
    : Number.isFinite(fixedComponentLengthMm) && usedLength + fixedComponentLengthMm > targetLength);
  return {
    mode,
    usedLengthMm: usedLength,
    targetLengthMm: targetLength,
    minCompleteLengthMm: mode === 'mixed' ? targetLength - MIXED_COMPLETION_WINDOW_MM : null,
    fixedComponentLengthMm,
    overflow,
    complete,
    status: overflow ? 'OVERFLOW_INVALID' : complete ? mode === 'mixed' ? 'COMPLETE_WITHIN_TARGET_RANGE' : 'COMPLETE_DISCRETE_CAPACITY' : 'INCOMPLETE'
  };
}

function validateAuthoritativeOrder({ clientOrder = {}, catalogs = {}, settings = {} } = {}) {
  const sequence = Array.isArray(clientOrder.braceletSequence) ? clientOrder.braceletSequence : [];
  if (!sequence.length) invalid('Bracelet configuration is required.');
  const legacyFixedSize = fixedPayloadSize(clientOrder);
  const billing = [];
  const variantCounts = new Map();
  const variantLines = new Map();
  let usedLengthMm = 0;

  for (const component of sequence) {
    const type = String(component?.type || component?.componentType || '').trim().toLowerCase();
    // Retained editor slots and renderer-only placeholders have no physical
    // bracelet length and cannot be billed as catalog components.
    if (type === 'empty' || type === 'placeholder') continue;
    if (!['stone', 'charm', 'spacer'].includes(type)) invalid('Unsupported bracelet component.');
    const id = String(type === 'stone' ? component.stoneId || component.id : type === 'charm' ? component.charmId || component.id : component.spacerId || component.id).trim();
    const item = catalogMap(catalogs, type).get(id);
    if (!id || !item || item?.availability?.isActive === false || item?.availability?.inStock === false || item?.isActive === false || item?.inStock === false) invalid('A selected catalog item is unavailable. Please refresh and try again.');

    if (type === 'stone') {
      const resolved = resolveAuthoritativeStoneVariant(component, item, legacyFixedSize);
      const key = variantKey(id, resolved.size);
      variantCounts.set(key, (variantCounts.get(key) || 0) + 1);
      const variant = variantLines.get(key) || { stoneId: id, size: resolved.size, quantity: 0, unitPrice: resolved.unitPrice, subtotal: 0 };
      variant.quantity += 1;
      variant.subtotal += resolved.unitPrice;
      variantLines.set(key, variant);
      usedLengthMm += resolved.size;
      billing.push({ type, id, stoneId: id, size: resolved.size, quantity: 1, unitPrice: resolved.unitPrice, totalPrice: resolved.unitPrice });
      continue;
    }

    const unitPrice = catalogPrice(item);
    const lengthMm = type === 'charm' ? charmFootprint(item) : spacerLength(item);
    if (unitPrice === null) invalid('A selected catalog item has invalid pricing.');
    if (lengthMm === null) invalid('A selected catalog item has invalid physical dimensions.');
    usedLengthMm += lengthMm;
    billing.push({ type, id, [type === 'charm' ? 'charmId' : 'spacerId']: id, size: lengthMm, quantity: 1, unitPrice, totalPrice: unitPrice });
  }

  normalizeSuppliedVariants(clientOrder.stoneVariants, variantCounts);
  if (!billing.length) invalid('Bracelet configuration is empty.');
  const wristSize = Number(clientOrder.wristSize);
  if (!Number.isFinite(wristSize) || wristSize <= 0) invalid('Wrist size is required.');
  const targetLengthMm = (wristSize + BRACELET_ALLOWANCE_CM) * 10;
  const completionEligibility = getServerCompletionEligibility({
    beadSize: clientOrder.beadSize,
    usedLengthMm,
    targetLengthMm
  });
  if (completionEligibility.overflow) invalid('Bracelet exceeds allowed target length.');
  if (!completionEligibility.complete) invalid('Bracelet is incomplete.');

  const subtotal = billing.reduce((sum, item) => sum + item.totalPrice, 0);
  const discountPercent = settings?.discountEnabled === false ? 0 : Math.max(0, Number(settings?.globalDiscountPercent ?? 20));
  const discountAmount = Math.round(subtotal * discountPercent / 100);
  const finalPrice = subtotal - discountAmount;
  return {
    itemizedBilling: billing,
    stoneVariants: Array.from(variantLines.values()).map(({ stoneId, size, quantity }) => ({ stoneId, size, quantity })),
    subtotal,
    discountPercent,
    discountAmount,
    finalPrice,
    totalPrice: finalPrice,
    netPrice: finalPrice,
    geometry: {
      usedLengthMm,
      targetLengthMm,
      differenceMm: usedLengthMm - targetLengthMm,
      fitStatus: completionEligibility.status,
      isWithinTolerance: completionEligibility.complete
    },
    completionEligibility
  };
}

module.exports = { MIXED_COMPLETION_WINDOW_MM, getServerCompletionEligibility, resolveAuthoritativeStoneVariant, validateAuthoritativeOrder };
