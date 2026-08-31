const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createOrderCostSnapshot, preserveOrCreateOrderCostSnapshot } = require('../server-order-cost-snapshot.js');
const { readOrderPayloads, saveOrderPayload } = require('../server-order-persistence.js');
const { isUatSupabaseApiRequest } = require('../uat-backend-guard.js');

const qaDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'lucky-colorstone-uat-cost-snapshot-'));
const ordersFile = path.join(qaDirectory, 'orders.json');
const getOrderId = (order) => order.id;

function order(id, itemizedBilling) {
  return {
    id,
    stripePaymentStatus: 'paid',
    finalPrice: 458,
    totalPrice: 458,
    itemizedBilling
  };
}

function purchase(itemType, catalogItemId, quantity, totalCost, sizeMm) {
  return { item_type: itemType, catalog_item_id: catalogItemId, quantity, total_cost: totalCost, size_mm: sizeMm };
}

test.after(() => fs.rmSync(qaDirectory, { recursive: true, force: true }));

test('persists and re-reads a complete immutable snapshot in the JSON order fallback', () => {
  const qaOrder = order('QA-COST-SNAPSHOT-20260831-COMPLETE', [
    { type: 'stone', stoneId: 'qa-amethyst', size: 6, quantity: 10 }
  ]);
  const calculatedAt = '2026-08-31T00:00:00.000Z';
  const snapshot = createOrderCostSnapshot(qaOrder, [purchase('stone', 'qa-amethyst', 10, 126, 6)], calculatedAt);
  saveOrderPayload(ordersFile, { ...qaOrder, costSnapshot: snapshot }, getOrderId);

  const saved = readOrderPayloads(ordersFile)[0];
  assert.equal(saved.costSnapshot.status, 'complete');
  assert.equal(saved.costSnapshot.calculatedAt, calculatedAt);
  assert.equal(saved.costSnapshot.costSource, 'purchases_weighted_average_exact_variant');
  assert.equal(saved.costSnapshot.finalPaidAmount, 458);
  assert.equal(saved.costSnapshot.materialCost, 126);
  assert.equal(saved.costSnapshot.deliveryCost, 80);
  assert.equal(saved.costSnapshot.totalCost, 206);
  assert.equal(saved.costSnapshot.profit, 252);
  assert.equal(Number(saved.costSnapshot.marginPercent.toFixed(1)), 55.0);
  assert.equal(saved.costSnapshot.components.length, 1);

  const preserved = preserveOrCreateOrderCostSnapshot(saved, [purchase('stone', 'qa-amethyst', 10, 990, 6)]);
  saveOrderPayload(ordersFile, preserved, getOrderId);
  const reread = readOrderPayloads(ordersFile).find((entry) => entry.id === qaOrder.id);
  assert.deepEqual(reread.costSnapshot, snapshot);
});

test('persists and re-reads an unresolved snapshot without a zero fallback', () => {
  const qaOrder = order('QA-COST-SNAPSHOT-20260831-UNRESOLVED', [
    { type: 'stone', stoneId: 'qa-amethyst', size: 10, quantity: 1 }
  ]);
  const snapshot = createOrderCostSnapshot(qaOrder, [purchase('stone', 'qa-amethyst', 10, 126, 6)], '2026-08-31T00:01:00.000Z');
  saveOrderPayload(ordersFile, { ...qaOrder, costSnapshot: snapshot }, getOrderId);

  const saved = readOrderPayloads(ordersFile).find((entry) => entry.id === qaOrder.id);
  assert.equal(saved.costSnapshot.status, 'unavailable');
  assert.equal(saved.costSnapshot.deliveryCost, 80);
  assert.equal(saved.costSnapshot.materialCost, null);
  assert.equal(saved.costSnapshot.totalCost, null);
  assert.equal(saved.costSnapshot.profit, null);
  assert.equal(saved.costSnapshot.marginPercent, null);
  assert.equal(saved.costSnapshot.components[0].resolved, false);
});

test('UAT guard keeps order APIs and any QA order endpoint unavailable', () => {
  assert.equal(isUatSupabaseApiRequest('GET', '/api/orders'), false);
  assert.equal(isUatSupabaseApiRequest('POST', '/api/orders'), false);
  assert.equal(isUatSupabaseApiRequest('GET', '/api/orders/qa-cost-snapshot'), false);
});

test('server routes use the shared JSON order persistence helper and expose no QA route', () => {
  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(serverSource, /readOrderPayloads\(dataFiles\.orders\)/);
  assert.match(serverSource, /saveOrderPayload\(dataFiles\.orders, order, getOrderId\)/);
  assert.doesNotMatch(serverSource, /qa-cost-snapshot/i);
});
