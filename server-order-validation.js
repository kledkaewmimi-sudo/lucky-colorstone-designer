const PHYSICAL_STONE_SIZES = new Set([4, 6, 10]);

function getAuthoritativeStoneVariant(component = {}, catalogStone = null) {
  const size = Number(component.size ?? component.sizeMm);
  if (!PHYSICAL_STONE_SIZES.has(size)) {
    throw new Error('Stone variants must specify physical size 4, 6, or 10.');
  }
  if (!catalogStone || !Array.isArray(catalogStone.sizes) || !catalogStone.sizes.map(Number).includes(size)) {
    throw new Error('The selected stone size is unavailable.');
  }

  const rawPrice = catalogStone[`p${size}`];
  const unitPrice = Number(rawPrice);
  if (rawPrice === null || rawPrice === undefined || rawPrice === '' || !Number.isFinite(unitPrice) || unitPrice < 0) {
    throw new Error('A selected catalog item has invalid pricing.');
  }

  return { size, unitPrice };
}

module.exports = { getAuthoritativeStoneVariant };
