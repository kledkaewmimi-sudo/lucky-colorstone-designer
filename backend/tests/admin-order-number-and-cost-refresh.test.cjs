const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  attachAdminOrderNumbers,
  buildAdminOrderNumberLine,
  isPaidOrderForAdminNumber
} = require('../server-admin-order-numbers.js');

const root = path.join(__dirname, '..');
const paidOrder = (id, items = []) => ({
  id,
  status: 'Payment Received',
  stripePaymentStatus: 'paid',
  finalPrice: 200,
  itemizedBilling: items,
  costSnapshot: { status: 'unavailable' }
});

test('maps the database-assigned #36 and #37 only to paid CRM orders', () => {
  const orders = attachAdminOrderNumbers([
    paidOrder('ORD-604590'),
    paidOrder('ORD-705065'),
    { id: 'ORD-PENDING', status: 'Pending Payment', stripePaymentStatus: 'pending_payment' }
  ], [
    { order_id: 'ORD-604590', admin_order_number: 36 },
    { order_id: 'ORD-705065', admin_order_number: 37 },
    { order_id: 'ORD-PENDING', admin_order_number: 38 }
  ]);
  assert.equal(orders[0].adminOrderNumber, 36);
  assert.equal(orders[1].adminOrderNumber, 37);
  assert.equal(orders[2].adminOrderNumber, undefined);
  assert.equal(isPaidOrderForAdminNumber(orders[2]), false);
});

test('formats only the database-assigned number for the admin LINE header', () => {
  assert.equal(buildAdminOrderNumberLine(37), 'เลขออเดอร์: 37');
  assert.doesNotMatch(buildAdminOrderNumberLine(37), /ORD-705065/);
});

test('keeps customer order URLs technical and leaves the customer orders response unextended', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const customerOrders = server.slice(server.indexOf('async function readOrdersForApi'), server.indexOf('async function readAdminOrderNumberRows'));
  assert.match(server, /url\.searchParams\.set\("orderId", orderId\)/);
  assert.doesNotMatch(customerOrders, /adminOrderNumber|admin_order_number/);
  assert.match(server, /pathname === "\/api\/crm\/orders"/);
});

test('admin notification reads a stored number and never allocates one in application code', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(server, /getAdminOrderNumberForOrderId/);
  assert.match(server, /buildAdminOrderNumberLine\(adminOrderNumber\)/);
  assert.doesNotMatch(server, /nextval\s*\(/i);
});

test('guarded refresh is dry-run by default and only allows six approved IDs', async () => {
  const refresh = await import('../scripts/refresh-unavailable-order-costs.mjs');
  assert.deepEqual(refresh.parseOptions([]), { apply: false });
  assert.deepEqual(refresh.parseOptions(['--apply']), { apply: true });
  assert.deepEqual(refresh.APPROVED_ORDER_IDS, [
    'ORD-484936', 'ORD-179772', 'ORD-377597', 'ORD-940605', 'ORD-604590', 'ORD-705065'
  ]);
});

test('guarded refresh resolves ORD-705065 only with the two exact 6mm costs and skips other snapshot states', async () => {
  const refresh = await import('../scripts/refresh-unavailable-order-costs.mjs');
  const rows = [{
    id: 'ORD-705065',
    stripe_payment_status: 'paid',
    payload: paidOrder('ORD-705065', [
      { type: 'stone', stoneId: 'amethyst_quartz', size: 6, quantity: 2 },
      { type: 'stone', stoneId: 'carnelian', size: 6, quantity: 1 }
    ])
  }, {
    id: 'ORD-604590',
    stripe_payment_status: 'paid',
    payload: { ...paidOrder('ORD-604590'), costSnapshot: { status: 'backfilled' } }
  }];
  const purchases = [
    { item_type: 'stone', catalog_item_id: 'amethyst_quartz', size_mm: 6, quantity: 1, total_cost: 4 },
    { item_type: 'stone', catalog_item_id: 'carnelian', size_mm: 6, quantity: 1, total_cost: 3 }
  ];
  const plan = refresh.buildRefreshPlan(rows, purchases, '2026-09-05T00:00:00.000Z');
  const clover = plan.find((item) => item.orderId === 'ORD-705065');
  assert.equal(clover.action, 'WOULD UPDATE');
  assert.equal(clover.snapshot.status, 'backfilled');
  assert.equal(clover.snapshot.materialCost, 11);
  assert.equal(clover.snapshot.totalCost, 91);
  assert.equal(plan.find((item) => item.orderId === 'ORD-604590').reason, 'cost_snapshot_not_unavailable');
  assert.equal(plan.find((item) => item.orderId === 'ORD-484936').reason, 'order_not_found');
});
