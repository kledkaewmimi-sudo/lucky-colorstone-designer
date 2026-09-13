const assert = require('assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { isCrmPaidOrder, getCrmOrderTotal, toCrmOrderSummary, buildCrmOverview, paginateCrmOrders } = require('../crm-order-read-model.js');
const orders = [
  { id: '4', date: '2026-01-04', stripePaymentStatus: 'PAID', checkoutSummary: { totalPrice: 40 }, braceletPreviewImage: 'large', adminOrderNumber: 4 },
  { id: '3', date: '2026-01-03', paymentStatus: 'paid', checkoutSummary: { finalPrice: 30 }, braceletPreviewImage: 'large', adminOrderNumber: 3 },
  { id: '2', date: '2026-01-02', stripePaymentStatus: 'pending_payment', totalPrice: 20, braceletPreviewImage: 'large' },
  { id: '1', date: '2026-01-01', paymentStatus: 'paid', netPrice: 10, braceletPreviewImage: 'large' }
];
assert.equal(isCrmPaidOrder(orders[0]), true); assert.equal(isCrmPaidOrder(orders[1]), true); assert.equal(isCrmPaidOrder(orders[2]), false);
assert.equal(getCrmOrderTotal(orders[0]), 40); assert.equal(getCrmOrderTotal(orders[1]), 30); assert.equal(getCrmOrderTotal(orders[3]), 10);
const overview = buildCrmOverview(orders); assert.equal(overview.paidOrderCount, 3); assert.equal(overview.revenue, 80); assert.deepEqual(overview.recentOrders.map((o) => o.id), ['4','3','1']); assert.equal('braceletPreviewImage' in overview.recentOrders[0], false);
const page = paginateCrmOrders(orders, 1, 2); assert.equal(page.total, 3); assert.equal(page.totalPages, 2); assert.deepEqual(page.orders.map((order) => order.id), ['4', '3']); assert.equal('braceletPreviewImage' in page.orders[0], false); assert.equal(toCrmOrderSummary(orders[0]).adminOrderNumber, 4);
const secondPage = paginateCrmOrders(orders, 2, 2); assert.deepEqual(secondPage.orders.map((order) => order.id), ['1']); assert.equal(toCrmOrderSummary({ ...orders[0], wristSize: 16, beadSize: 6, totalBeads: 23, hasCharm: 'false', subtotal: 50, discountAmount: 10 }).hasCharm, false);
const crmSource = fs.readFileSync(path.join(__dirname, '..', 'crm.js'), 'utf8');
const dataSource = fs.readFileSync(path.join(__dirname, '..', 'data.js'), 'utf8');
const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
assert.match(dataSource, /export async function getCrmOrderPage\(page = 1, limit = 20\)/);
assert.match(dataSource, /new URLSearchParams\(\{ page: String\(page\), limit: String\(limit\) \}\)/);
assert.match(dataSource, /fetch\(`\/api\/crm\/orders\?\$\{params\.toString\(\)\}`\)/);
assert.match(dataSource, /export async function getCrmOrderDetail\(orderId\)/);
assert.match(dataSource, /fetch\(`\/api\/crm\/orders\/\$\{encodeURIComponent\(orderId\)\}`\)/);
assert.match(crmSource, /async function loadCrmOrdersPage\(page = CRMState\.crmOrdersPage, limit = CRMState\.crmOrdersLimit\)/);
assert.match(crmSource, /const result = await getCrmOrderPage\(page, limit\);/);
assert.match(crmSource, /const order = await getCrmOrderDetail\(orderId\);/);
assert.doesNotMatch(crmSource.slice(crmSource.indexOf('async function openOrderDetailModal'), crmSource.indexOf('async function openOrderDetailModal') + 300), /getSharedCrmOrders|getSharedOrders/);
assert.doesNotMatch(crmSource.slice(crmSource.indexOf('async function openInvoiceModal'), crmSource.indexOf('async function openInvoiceModal') + 220), /getSharedCrmOrders|getSharedOrders/);
assert.match(crmSource, /if \(CRMState\.activeTab === 'purchases'\)/);
assert.match(crmSource, /if \(CRMState\.activeTab === 'analytics'\)/);
assert.match(crmSource, /if \(CRMState\.activeTab === 'inventory' \|\| CRMState\.activeTab === 'simulator' \|\| CRMState\.activeTab === 'charms'\)/);
assert.match(crmSource, /async function loadCrmCatalogBundle/);
assert.match(crmSource, /getSharedPurchaseEntries\(\)/);
assert.match(serverSource, /function applyCrmPaidOrderFilter/);
assert.match(serverSource, /params\.or = '\(payload->>stripePaymentStatus\.ilike\.paid,and\(payload->>stripePaymentStatus\.is\.null,payload->>paymentStatus\.ilike\.paid\)\)'/);
assert.match(serverSource, /readCrmOrderProjection\(\{ page, limit, paidOnly: true \}\)/);
assert.match(serverSource, /totalPages/);
assert.match(serverSource, /'payload->>id': `eq\.\$\{orderId\}`/);
console.log('crm-load-optimization.test.cjs passed');
