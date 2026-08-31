const DELIVERY_COST = 80;
const COST_SOURCE = 'purchases_weighted_average_exact_variant';
const HISTORICAL_DETERMINISTIC_COST_SOURCE = 'historical_deterministic_purchases_weighted_average_exact_variant';
const HISTORICAL_ESTIMATED_COST_SOURCE = 'historical_reconstructed_with_earliest_known_purchase_fallback';

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

function getOrderCostCutoffDate(order = {}) {
  for (const candidate of [order.paidAt, order.date, order.created_at, order.createdAt]) {
    const date = new Date(candidate);
    if (!Number.isNaN(date.valueOf())) return date.toISOString().slice(0, 10);
  }
  return null;
}

function createHistoricalDeterministicCostSnapshot(order = {}, purchases = [], calculatedAt = new Date().toISOString()) {
  if (order?.costSnapshot) throw new Error('Refusing to overwrite an existing costSnapshot.');
  const orderCostAsOfDate = getOrderCostCutoffDate(order);
  if (!orderCostAsOfDate) throw new Error('A valid paid/order date is required for historical cost backfill.');

  const eligiblePurchases = purchases.filter((purchase) => {
    const purchasedAt = String(purchase?.purchased_at || purchase?.purchasedAt || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(purchasedAt) && purchasedAt <= orderCostAsOfDate;
  });
  const snapshot = createOrderCostSnapshot(order, eligiblePurchases, calculatedAt);
  if (!snapshot) return null;

  const components = snapshot.components.map((component) => {
    if (!component.resolved) return component;
    const sourcePurchaseRowIds = eligiblePurchases
      .filter((purchase) => {
        const type = String(purchase?.item_type || purchase?.itemType || '').trim().toLowerCase();
        const catalogId = String(purchase?.catalog_item_id || purchase?.catalogItemId || '').trim();
        const sizeMm = numberOrNull(purchase?.size_mm ?? purchase?.sizeMm);
        return type === component.type
          && catalogId === component.catalogId
          && (type !== 'stone' || sizeMm === component.sizeMm);
      })
      .map((purchase) => String(purchase?.id || '').trim())
      .filter(Boolean);
    return { ...component, sourcePurchaseRowIds };
  });
  return {
    ...snapshot,
    costSource: HISTORICAL_DETERMINISTIC_COST_SOURCE,
    historicalDeterministicBackfill: true,
    orderCostAsOfDate,
    components
  };
}

function getComponentPurchaseIdentity(component = {}) {
  return component.type === 'stone'
    ? `${component.type}|${component.catalogId}|${component.sizeMm}`
    : `${component.type}|${component.catalogId}`;
}

function getMatchingExactPurchases(component = {}, purchases = []) {
  return purchases.filter((purchase) => {
    const type = String(purchase?.item_type || purchase?.itemType || '').trim().toLowerCase();
    const catalogId = String(purchase?.catalog_item_id || purchase?.catalogItemId || '').trim();
    const sizeMm = numberOrNull(purchase?.size_mm ?? purchase?.sizeMm);
    return type === component.type
      && catalogId === component.catalogId
      && (type !== 'stone' || sizeMm === component.sizeMm);
  });
}

function getPurchaseDate(purchase = {}) {
  const date = String(purchase?.purchased_at || purchase?.purchasedAt || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function weightedAverageUnitCost(purchases = []) {
  const totalQuantity = purchases.reduce((sum, purchase) => sum + Number(purchase.quantity), 0);
  const totalCost = purchases.reduce((sum, purchase) => sum + Number(purchase.total_cost ?? purchase.totalCost), 0);
  return totalQuantity > 0 ? totalCost / totalQuantity : null;
}

function createHistoricalReconstructedCostSnapshot(order = {}, purchases = [], calculatedAt = new Date().toISOString()) {
  if (order?.costSnapshot) throw new Error('Refusing to overwrite an existing costSnapshot.');
  if (!isPaidOrder(order)) return null;
  const orderCostAsOfDate = getOrderCostCutoffDate(order);
  if (!orderCostAsOfDate) throw new Error('A valid paid/order date is required for historical cost backfill.');
  const finalPaidAmount = getFinalPaidAmount(order);
  const base = { calculatedAt, orderCostAsOfDate, finalPaidAmount, deliveryCost: DELIVERY_COST };
  if (finalPaidAmount === null) return { ...base, status: 'unavailable', costSource: HISTORICAL_DETERMINISTIC_COST_SOURCE, historicalDeterministicBackfill: true, historicalEstimatedBackfill: false, materialCost: null, totalCost: null, profit: null, marginPercent: null, components: [{ resolved: false, reason: 'missing_final_paid_amount' }] };

  const components = getOrderComponents(order).map((component) => {
    if (!component.resolved) return component;
    const exactPurchases = getMatchingExactPurchases(component, purchases);
    const historicalRows = exactPurchases.filter((purchase) => {
      const date = getPurchaseDate(purchase);
      return date && date <= orderCostAsOfDate;
    });
    let selectedRows = historicalRows;
    let fallbackUsed = false;
    let costResolutionMethod = 'historical_exact_purchase';
    let sourcePurchaseDate = null;
    if (selectedRows.length === 0) {
      const futureRows = exactPurchases.filter((purchase) => {
        const date = getPurchaseDate(purchase);
        return date && date > orderCostAsOfDate;
      });
      const earliestDate = futureRows.map(getPurchaseDate).sort()[0];
      if (earliestDate) {
        selectedRows = futureRows.filter((purchase) => getPurchaseDate(purchase) === earliestDate);
        fallbackUsed = true;
        costResolutionMethod = 'historical_estimated_earliest_known_purchase';
        sourcePurchaseDate = earliestDate;
      }
    }
    const unitCost = weightedAverageUnitCost(selectedRows);
    if (!Number.isFinite(unitCost)) return { ...component, resolved: false, reason: 'missing_exact_purchase_cost', fallbackUsed: false, costResolutionMethod: 'unresolved_no_exact_purchase' };
    const sourcePurchaseDates = [...new Set(selectedRows.map(getPurchaseDate).filter(Boolean))].sort();
    return {
      ...component,
      weightedAverageUnitCost: unitCost,
      extendedCost: unitCost * component.quantity,
      sourcePurchaseRowIds: selectedRows.map((purchase) => String(purchase?.id || '').trim()).filter(Boolean),
      sourcePurchaseDate: sourcePurchaseDate || sourcePurchaseDates[0] || null,
      sourcePurchaseDates,
      fallbackUsed,
      costResolutionMethod
    };
  });
  const unresolved = components.some((component) => !component.resolved);
  const fallbackUsed = components.some((component) => component.fallbackUsed === true);
  const costSource = fallbackUsed ? HISTORICAL_ESTIMATED_COST_SOURCE : HISTORICAL_DETERMINISTIC_COST_SOURCE;
  const metadata = { costSource, historicalDeterministicBackfill: !fallbackUsed, historicalEstimatedBackfill: fallbackUsed };
  if (unresolved) return { ...base, ...metadata, status: 'unavailable', materialCost: null, totalCost: null, profit: null, marginPercent: null, components };
  const materialCost = components.reduce((sum, component) => sum + component.extendedCost, 0);
  const totalCost = materialCost + DELIVERY_COST;
  const profit = finalPaidAmount - totalCost;
  return { ...base, ...metadata, status: 'complete', materialCost, totalCost, profit, marginPercent: finalPaidAmount > 0 ? (profit / finalPaidAmount) * 100 : 0, components };
}

function createHistoricalBackfillDryRun(orders = [], purchases = [], calculatedAt = new Date().toISOString()) {
  return orders
    .filter((order) => isPaidOrder(order) && !order.costSnapshot)
    .map((order) => ({ orderId: order.id, orderDate: getOrderCostCutoffDate(order), snapshot: createHistoricalReconstructedCostSnapshot(order, purchases, calculatedAt) }));
}

function preserveOrCreateOrderCostSnapshot(order = {}, purchases = [], calculatedAt) {
  return order?.costSnapshot ? order : { ...order, costSnapshot: createOrderCostSnapshot(order, purchases, calculatedAt) };
}

module.exports = {
  COST_SOURCE,
  DELIVERY_COST,
  HISTORICAL_DETERMINISTIC_COST_SOURCE,
  HISTORICAL_ESTIMATED_COST_SOURCE,
  buildWeightedCostIndexes,
  createOrderCostSnapshot,
  createHistoricalDeterministicCostSnapshot,
  createHistoricalReconstructedCostSnapshot,
  createHistoricalBackfillDryRun,
  getOrderCostCutoffDate,
  isPaidOrder,
  preserveOrCreateOrderCostSnapshot
};
