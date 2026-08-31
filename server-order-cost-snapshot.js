const DELIVERY_COST = 80;
const COST_SOURCE = 'purchases_weighted_average_exact_variant';

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getFinalPaidAmount(order = {}) {
  const values = [
    order.checkoutSummary?.finalPrice,
    order.checkoutSummary?.totalPrice,
    order.finalPrice,
    order.totalPrice,
    order.netPrice
  ];
  for (const value of values) {
    const number = numberOrNull(value);
    if (number !== null && number >= 0) return number;
  }
  return null;
}

function isPaidOrder(order = {}) {
  return String(order.stripePaymentStatus || order.paymentStatus || '').trim().toLowerCase() === 'paid';
}

function getOrderComponents(order = {}) {
  const billing = Array.isArray(order.itemizedBilling) ? order.itemizedBilling : [];
  if (billing.length === 0) return [{ resolved: false, reason: 'missing_authoritative_order_components' }];
  return billing.map((item) => {
    const type = String(item?.type || '').trim().toLowerCase();
    const catalogId = String(
      type === 'stone' ? item?.stoneId || item?.id :
        type === 'charm' ? item?.charmId || item?.id :
          type === 'spacer' ? item?.spacerId || item?.id : ''
    ).trim();
    const quantity = numberOrNull(item?.quantity ?? item?.count ?? 1);
    const sizeMm = type === 'stone' ? numberOrNull(item?.size) : null;
    if (!['stone', 'charm', 'spacer'].includes(type)) return { type, catalogId, sizeMm, quantity, resolved: false, reason: 'unsupported_component_type' };
    if (!catalogId) return { type, catalogId, sizeMm, quantity, resolved: false, reason: 'missing_catalog_identity' };
    if (!Number.isInteger(quantity) || quantity <= 0) return { type, catalogId, sizeMm, quantity, resolved: false, reason: 'invalid_component_quantity' };
    if (type === 'stone' && ![4, 6, 10].includes(sizeMm)) return { type, catalogId, sizeMm, quantity, resolved: false, reason: 'missing_or_invalid_stone_variant' };
    return { type, catalogId, sizeMm, quantity, resolved: true };
  });
}

function buildWeightedCostIndexes(purchases = []) {
  const totals = { stone: new Map(), charm: new Map(), spacer: new Map() };
  purchases.forEach((purchase) => {
    const type = String(purchase?.item_type || purchase?.itemType || '').trim().toLowerCase();
    const catalogId = String(purchase?.catalog_item_id || purchase?.catalogItemId || '').trim();
    const quantity = numberOrNull(purchase?.quantity);
    const totalCost = numberOrNull(purchase?.total_cost ?? purchase?.totalCost);
    const sizeMm = numberOrNull(purchase?.size_mm ?? purchase?.sizeMm);
    if (!totals[type] || !catalogId || quantity === null || quantity <= 0 || totalCost === null || totalCost < 0) return;
    if (type === 'stone' && ![4, 6, 10].includes(sizeMm)) return;
    const key = type === 'stone' ? `${catalogId}|${sizeMm}` : catalogId;
    const aggregate = totals[type].get(key) || { quantity: 0, totalCost: 0 };
    aggregate.quantity += quantity;
    aggregate.totalCost += totalCost;
    totals[type].set(key, aggregate);
  });
  return Object.fromEntries(Object.entries(totals).map(([type, entries]) => [
    type,
    new Map(Array.from(entries, ([key, aggregate]) => [key, aggregate.totalCost / aggregate.quantity]))
  ]));
}

function createOrderCostSnapshot(order = {}, purchases = [], calculatedAt = new Date().toISOString()) {
  if (!isPaidOrder(order)) return null;
  const finalPaidAmount = getFinalPaidAmount(order);
  const base = {
    calculatedAt,
    costSource: COST_SOURCE,
    finalPaidAmount,
    deliveryCost: DELIVERY_COST
  };
  if (finalPaidAmount === null) return { ...base, status: 'unavailable', materialCost: null, totalCost: null, profit: null, marginPercent: null, components: [{ resolved: false, reason: 'missing_final_paid_amount' }] };

  const indexes = buildWeightedCostIndexes(purchases);
  const components = getOrderComponents(order).map((component) => {
    if (!component.resolved) return component;
    const key = component.type === 'stone' ? `${component.catalogId}|${component.sizeMm}` : component.catalogId;
    const weightedAverageUnitCost = indexes[component.type].get(key);
    if (!Number.isFinite(weightedAverageUnitCost)) return { ...component, resolved: false, reason: 'missing_exact_purchase_cost' };
    return { ...component, weightedAverageUnitCost, extendedCost: weightedAverageUnitCost * component.quantity };
  });
  if (components.some((component) => !component.resolved)) {
    return { ...base, status: 'unavailable', materialCost: null, totalCost: null, profit: null, marginPercent: null, components };
  }
  const materialCost = components.reduce((sum, component) => sum + component.extendedCost, 0);
  const totalCost = materialCost + DELIVERY_COST;
  const profit = finalPaidAmount - totalCost;
  const marginPercent = finalPaidAmount > 0 ? (profit / finalPaidAmount) * 100 : 0;
  return { ...base, status: 'complete', materialCost, totalCost, profit, marginPercent, components };
}

function preserveOrCreateOrderCostSnapshot(order = {}, purchases = [], calculatedAt) {
  return order?.costSnapshot ? order : { ...order, costSnapshot: createOrderCostSnapshot(order, purchases, calculatedAt) };
}

module.exports = {
  COST_SOURCE,
  DELIVERY_COST,
  buildWeightedCostIndexes,
  createOrderCostSnapshot,
  isPaidOrder,
  preserveOrCreateOrderCostSnapshot
};
