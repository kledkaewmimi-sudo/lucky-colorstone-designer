const PHYSICAL_STONE_SIZES = new Set([4, 6, 10]);

export function normalizePhysicalStoneSize(size) {
  const numericSize = Number(size);
  return PHYSICAL_STONE_SIZES.has(numericSize) ? numericSize : null;
}

export function aggregateStoneVariants(components = [], catalog = [], resolveStonePrice) {
  const catalogById = new Map(catalog.map((stone) => [String(stone?.id || ''), stone]));
  const variants = new Map();

  components.forEach((component) => {
    const stoneId = String(component?.stoneId || component?.id || '').trim();
    const stone = catalogById.get(stoneId) || null;
    // `size` is the customer selection/billing group, not necessarily the
    // sellable physical diameter. Pearl is selected/billed as 10 mm while its
    // nominal and packing dimensions remain 12 mm in the metadata below.
    const size = normalizePhysicalStoneSize(
      component?.selectionGroupMm ??
      component?.selectionSizeMm ??
      stone?.selectionGroupMm ??
      stone?.selectionSizeMm ??
      component?.size ??
      component?.sizeMm
    );
    if (!stoneId || size === null) return;

    const unitPrice = Number(resolveStonePrice?.(stone, size));
    const price = Number.isFinite(unitPrice) ? unitPrice : 0;
    const selectionGroupMm = Number(stone?.selectionGroupMm ?? stone?.selectionSizeMm ?? size);
    const nominalProductSizeMm = Number(stone?.nominalProductSizeMm ?? stone?.productSizeMm ?? stone?.renderSizeMm ?? size);
    const braceletPackingMm = Number(stone?.braceletPackingMm ?? stone?.packingLengthMm ?? size);
    const key = `${stoneId}_${size}`;
    const existing = variants.get(key) || {
      type: 'stone',
      stoneId,
      name: stone?.name || 'Unknown Stone',
      nameTh: stone?.nameTh || '',
      color: stone?.color || '#E2E8F0',
      image: stone?.image || '',
      size,
      selectionGroupMm: Number.isFinite(selectionGroupMm) && selectionGroupMm > 0 ? selectionGroupMm : size,
      nominalProductSizeMm: Number.isFinite(nominalProductSizeMm) && nominalProductSizeMm > 0 ? nominalProductSizeMm : size,
      braceletPackingMm: Number.isFinite(braceletPackingMm) && braceletPackingMm > 0 ? braceletPackingMm : size,
      quantity: 0,
      count: 0,
      unitPrice: price,
      priceUnit: price,
      subtotal: 0,
      totalPrice: 0
    };

    existing.quantity += 1;
    existing.count += 1;
    existing.subtotal += price;
    existing.totalPrice += price;
    variants.set(key, existing);
  });

  return Object.fromEntries(variants);
}

export function createStoneVariantPayload(aggregatedStones = {}) {
  return Object.values(aggregatedStones)
    .map((variant) => ({
      stoneId: String(variant?.stoneId || '').trim(),
      size: normalizePhysicalStoneSize(variant?.size),
      selectionGroupMm: Number(variant?.selectionGroupMm ?? variant?.size),
      nominalProductSizeMm: Number(variant?.nominalProductSizeMm ?? variant?.size),
      braceletPackingMm: Number(variant?.braceletPackingMm ?? variant?.size),
      quantity: Number(variant?.quantity || variant?.count || 0)
    }))
    .filter((variant) => variant.stoneId && variant.size !== null && Number.isInteger(variant.quantity) && variant.quantity > 0);
}
