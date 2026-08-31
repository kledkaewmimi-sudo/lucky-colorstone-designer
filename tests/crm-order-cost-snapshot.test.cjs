const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { DELIVERY_COST, createOrderCostSnapshot, preserveOrCreateOrderCostSnapshot } = require('../server-order-cost-snapshot.js');

const order = (items, finalPrice = 458, status = 'paid') => ({
  id: 'ORD-TEST', stripePaymentStatus: status, finalPrice, totalPrice: finalPrice, itemizedBilling: items
});
const purchase = (item_type, catalog_item_id, quantity, total_cost, size_mm) => ({
  item_type, catalog_item_id, quantity, total_cost, size_mm
});

test('resolves exact 4mm, 6mm, and 10mm stone costs independently', () => {
  const snapshot = createOrderCostSnapshot(order([
    { type: 'stone', stoneId: 'amethyst', size: 4, quantity: 1 },
    { type: 'stone', stoneId: 'amethyst', size: 6, quantity: 1 },
    { type: 'stone', stoneId: 'amethyst', size: 10, quantity: 1 }
  ], 500), [
    purchase('stone', 'amethyst', 100, 200, 4),
    purchase('stone', 'amethyst', 100, 350, 6),
    purchase('stone', 'amethyst', 50, 400, 10)
  ]);
  assert.equal(snapshot.status, 'complete');
  assert.deepEqual(snapshot.components.map((entry) => entry.weightedAverageUnitCost), [2, 3.5, 8]);
  assert.equal(snapshot.materialCost, 13.5);
});

test('weighted average combines stone, charm, and spacer material costs', () => {
  const snapshot = createOrderCostSnapshot(order([
    { type: 'stone', stoneId: 'amethyst', size: 6, quantity: 10 },
    { type: 'charm', charmId: 'heart', quantity: 1 },
    { type: 'spacer', spacerId: 'gold-spacer', quantity: 2 }
  ]), [
    purchase('stone', 'amethyst', 100, 350, 6),
    purchase('charm', 'heart', 10, 100),
    purchase('spacer', 'gold-spacer', 20, 40)
  ]);
  assert.equal(snapshot.materialCost, 49);
  assert.equal(snapshot.deliveryCost, DELIVERY_COST);
  assert.equal(snapshot.totalCost, 129);
  assert.equal(snapshot.profit, 329);
  assert.equal(snapshot.marginPercent, (329 / 458) * 100);
});

test('profit and margin use final paid total after discount', () => {
  const snapshot = createOrderCostSnapshot(order([
    { type: 'stone', stoneId: 'amethyst', size: 6, quantity: 10 }
  ], 458), [purchase('stone', 'amethyst', 100, 1260, 6)]);
  assert.equal(snapshot.materialCost, 126);
  assert.equal(snapshot.totalCost, 206);
  assert.equal(snapshot.profit, 252);
  assert.equal(Number(snapshot.marginPercent.toFixed(1)), 55);
});

test('a genuine zero purchase cost is complete, while a missing exact variant is unavailable', () => {
  const zero = createOrderCostSnapshot(order([{ type: 'stone', stoneId: 'gift', size: 4, quantity: 3 }], 100), [purchase('stone', 'gift', 10, 0, 4)]);
  assert.equal(zero.status, 'complete');
  assert.equal(zero.materialCost, 0);
  assert.equal(zero.totalCost, 80);
  const missing = createOrderCostSnapshot(order([{ type: 'stone', stoneId: 'amethyst', size: 10, quantity: 1 }]), [purchase('stone', 'amethyst', 100, 200, 4)]);
  assert.equal(missing.status, 'unavailable');
  assert.equal(missing.materialCost, null);
  assert.equal(missing.profit, null);
});

test('paid-only snapshots are immutable after Purchases change', () => {
  assert.equal(createOrderCostSnapshot(order([], 100, 'pending_payment'), []), null);
  const original = createOrderCostSnapshot(order([{ type: 'stone', stoneId: 'amethyst', size: 6, quantity: 1 }]), [purchase('stone', 'amethyst', 1, 3.5, 6)]);
  const retained = preserveOrCreateOrderCostSnapshot({ ...order([{ type: 'stone', stoneId: 'amethyst', size: 6, quantity: 1 }]), costSnapshot: original }, [purchase('stone', 'amethyst', 1, 99, 6)]);
  assert.equal(retained.costSnapshot, original);
  assert.equal(retained.costSnapshot.materialCost, 3.5);
});

test('CRM renders complete, backfilled, and unavailable snapshots without live purchase recalculation', () => {
  const crm = fs.readFileSync(path.join(__dirname, '..', 'crm.js'), 'utf8');
  assert.match(crm, /cost\?\.status === 'complete' \|\| cost\?\.status === 'backfilled'/);
  assert.match(crm, /Backfilled estimate/);
  assert.match(crm, /UNKNOWN \/ UNRESOLVED COST/);
  assert.match(crm, /data-label="Cost"/);
  assert.doesNotMatch(crm, /getHistoricPurchaseCostSummaries/);
});
