const PHYSICAL_STONE_SIZES = new Set([4, 6, 10]);

export function normalizePhysicalStoneSize(size) {
  const numericSize = Number(size);
  return PHYSICAL_STONE_SIZES.has(numericSize) ? numericSize : null;
}

export function resolveStonePriceForPhysicalSize(stone, size) {
  const physicalSize = normalizePhysicalStoneSize(size);
  const field = physicalSize === null ? null : `p${physicalSize}`;
  const value = field ? Number(stone?.[field]) : NaN;
  if (!stone) return { valid: false, unitPrice: null, reason: 'missing_stone' };
  if (!field) return { valid: false, unitPrice: null, reason: 'invalid_physical_size' };
  if (!Number.isFinite(value) || value < 0) return { valid: false, unitPrice: null, reason: 'invalid_stone_price' };
  return { valid: true, unitPrice: value, field };
}

export function aggregateStoneVariants(components = [], catalog = []) {
  const catalogById = new Map((catalog || []).map((stone) => [String(stone?.id || ''), stone]));
  const variants = {};
  const invalidComponents = [];
  (Array.isArray(components) ? components : []).forEach((component, index) => {
    const stoneId = String(component?.stoneId || component?.id || '').trim();
    const size = normalizePhysicalStoneSize(component?.size ?? component?.sizeMm);
    const stone = catalogById.get(stoneId);
    const price = resolveStonePriceForPhysicalSize(stone, size);
    if (!stoneId || size === null || !price.valid) {
      invalidComponents.push({ index, uniqueId: component?.uniqueId ?? null, stoneId: stoneId || null, size, reason: !stoneId ? 'missing_stone_id' : price.reason });
      return;
    }
    const key = `${stoneId}_${size}`;
    const variant = variants[key] || { type: 'stone', stoneId, name: stone.name || 'Unknown Stone', nameTh: stone.nameTh || '', color: stone.color || '#E2E8F0', image: stone.image || '', size, quantity: 0, count: 0, unitPrice: price.unitPrice, priceUnit: price.unitPrice, subtotal: 0, totalPrice: 0 };
    variant.quantity += 1;
    variant.count += 1;
    variant.subtotal += price.unitPrice;
    variant.totalPrice += price.unitPrice;
    variants[key] = variant;
  });
  return { valid: invalidComponents.length === 0, variants, invalidComponents };
}

export function createStoneVariantPayload(aggregatedStones = {}) {
  const variants = aggregatedStones?.variants || aggregatedStones;
  return Object.values(variants || {})
    .map((variant) => ({ stoneId: String(variant?.stoneId || '').trim(), size: normalizePhysicalStoneSize(variant?.size), quantity: Number(variant?.quantity || variant?.count || 0) }))
    .filter((variant) => variant.stoneId && variant.size !== null && Number.isInteger(variant.quantity) && variant.quantity > 0);
}

export function createStonePricingSummary(components = [], catalog = []) {
  const aggregation = aggregateStoneVariants(components, catalog);
  const stoneBilling = Object.values(aggregation.variants);
  return { ...aggregation, stoneVariants: createStoneVariantPayload(aggregation.variants), stoneBilling, stonesSubtotal: aggregation.valid ? stoneBilling.reduce((sum, item) => sum + item.subtotal, 0) : null, clientPriceAuthoritative: false };
}
