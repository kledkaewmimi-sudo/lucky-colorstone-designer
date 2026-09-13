import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const baseUrl = process.env.CRM_ACCEPTANCE_BASE_URL || 'http://127.0.0.1:8000';
const preview = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="2" height="2"%3E%3Crect width="2" height="2" fill="purple"/%3E%3C/svg%3E';
const completeOrders = [
  { id: 'ORD-363745', materialCost: 107.12594861279071, deliveryCost: 80, totalCost: 187.1259486127907, profit: 329.8740513872093, marginPercent: 63.805425800233905 },
  { id: 'ORD-875039', materialCost: 123.63617999442742, deliveryCost: 80, totalCost: 203.63617999442744, profit: 294.36382000557256, marginPercent: 59.10920080433184 },
  { id: 'ORD-905998', materialCost: 38.8057497189507, deliveryCost: 80, totalCost: 118.8057497189507, profit: 219.1942502810493, marginPercent: 64.85036990563589 }
];
const unavailableOrder = { id: 'ORD-307007', deliveryCost: 80 };
const listOrders = [...completeOrders, unavailableOrder].map((order, index) => {
  const complete = completeOrders.find((entry) => entry.id === order.id);
  return {
    id: order.id,
    date: `2026-09-0${4 - index}T12:00:00.000Z`,
    status: 'Payment Received',
    stripePaymentStatus: 'paid',
    customerName: 'Acceptance Fixture',
    wristSize: 16,
    beadSize: 6,
    totalBeads: 23,
    hasCharm: false,
    hasSpacer: false,
    subtotal: 517,
    discountPercent: 0,
    discountAmount: 0,
    totalPrice: 517,
    adminOrderNumber: index + 1,
    // This is the lightweight list contract: a visual sequence and scalar
    // snapshot only. The persisted base64 braceletPreviewImage is absent.
    braceletSequence: [{ id: 'fixture-stone', type: 'stone', sizeMm: 6, color: '#7E57C2', name: 'Fixture stone' }],
    costSnapshot: complete
      ? { status: 'complete', materialCost: complete.materialCost, deliveryCost: complete.deliveryCost, totalCost: complete.totalCost, profit: complete.profit, marginPercent: complete.marginPercent }
      : { status: 'unavailable', materialCost: null, deliveryCost: unavailableOrder.deliveryCost, totalCost: null, profit: null, marginPercent: null }
  };
});
const detailFor = (id) => {
  const complete = completeOrders.find((entry) => entry.id === id);
  const base = { ...listOrders.find((entry) => entry.id === id), braceletPreviewImage: preview, braceletSequence: [] };
  return complete
    ? { ...base, costSnapshot: { status: 'complete', materialCost: complete.materialCost, deliveryCost: complete.deliveryCost, totalCost: complete.totalCost, profit: complete.profit, marginPercent: complete.marginPercent } }
    : { ...base, costSnapshot: { status: 'unavailable', materialCost: null, deliveryCost: unavailableOrder.deliveryCost, totalCost: null, profit: null, marginPercent: null } };
};
const baht = '\u0e3f';
const money = (value) => `${baht}${Number(value).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  // Static asset 404s are not JavaScript/runtime failures; pageerror above is the runtime gate.
  await page.addInitScript(() => localStorage.setItem('lucky_crm_session', 'true'));
  await page.route('**/api/crm/overview', (route) => route.fulfill({ json: { paidOrderCount: 51, revenue: 31774, recentOrders: [] } }));
  await page.route('**/api/stones', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/crm/orders?*', (route) => route.fulfill({ json: { page: 1, limit: 20, total: 51, totalPages: 3, orders: listOrders } }));
  await page.route('**/api/crm/orders/*', (route) => {
    const id = decodeURIComponent(route.request().url().split('/').pop());
    return route.fulfill({ json: detailFor(id) });
  });
  await page.goto(`${baseUrl}/crm.html`, { waitUntil: 'networkidle' });
  await page.locator('[data-tab="orders"]').first().click();
  await page.locator('.btn-order-detail').first().waitFor();
  console.log('browser-stage=card-and-detail');

  for (const expected of completeOrders) {
    const row = page.locator('tr').filter({ has: page.locator(`.btn-order-detail[data-id="${expected.id}"]`) });
    const visualPreview = row.locator('svg.order-bracelet-preview-svg[role="img"]');
    assert.equal(await visualPreview.count(), 1, `compact card preview missing for ${expected.id}`);
    const cardText = await row.innerText();
    assert.match(cardText, new RegExp(`Material Cost\\s*${money(expected.materialCost).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.match(cardText, new RegExp(`Delivery Cost\\s*${baht}80`));
    assert.match(cardText, new RegExp(`Total Cost\\s*${money(expected.totalCost).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.match(cardText, new RegExp(`Profit\\s*${money(expected.profit).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.match(cardText, new RegExp(`Margin\\s*${expected.marginPercent.toFixed(1)}%`));
    assert.equal('braceletPreviewImage' in listOrders.find((entry) => entry.id === expected.id), false);

    await page.locator(`.btn-order-detail[data-id="${expected.id}"]`).click();
    const modal = page.locator('#orderDetailModal');
    await modal.waitFor();
    const image = modal.locator('img.order-bracelet-preview-img');
    await assert.doesNotReject(() => image.waitFor());
    assert.match(await image.getAttribute('src'), /^data:image\//);
    const text = await modal.innerText();
    assert.match(text, new RegExp(`Material Cost\\s*${money(expected.materialCost).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.match(text, new RegExp(`Delivery Cost\\s*${baht}80`));
    assert.match(text, new RegExp(`Total Cost\\s*${money(expected.totalCost).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.match(text, new RegExp(`Profit\\s*${money(expected.profit).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.match(text, new RegExp(`Margin\\s*${expected.marginPercent.toFixed(1)}%`));
    await page.locator('#btnOrderDetailModalClose').click();
  }

  const controlRow = page.locator('tr').filter({ has: page.locator(`.btn-order-detail[data-id="${unavailableOrder.id}"]`) });
  assert.equal(await controlRow.locator('svg.order-bracelet-preview-svg[role="img"]').count(), 1);
  const controlCardText = await controlRow.innerText();
  assert.match(controlCardText, /Material Cost\s*Unavailable/);
  assert.match(controlCardText, /Total Cost\s*Unavailable/);
  assert.match(controlCardText, /Profit\s*Unavailable/);
  assert.match(controlCardText, /Margin\s*Unavailable/);

  await page.locator(`.btn-order-detail[data-id="${unavailableOrder.id}"]`).click();
  const control = page.locator('#orderDetailModal');
  await control.waitFor();
  assert.match(await control.locator('img.order-bracelet-preview-img').getAttribute('src'), /^data:image\//);
  const controlText = await control.innerText();
  assert.match(controlText, /Material Cost\s*Unavailable/);
  assert.match(controlText, /Total Cost\s*Unavailable/);
  assert.match(controlText, /Profit\s*Unavailable/);
  assert.match(controlText, /Margin\s*Unavailable/);
  assert.equal(runtimeErrors.length, 0, runtimeErrors.join('\n'));
  console.log('CRM detail browser acceptance passed');
} finally {
  await browser.close();
}