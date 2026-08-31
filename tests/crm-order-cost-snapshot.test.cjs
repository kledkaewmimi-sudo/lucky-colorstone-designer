const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  DELIVERY_COST,
  createOrderCostSnapshot,
  createHistoricalDeterministicCostSnapshot,
  createHistoricalReconstructedCostSnapshot,
  preserveOrCreateOrderCostSnapshot
} = require('../server-order-cost-snapshot.js');

function paidOrder(items, finalPrice = 458) {
  return {
    id: 'ORD-TEST',
    stripePaymentStatus: 'paid',
    finalPrice,
    totalPrice: finalPrice,
    itemizedBilling: items
  };
}

function purchase(itemType, catalogItemId, quantity, totalCost, sizeMm) {
  return { item_type: itemType, catalog_item_id: catalogItemId, quantity, total_cost: totalCost, size_mm: sizeMm };
}

test('resolves each stone physical variant independently using weighted average', () => {
  const order = paidOrder([
    { type: 'stone', stoneId: 'amethyst', size: 4, quantity: 1 },
    { type: 'stone', stoneId: 'amethyst', size: 6, quantity: 1 },
    { type: 'stone', stoneId: 'amethyst', size: 10, quantity: 1 }
  ], 500);
  const snapshot = createOrderCostSnapshot(order, [
    purchase('stone', 'amethyst', 100, 200, 4),
    purchase('stone', 'amethyst', 100, 350, 6),
    purchase('stone', 'amethyst', 50, 400, 10)
  ], '2026-08-31T00:00:00.000Z');
  assert.equal(snapshot.status, 'complete');
  assert.deepEqual(snapshot.components.map((component) => component.weightedAverageUnitCost), [2, 3.5, 8]);
  assert.equal(snapshot.materialCost, 13.5);
});

test('combines exact stone, charm, and spacer costs into material cost', () => {
  const snapshot = createOrderCostSnapshot(paidOrder([
    { type: 'stone', stoneId: 'amethyst', size: 6, quantity: 10 },
    { type: 'charm', charmId: 'heart', quantity: 1 },
    { type: 'spacer', spacerId: 'gold-spacer', quantity: 2 }
  ]), [
    purchase('stone', 'amethyst', 100, 350, 6),
    purchase('charm', 'heart', 10, 100),
    purchase('spacer', 'gold-spacer', 20, 40)
  ]);
  assert.equal(snapshot.status, 'complete');
  assert.equal(snapshot.materialCost, 49);
  assert.equal(snapshot.deliveryCost, DELIVERY_COST);
  assert.equal(snapshot.totalCost, 129);
  assert.equal(snapshot.profit, 329);
  assert.equal(snapshot.marginPercent, (329 / 458) * 100);
});

test('uses the final paid total after discount for profit and margin', () => {
  const snapshot = createOrderCostSnapshot(paidOrder([
    { type: 'stone', stoneId: 'amethyst', size: 6, quantity: 10 }
  ], 458), [purchase('stone', 'amethyst', 100, 1260, 6)]);
  assert.equal(snapshot.materialCost, 126);
  assert.equal(snapshot.totalCost, 206);
  assert.equal(snapshot.profit, 252);
  assert.equal(Number(snapshot.marginPercent.toFixed(1)), 55.0);
});

test('retains a genuine exact zero material cost', () => {
  const snapshot = createOrderCostSnapshot(paidOrder([
    { type: 'stone', stoneId: 'gift-stone', size: 4, quantity: 3 }
  ], 100), [purchase('stone', 'gift-stone', 10, 0, 4)]);
  assert.equal(snapshot.status, 'complete');
  assert.equal(snapshot.materialCost, 0);
  assert.equal(snapshot.totalCost, 80);
  assert.equal(snapshot.profit, 20);
});

test('marks missing exact component cost unavailable without a zero fallback', () => {
  const snapshot = createOrderCostSnapshot(paidOrder([
    { type: 'stone', stoneId: 'amethyst', size: 10, quantity: 1 }
  ]), [purchase('stone', 'amethyst', 100, 200, 4)]);
  assert.equal(snapshot.status, 'unavailable');
  assert.equal(snapshot.materialCost, null);
  assert.equal(snapshot.totalCost, null);
  assert.equal(snapshot.profit, null);
  assert.equal(snapshot.marginPercent, null);
  assert.equal(snapshot.components[0].reason, 'missing_exact_purchase_cost');
});

test('reports every missing component when more than one exact cost is absent', () => {
  const snapshot = createOrderCostSnapshot(paidOrder([
    { type: 'stone', stoneId: 'pink-tiger-eye', size: 10, quantity: 2 },
    { type: 'charm', charmId: 'bee-heart-pink', quantity: 1 }
  ]), []);
  assert.equal(snapshot.status, 'unavailable');
  assert.deepEqual(snapshot.components.map((component) => ({
    catalogId: component.catalogId,
    sizeMm: component.sizeMm,
    quantity: component.quantity,
    reason: component.reason
  })), [
    { catalogId: 'pink-tiger-eye', sizeMm: 10, quantity: 2, reason: 'missing_exact_purchase_cost' },
    { catalogId: 'bee-heart-pink', sizeMm: null, quantity: 1, reason: 'missing_exact_purchase_cost' }
  ]);
});

