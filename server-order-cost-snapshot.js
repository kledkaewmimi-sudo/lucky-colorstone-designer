const DELIVERY_COST = 80;
const COST_SOURCE = 'purchases_weighted_average_exact_variant';
const BACKFILL_COST_SOURCE = 'purchases_all_time_weighted_average_exact_variant';

const numberOrNull = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const isPaidOrder = (order = {}) => String(order.stripePaymentStatus || order.paymentStatus || '').trim().toLowerCase() === 'paid';
const getFinalPaidAmount = (order = {}) => [order.checkoutSummary?.finalPrice, order.checkoutSummary?.totalPrice, order.finalPrice, order.totalPrice, order.netPrice].map(numberOrNull).find((value) => value !== null && value >= 0) ?? null;

function getOrderComponents(order = {}) {
  const billing = Array.isArray(order.itemizedBilling) ? order.itemizedBilling : [];
  if (!billing.length) return [{ resolved: false, reason: 'missing_authoritative_order_components' }];
  return billing.map((item) => {
    const type = String(item?.type || '').trim().toLowerCase();
    const catalogId = String(type === 'stone' ? item?.stoneId || item?.id : type === 'charm' ? item?.charmId || item?.id : type === 'spacer' ? item?.spacerId || item?.id : '').trim();
    const quantity = numberOrNull(item?.quantity ?? item?.count ?? 1);
    const sizeMm = type === 'stone' ? numberOrNull(item?.size) : null;
    if (!['stone', 'charm', 'spacer'].includes(type)) return { type, catalogId, sizeMm, quantity, resolved: false, reason: 'unsupported_component_type' };
    if (!catalogId) return { type, catalogId, sizeMm, quantity, resolved: false, reason: 'missing_catalog_identity' };
    if (!Number.isInteger(quantity) || quantity <= 0) return { type, catalogId, sizeMm, quantity, resolved: false, reason: 'invalid_component_quantity' };
    if (type === 'stone' && ![4, 6, 10].includes(sizeMm)) return { type, catalogId, sizeMm, quantity, resolved: false, reason: 'missing_or_invalid_stone_variant' };
    return { type, catalogId, sizeMm, quantity, resolved: true };
  });
}

function buildWeightedCostIndexes(purchases = [], cutoffDate = null) {
  const totals = { stone: new Map(), charm: new Map(), spacer: new Map() };
  purchases.forEach((purchase) => {
    const purchaseDate = String(purchase?.purchased_at || purchase?.purchasedAt || '').slice(0, 10);
    if (cutoffDate && (!/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate) || purchaseDate > cutoffDate)) return;
    const type = String(purchase?.item_type || purchase?.itemType || '').trim().toLowerCase();
    const catalogId = String(purchase?.catalog_item_id || purchase?.catalogItemId || '').trim();
    const quantity = numberOrNull(purchase?.quantity), totalCost = numberOrNull(purchase?.total_cost ?? purchase?.totalCost), sizeMm = numberOrNull(purchase?.size_mm ?? purchase?.sizeMm);
    if (!totals[type] || !catalogId || quantity === null || quantity <= 0 || totalCost === null || totalCost < 0 || (type === 'stone' && ![4, 6, 10].includes(sizeMm))) return;
    const key = type === 'stone' ? `${catalogId}|${sizeMm}` : catalogId;
    const aggregate = totals[type].get(key) || { quantity: 0, totalCost: 0 };
    aggregate.quantity += quantity; aggregate.totalCost += totalCost; totals[type].set(key, aggregate);
  });
  return Object.fromEntries(Object.entries(totals).map(([type, entries]) => [type, new Map(Array.from(entries, ([key, value]) => [key, value.totalCost / value.quantity]))]));
}

function snapshotFromIndexes(order, indexes, { calculatedAt = new Date().toISOString(), status = 'complete', costSource = COST_SOURCE, orderCostAsOfDate = null, backfilledAt = null } = {}) {
  if (!isPaidOrder(order)) return null;
  const finalPaidAmount = getFinalPaidAmount(order);
  const base = { status, calculatedAt, costSource, finalPaidAmount, deliveryCost: DELIVERY_COST, ...(backfilledAt ? { backfilledAt, orderCostAsOfDate } : {}) };
  if (finalPaidAmount === null) return { ...base, status: 'unavailable', materialCost: null, totalCost: null, profit: null, marginPercent: null, components: [{ resolved: false, reason: 'missing_final_paid_amount' }] };
  const components = getOrderComponents(order).map((component) => {
    if (!component.resolved) return component;
    const key = component.type === 'stone' ? `${component.catalogId}|${component.sizeMm}` : component.catalogId;
    const weightedAverageUnitCost = indexes[component.type].get(key);
    if (!Number.isFinite(weightedAverageUnitCost)) return { ...component, purchaseCutoffDate: orderCostAsOfDate || undefined, resolved: false, reason: 'missing_exact_purchase_cost' };
    return { ...component, weightedAverageUnitCost, extendedCost: weightedAverageUnitCost * component.quantity, purchaseCutoffDate: orderCostAsOfDate || undefined };
  });
  if (components.some((component) => !component.resolved)) return { ...base, status: 'unavailable', materialCost: null, totalCost: null, profit: null, marginPercent: null, components };
  const materialCost = components.reduce((sum, component) => sum + component.extendedCost, 0), totalCost = materialCost + DELIVERY_COST, profit = finalPaidAmount - totalCost;
  return { ...base, materialCost, totalCost, profit, marginPercent: finalPaidAmount > 0 ? profit / finalPaidAmount * 100 : 0, components };
}

function createOrderCostSnapshot(order = {}, purchases = [], calculatedAt) { return snapshotFromIndexes(order, buildWeightedCostIndexes(purchases), { calculatedAt }); }
function getCanonicalOrderDate(order = {}, row = {}) { for (const candidate of [order.paidAt, row.date, order.date, row.created_at, order.created_at]) { const value = new Date(candidate); if (!Number.isNaN(value.valueOf())) return value.toISOString().slice(0, 10); } return null; }
function createHistoricalOrderCostSnapshot(order = {}, purchases = [], row = {}, calculatedAt = new Date().toISOString()) {
  if (!isPaidOrder(order)) return null;
  const snapshot = snapshotFromIndexes(order, buildWeightedCostIndexes(purchases), { calculatedAt, backfilledAt: calculatedAt, status: 'backfilled', costSource: BACKFILL_COST_SOURCE });
  return { ...snapshot, historicalEstimate: true };
}
function preserveOrCreateOrderCostSnapshot(order = {}, purchases = [], calculatedAt) { return order?.costSnapshot ? order : { ...order, costSnapshot: createOrderCostSnapshot(order, purchases, calculatedAt) }; }

module.exports = { BACKFILL_COST_SOURCE, COST_SOURCE, DELIVERY_COST, buildWeightedCostIndexes, createHistoricalOrderCostSnapshot, createOrderCostSnapshot, getCanonicalOrderDate, isPaidOrder, preserveOrCreateOrderCostSnapshot };
