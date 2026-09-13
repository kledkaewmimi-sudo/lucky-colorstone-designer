import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { paginateCrmOrders, toCrmOrderSummary } = require('../crm-order-read-model.js');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const crmSource = fs.readFileSync(path.join(root, 'crm.js'), 'utf8');
const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

const orders = [
  { id: 'paid-new', date: '2026-01-05', stripePaymentStatus: 'paid', totalPrice: 50, wristSize: 16, beadSize: 6, totalBeads: 23, hasCharm: 'true', subtotal: 60, discountAmount: 10, adminOrderNumber: 12, braceletPreviewImage: 'large', braceletSequence: [{ id: 'stone-1', type: 'stone', sizeMm: 6 }], costSnapshot: { status: 'complete', materialCost: 20, deliveryCost: 80, totalCost: 100, profit: 40, marginPercent: 40 } },
  { id: 'pending', date: '2026-01-04', stripePaymentStatus: 'pending_payment', totalPrice: 40, braceletPreviewImage: 'large' },
  { id: 'paid-old', date: '2026-01-03', paymentStatus: 'PAID', totalPrice: 30, braceletPreviewImage: 'large' },
  { id: 'unpaid', date: '2026-01-02', paymentStatus: 'unpaid', totalPrice: 20, braceletPreviewImage: 'large' }
];

test('paid-only pagination filters before page slicing and reports paid metadata', () => {
  const first = paginateCrmOrders(orders, 1, 1);
  const second = paginateCrmOrders(orders, 2, 1);
  assert.equal(first.total, 2);
  assert.equal(first.totalPages, 2);
  assert.deepEqual(first.orders.map((order) => order.id), ['paid-new']);
  assert.deepEqual(second.orders.map((order) => order.id), ['paid-old']);
  assert.notEqual(first.orders[0].id, second.orders[0].id);
});

test('compact order summaries retain list fields and exclude preview data', () => {
  const summary = toCrmOrderSummary(orders[0]);
  assert.deepEqual(
    { wristSize: summary.wristSize, beadSize: summary.beadSize, totalBeads: summary.totalBeads, hasCharm: summary.hasCharm, subtotal: summary.subtotal, discountAmount: summary.discountAmount, totalPrice: summary.totalPrice, adminOrderNumber: summary.adminOrderNumber },
    { wristSize: 16, beadSize: 6, totalBeads: 23, hasCharm: true, subtotal: 60, discountAmount: 10, totalPrice: 50, adminOrderNumber: 12 }
  );
assert.deepEqual(summary.braceletSequence, [{ id: 'stone-1', type: 'stone', sizeMm: 6 }]);
  assert.deepEqual(summary.costSnapshot, { status: 'complete', materialCost: 20, deliveryCost: 80, totalCost: 100, profit: 40, marginPercent: 40 });
  assert.equal('braceletPreviewImage' in summary, false);
});

test('non-order CRM tabs hydrate only their required module data', () => {
  assert.match(crmSource, /if \(CRMState\.activeTab === 'purchases'\)[\s\S]*loadPurchases\(prefetched\)/);
  assert.match(crmSource, /if \(CRMState\.activeTab === 'analytics'\)[\s\S]*fetchAnalyticsSummary\(\)/);
  assert.match(crmSource, /activeTab === 'inventory' \|\| CRMState\.activeTab === 'simulator' \|\| CRMState\.activeTab === 'charms'/);
  assert.match(crmSource, /async function loadCrmCatalogBundle/);
  assert.match(crmSource, /getSharedPurchaseEntries\(\)/);
});

test('server applies paid database filter before pagination and reads one detail payload by order id', () => {
  assert.match(serverSource, /function applyCrmPaidOrderFilter/);
  assert.match(serverSource, /if \(paidOnly\) applyCrmPaidOrderFilter\(params\);/);
  assert.match(serverSource, /params\.limit = limit; params\.offset = \(page - 1\) \* limit/);
  assert.match(serverSource, /readCrmOrderProjection\(\{ page, limit, paidOnly: true \}\)/);
  assert.match(serverSource, /'payload->>id': `eq\.\$\{orderId\}`/);
  assert.match(serverSource, /select: 'payload'/);
});