test('creates snapshots for paid orders only', () => {
  const pending = { ...paidOrder([{ type: 'stone', stoneId: 'amethyst', size: 6, quantity: 1 }]), stripePaymentStatus: 'pending_payment' };
  assert.equal(createOrderCostSnapshot(pending, [purchase('stone', 'amethyst', 1, 10, 6)]), null);
});

test('preserves an existing snapshot despite later Purchases changes', () => {
  const original = createOrderCostSnapshot(paidOrder([
    { type: 'stone', stoneId: 'amethyst', size: 6, quantity: 1 }
  ]), [purchase('stone', 'amethyst', 1, 3.5, 6)]);
  const order = { ...paidOrder([{ type: 'stone', stoneId: 'amethyst', size: 6, quantity: 1 }]), costSnapshot: original };
  const preserved = preserveOrCreateOrderCostSnapshot(order, [purchase('stone', 'amethyst', 1, 99, 6)]);
  assert.equal(preserved.costSnapshot, original);
  assert.equal(preserved.costSnapshot.materialCost, 3.5);
});

test('historical deterministic backfill uses only exact purchases on or before the paid date', () => {
  const order = {
    ...paidOrder([{ type: 'stone', stoneId: 'amethyst', size: 6, quantity: 2 }], 100),
    paidAt: '2026-08-22T06:40:01.327Z'
  };
  const snapshot = createHistoricalDeterministicCostSnapshot(order, [
    { ...purchase('stone', 'amethyst', 10, 20, 6), id: 'before', purchased_at: '2026-08-22' },
    { ...purchase('stone', 'amethyst', 10, 90, 6), id: 'after', purchased_at: '2026-08-23' },
    { ...purchase('stone', 'amethyst', 10, 10, 4), id: 'wrong-size', purchased_at: '2026-08-20' }
  ], '2026-09-01T00:00:00.000Z');
  assert.equal(snapshot.status, 'complete');
  assert.equal(snapshot.orderCostAsOfDate, '2026-08-22');
  assert.equal(snapshot.materialCost, 4);
  assert.deepEqual(snapshot.components[0].sourcePurchaseRowIds, ['before']);
  assert.equal(snapshot.historicalDeterministicBackfill, true);
  assert.throws(() => createHistoricalDeterministicCostSnapshot({ ...order, costSnapshot: snapshot }, []), /Refusing to overwrite/);
});

test('historical reconstruction uses only the earliest exact future purchase date as fallback', () => {
  const order = { ...paidOrder([
    { type: 'stone', stoneId: 'amethyst', size: 6, quantity: 1 },
    { type: 'spacer', spacerId: 'gold-spacer', quantity: 2 }
  ], 100), paidAt: '2026-08-22T06:40:01.327Z' };
  const snapshot = createHistoricalReconstructedCostSnapshot(order, [
    { ...purchase('stone', 'amethyst', 10, 20, 6), id: 'stone-earliest-a', purchased_at: '2026-08-23' },
    { ...purchase('stone', 'amethyst', 10, 40, 6), id: 'stone-earliest-b', purchased_at: '2026-08-23' },
    { ...purchase('stone', 'amethyst', 10, 999, 6), id: 'stone-later', purchased_at: '2026-08-24' },
    { ...purchase('spacer', 'gold-spacer', 10, 10), id: 'spacer-history', purchased_at: '2026-08-21' },
    { ...purchase('stone', 'amethyst', 10, 1, 4), id: 'wrong-size', purchased_at: '2026-08-20' }
  ], '2026-09-01T00:00:00.000Z');
  assert.equal(snapshot.status, 'complete');
  assert.equal(snapshot.historicalEstimatedBackfill, true);
  assert.equal(snapshot.historicalDeterministicBackfill, false);
  assert.equal(snapshot.components[0].weightedAverageUnitCost, 3);
  assert.deepEqual(snapshot.components[0].sourcePurchaseRowIds, ['stone-earliest-a', 'stone-earliest-b']);
  assert.equal(snapshot.components[0].sourcePurchaseDate, '2026-08-23');
  assert.equal(snapshot.components[0].fallbackUsed, true);
  assert.equal(snapshot.components[1].costResolutionMethod, 'historical_exact_purchase');
});

test('historical reconstruction keeps components without any exact Purchase unresolved', () => {
  const order = { ...paidOrder([{ type: 'charm', charmId: 'missing-charm', quantity: 1 }]), paidAt: '2026-08-22T06:40:01.327Z' };
  const snapshot = createHistoricalReconstructedCostSnapshot(order, []);
  assert.equal(snapshot.status, 'unavailable');
  assert.equal(snapshot.components[0].reason, 'missing_exact_purchase_cost');
  assert.equal(snapshot.components[0].costResolutionMethod, 'unresolved_no_exact_purchase');
});

test('CRM renders persisted complete and unavailable snapshot states only', () => {
  const crmSource = fs.readFileSync(path.join(__dirname, '..', 'crm.js'), 'utf8');
  assert.match(crmSource, /const cost = order\.costSnapshot;/);
  assert.match(crmSource, /UNKNOWN \/ UNRESOLVED COST/);
  assert.match(crmSource, /function renderOrderCostDiagnostic/);
  assert.match(crmSource, /Missing cost:/);
  assert.match(crmSource, /Historical cost snapshot missing; no current purchase cost has been applied\./);
  assert.doesNotMatch(crmSource, /getHistoricPurchaseCostSummaries/);
  assert.match(crmSource, /data-label="Cost"/);
});
