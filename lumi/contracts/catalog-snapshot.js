export const LUMI_CATALOG_SNAPSHOT_VERSION = 1;
const stable = (items, map) => items.map(map).filter(Boolean).sort((a, b) => a.id.localeCompare(b.id));
// Design eligibility and fulfillment availability are separate concerns (owner policy 2026-10-11):
// an active, replenishable material stays recommendable while its stock is temporarily zero, so
// `active` tracks the catalog activity flag only while `inStock`/`available` keep the fulfillment
// state that the authoritative checkout validation still enforces.
const isActive = (item) => item?.isActive !== false && item?.availability?.isActive !== false;
const inStock = (item) => isActive(item) && item?.inStock !== false && item?.availability?.inStock !== false;
const available = (item) => inStock(item);
const stockQty = (item) => { const value = item?.stockQty ?? item?.stock_qty ?? item?.availability?.stockQty ?? item?.availability?.stock_qty; return value == null || value === '' ? null : Math.max(0, Math.trunc(Number(value) || 0)); };
const frozen = (value) => Object.freeze(value);
function fingerprintPayload(snapshot) { return JSON.stringify({ version: snapshot.schemaVersion, stones: snapshot.stones, charms: snapshot.charms, spacers: snapshot.spacers }); }
// Non-cryptographic FNV-1a: advisory catalog identity only; checkout remains authoritative.
export function createLumiCatalogFingerprint(text) { let hash = 2166136261; for (let i = 0; i < text.length; i += 1) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); } return `lumi-c1-${(hash >>> 0).toString(16).padStart(8, '0')}`; }
export function createLumiCatalogSnapshot({ stones = [], charms = [], spacers = [] } = {}) {
  const snapshot = { schemaVersion: LUMI_CATALOG_SNAPSHOT_VERSION,
    stones: stable(stones, (item) => item?.id ? frozen({ id: String(item.id), active: isActive(item), inStock: inStock(item), available: available(item), stockQty: stockQty(item), supportedSizesMm: frozen((item.sizes || []).map(Number).filter((size) => [4, 6, 10].includes(size)).sort()), priceBySize: frozen({ 4: Number(item.p4 ?? item.price ?? 0), 6: Number(item.p6 ?? item.price ?? 0), 10: Number(item.p10 ?? item.p8 ?? item.price ?? 0) }), categoryId: String(item.categoryId || item.category || ''), image: String(item.image || ''), meaning: String(item.meaning || '') }) : null),
    charms: stable(charms, (item) => item?.id ? frozen({ id: String(item.id), sku: String(item.sku || ''), type: String(item.type || ''), active: isActive(item), inStock: inStock(item), available: available(item), stockQty: stockQty(item), price: Number(item.pricing?.base ?? item.price ?? 0), footprintMm: Number(item.business?.footprintMm ?? item.footprintMm ?? item.sizeCm * 10 ?? 0), loopPlaceable: String(item.type || '') === 'bee_heart', categoryId: String(item.categoryId || item.collection || ''), image: String(item.image?.primary || item.image || '') }) : null),
    spacers: stable(spacers, (item) => item?.id ? frozen({ id: String(item.id), sku: String(item.sku || ''), type: String(item.type || 'spacer'), active: isActive(item), inStock: inStock(item), available: available(item), stockQty: stockQty(item), price: Number(item.pricing?.base ?? item.price ?? 0), effectiveLengthMm: Number(item.business?.effectiveLengthMm ?? item.effectiveLengthMm ?? item.footprintMm ?? 0), color: String(item.color || ''), image: String(item.image?.primary || item.image || '') }) : null) };
  snapshot.catalogVersion = createLumiCatalogFingerprint(fingerprintPayload(snapshot));
  return frozen({ ...snapshot, stones: frozen(snapshot.stones), charms: frozen(snapshot.charms), spacers: frozen(snapshot.spacers) });
}
