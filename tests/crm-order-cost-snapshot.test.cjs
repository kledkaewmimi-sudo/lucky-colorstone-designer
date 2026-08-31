const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  DELIVERY_COST,
  createOrderCostSnapshot,
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

test('CRM renders persisted complete and unavailable snapshot states only', () => {
  const crmSource = fs.readFileSync(path.join(__dirname, '..', 'crm.js'), 'utf8');
  assert.match(crmSource, /const cost = order\.costSnapshot;/);
  assert.match(crmSource, /UNKNOWN \/ UNRESOLVED COST/);
  assert.doesNotMatch(crmSource, /getHistoricPurchaseCostSummaries/);
  assert.match(crmSource, /data-label="Cost"/);
});
