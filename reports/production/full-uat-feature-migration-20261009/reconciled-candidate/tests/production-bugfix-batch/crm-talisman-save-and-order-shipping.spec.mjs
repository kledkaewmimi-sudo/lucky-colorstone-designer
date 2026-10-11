// Browser acceptance for two production fixes, driven through the real CRM:
//   TASK A - the talisman Save path must recognise an existing hidden/inactive record, use the
//            authorized update path for it, refuse to overwrite a record it cannot read, and always
//            tell the operator what happened.
//   TASK B - every Order card carries the complete shipping presentation of its own order
//            (recipient, full address, postal code, phone, copy button) between Pricing and Cost.
//
// The CRM is served statically from the release candidate and every /api call is proxied to a real
// backend process running in JSON mode against a synthetic DATA_DIR. No production data or secret is
// used, and the operator session/CSRF flow is the real one.
import { test, expect } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = process.cwd();
const ADMIN_USER = 'qa-operator';
const ADMIN_SECRET = 'qa-synthetic-admin-secret-7f21';
const PREVIEW = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="2" height="2"%3E%3Crect width="2" height="2" fill="purple"/%3E%3C/svg%3E';

test.describe.configure({ mode: 'serial' });
test.setTimeout(180000);

let backend;
let gateway;
let baseUrl;
let dataDir;
let backendPort;
let backendLog = '';

const renderTuning = (scale) => ({
  visualScale: scale,
  visualOffsetX: 3,
  visualOffsetY: -2,
  maxWidthRatio: 0.98,
  maxHeightRatio: 1,
  rotation: 0,
  anchor: 'top',
  edgeFitMode: 'contain',
  targetWidthFillRatio: 0.9,
  contactInsetLeft: 0.4,
  contactInsetRight: 0.4
});

// Mirrors buildCopyReadyShippingLabel for the fixture expectations.
const buildFallbackLabel = (shippingInfo) => [
  shippingInfo.recipientName,
  [shippingInfo.addressLine, shippingInfo.province, shippingInfo.postalCode].filter(Boolean).join(' '),
  shippingInfo.phoneNumber
].join('\n');

const THAI_NAME = (id) => '\u0E17\u0E14\u0E2A\u0E2D\u0E1A ' + id.toUpperCase();

const charm = (id, overrides = {}) => ({
  id,
  entityType: 'charm',
  sku: id.toUpperCase(),
  slug: id,
  type: 'takrud_lukshmi',
  collection: 'qa',
  categoryId: 'qa',
  name: { en: 'QA ' + id.toUpperCase(), th: THAI_NAME(id) },
  image: { primary: '/assets/charms/_placeholder.png' },
  pricing: { base: 590 },
  business: { sizeCm: 3, footprintMm: 30 },
  meaning: { en: 'QA fixture', th: '' },
  availability: { inStock: true, isActive: true, stockQty: 7, stock_qty: 7 },
  stockQty: 7,
  stock_qty: 7,
  renderTuning: renderTuning(1.25),
  displayOrder: 90,
  ...overrides
});

const CHARMS = [
  charm('qa01', { pricing: { base: 590 }, displayOrder: 10 }),
  charm('qa02', {
    pricing: { base: 620 },
    displayOrder: 20,
    renderTuning: renderTuning(1.4),
    availability: { inStock: false, isActive: false, stockQty: 0, stock_qty: 0 },
    stockQty: 0,
    stock_qty: 0
  }),
  charm('qa03', { pricing: { base: 610 }, displayOrder: 30, availability: { inStock: true, isActive: true, stockQty: 3, stock_qty: 3 }, stockQty: 3, stock_qty: 3 })
];

const STONES = [
  {
    id: 'amethyst',
    entityType: 'stone',
    name: { en: 'Amethyst', th: '' },
    categoryId: 'love',
    sizes: [4, 6, 10],
    p4: 40,
    p6: 60,
    p10: 100,
    price: 60,
    image: 'assets/amethyst.webp',
    inStock: true,
    isActive: true,
    availability: { inStock: true, isActive: true, stockQty: 50, stock_qty: 50 },
    displayOrder: 10
  }
];

// Two paid fixtures with different recipients/addresses: the card copy button must never copy the
// other order's address. The Thai values are stored as escapes so no encoding step can alter them.
const ORDERS = [
  {
    id: 'QA-ORD-0001',
    date: '2026-10-10T03:00:00.000Z',
    status: 'Payment Received',
    stripePaymentStatus: 'paid',
    customerName: 'QA Customer A',
    wristSize: 16,
    beadSize: 6,
    totalBeads: 23,
    hasCharm: true,
    hasSpacer: false,
    braceletPreviewImage: PREVIEW,
    shippingInfo: {
      recipientName: '\u0E2A\u0E21\u0E0A\u0E32\u0E22 \u0E17\u0E14\u0E2A\u0E2D\u0E1A\u0E2B\u0E19\u0E36\u0E48\u0E07',
      phoneNumber: '0800000001',
      addressLine: '1/1 \u0E16.\u0E17\u0E14\u0E2A\u0E2D\u0E1A \u0E41\u0E02\u0E27\u0E07\u0E17\u0E14\u0E2A\u0E2D\u0E1A',
      province: '\u0E01\u0E23\u0E38\u0E07\u0E40\u0E17\u0E1E\u0E21\u0E2B\u0E32\u0E19\u0E04\u0E23',
      postalCode: '10900'
    },
    costSnapshot: { status: 'complete', materialCost: 100, deliveryCost: 80, totalCost: 180, profit: 300, marginPercent: 62.5 },
    checkoutSummary: { subtotal: 480, discountPercent: 0, discountAmount: 0, totalPrice: 480 }
  },
  {
    id: 'QA-ORD-0002',
    date: '2026-10-09T03:00:00.000Z',
    status: 'Shipped',
    stripePaymentStatus: 'paid',
    customerName: 'QA Customer B',
    wristSize: 15,
    beadSize: 4,
    totalBeads: 30,
    hasCharm: false,
    hasSpacer: false,
    braceletPreviewImage: PREVIEW,
    shippingInfo: {
      recipientName: '\u0E2A\u0E21\u0E0A\u0E32\u0E22 \u0E17\u0E14\u0E2A\u0E2D\u0E1A\u0E2A\u0E2D\u0E07',
      phoneNumber: '0800000002',
      addressLine: '22/22 \u0E16.\u0E17\u0E14\u0E2A\u0E2D\u0E1A\u0E2A\u0E2D\u0E07 \u0E41\u0E02\u0E27\u0E07\u0E17\u0E14\u0E2A\u0E2D\u0E1A\u0E2A\u0E2D\u0E07',
      province: '\u0E0A\u0E25\u0E1A\u0E38\u0E23\u0E35',
      postalCode: '20150'
    },
    costSnapshot: { status: 'complete', materialCost: 120, deliveryCost: 80, totalCost: 200, profit: 280, marginPercent: 58.3 },
    checkoutSummary: { subtotal: 480, discountPercent: 0, discountAmount: 0, totalPrice: 480 }
  }
];

const freePort = () => new Promise((resolve) => {
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});

const mime = (file) => (file.endsWith('.html') ? 'text/html; charset=utf-8'
  : file.endsWith('.css') ? 'text/css; charset=utf-8'
    : file.endsWith('.js') || file.endsWith('.mjs') ? 'application/javascript; charset=utf-8'
      : file.endsWith('.webp') ? 'image/webp'
        : file.endsWith('.png') ? 'image/png'
          : file.endsWith('.json') ? 'application/json; charset=utf-8'
            : 'application/octet-stream');

test.beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcs-crm-acceptance-'));
  fs.writeFileSync(path.join(dataDir, 'charms.json'), JSON.stringify(CHARMS, null, 1), 'utf8');
  fs.writeFileSync(path.join(dataDir, 'stones.json'), JSON.stringify(STONES, null, 1), 'utf8');
  fs.writeFileSync(path.join(dataDir, 'spacers.json'), '[]', 'utf8');
  fs.writeFileSync(path.join(dataDir, 'orders.json'), JSON.stringify(ORDERS, null, 1), 'utf8');
  fs.writeFileSync(path.join(dataDir, 'categories.json'), '[]', 'utf8');
  fs.writeFileSync(path.join(dataDir, 'settings.json'), JSON.stringify({ globalDiscountPercent: 0, discountEnabled: false, showDiscountBanner: false }), 'utf8');

  backendPort = await freePort();
  backend = spawn(process.execPath, [path.join(root, 'server.js')], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(backendPort),
      DATA_DIR: dataDir,
      ADMIN_API_SECRET: ADMIN_SECRET,
      ADMIN_USERNAME: ADMIN_USER,
      SUPABASE_URL: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
      STRIPE_WEBHOOK_SECRET: '',
      LINE_CHANNEL_SECRET: ''
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  backend.stdout.on('data', (chunk) => { backendLog += chunk; });
  backend.stderr.on('data', (chunk) => { backendLog += chunk; });

  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const probe = await fetch(`http://127.0.0.1:${backendPort}/api/settings`);
      if (probe.ok) break;
    } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  gateway = http.createServer((req, res) => {
    if (req.url.startsWith('/api/')) {
      const upstream = http.request({
        hostname: '127.0.0.1',
        port: backendPort,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: `127.0.0.1:${backendPort}` }
      }, (response) => {
        res.writeHead(response.statusCode, response.headers);
        response.pipe(res);
      });
      upstream.on('error', () => { res.writeHead(502); res.end(); });
      req.pipe(upstream);
      return;
    }
    const url = new URL(req.url, 'http://localhost');
    const relative = url.pathname === '/' ? 'crm.html' : decodeURIComponent(url.pathname.slice(1));
    const file = path.resolve(root, relative);
    if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': mime(file) });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => gateway.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${gateway.address().port}`;
});

test.afterAll(async () => {
  backend?.kill();
  await new Promise((resolve) => gateway?.close(resolve));
});

const signIn = async (page) => {
  await page.goto(`${baseUrl}/crm.html`, { waitUntil: 'domcontentloaded' });
  await page.locator('#adminUsername').fill(ADMIN_USER);
  await page.locator('#adminPassword').fill(ADMIN_SECRET);
  await page.locator('#loginForm button[type="submit"]').click();
  await expect(page.locator('#dashboardContainer')).toBeVisible({ timeout: 20000 });
};

const apiCharms = async (page) => {
  const response = await page.request.get(`${baseUrl}/api/charms`);
  expect(response.ok()).toBeTruthy();
  return response.json();
};

const charmFromApi = async (page, id) => (await apiCharms(page)).find((entry) => entry.id === id);

const openTalismanTab = async (page) => {
  await page.locator('[data-tab="charms"]:visible').click();
  await expect(page.locator('#charmsTableBody tr').first()).toBeVisible({ timeout: 20000 });
};

// The modal keeps its own scroll container, so the submit is issued through the real form element
// (still the page's submit handler and native validation).
const submitCharmForm = async (page) => {
  await page.locator('#charmCrudForm').evaluate((form) => form.requestSubmit());
};

// The CRM modals hide with opacity/pointer-events rather than display, so Playwright's visibility
// check cannot see the difference; the `.show` class is the real open/closed contract.
const modalOpen = (page, selector) => expect(page.locator(selector)).toHaveClass(/show/);
const modalClosed = (page, selector) => expect(page.locator(selector)).not.toHaveClass(/show/);

// The tall modal card scrolls internally, so a pointer click on a checkbox deep in the form is not
// reliable in a headless run; the operator-visible value is still what the submit reads.
const setChecked = (page, selector, checked) => page.locator(selector).evaluate((element, value) => {
  element.checked = value;
  element.dispatchEvent(new Event('change', { bubbles: true }));
}, checked);

// showToast only removes the class, never the text, so each stage starts from an empty toast.
const clearToast = (page) => page.evaluate(() => {
  const toast = document.getElementById('crmToast');
  toast.textContent = '';
  toast.classList.remove('show');
});

// The CRM form requires the full talisman record for a create, so the new-talisman stages fill every
// required field with synthetic values.
const fillNewTalisman = async (page, { id, price, stock, nameEn }) => {
  await page.locator('#crudCharmId').fill(id);
  await page.locator('#crudCharmSku').fill(id.toUpperCase());
  await page.locator('#crudCharmNameEn').fill(nameEn);
  await page.locator('#crudCharmNameTh').fill('\u0E17\u0E14\u0E2A\u0E2D\u0E1A ' + id.toUpperCase());
  await page.locator('#crudCharmType').fill('takrud_lukshmi');
  await page.locator('#crudCharmSizeCm').fill('3');
  await page.locator('#crudCharmPrice').fill(String(price));
  await page.locator('#crudCharmImage').fill('/assets/charms/_placeholder.png');
  await page.locator('#crudCharmStockQty').fill(String(stock));
  const option = await page.locator('#crudCharmCollection option').first().getAttribute('value');
  if (option) await page.locator('#crudCharmCollection').selectOption(option);
};

test('TASK A: talisman save handles active, hidden, duplicate and stale records', async ({ page }) => {
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  await signIn(page);
  await openTalismanTab(page);

  // The inactive record is listed by the API (visibility is a client decision), so the operator can
  // open it: the CRM must send an update for the stored id, not a create.
  const before02 = await charmFromApi(page, 'qa02');
  expect(before02.availability.isActive).toBe(false);

  const editRow = (id) => page.locator('#charmsTableBody tr').filter({ has: page.locator(`.action-btn.edit[data-id="${id}"]`) });

  // --- 1. active record: stock, price and visibility persist, render tuning untouched -----------
  await editRow('qa01').locator('.action-btn.edit').click();
  await modalOpen(page, '#charmCrudModal');
  await page.locator('#crudCharmStockQty').fill('42');
  await page.locator('#crudCharmPrice').fill('777');
  await clearToast(page);
  await submitCharmForm(page);
  await expect(page.locator('#crmToast')).toHaveClass(/show/);
  await expect(page.locator('#crmToast')).toHaveText(/updated/i);
  await modalClosed(page, '#charmCrudModal');

  const after01 = await charmFromApi(page, 'qa01');
  expect(Number(after01.availability.stockQty)).toBe(42);
  expect(Number(after01.pricing.base)).toBe(777);
  expect(after01.availability.isActive).toBe(true);
  expect(after01.renderTuning).toEqual(renderTuning(1.25));
  expect(after01.name.th).toBe(THAI_NAME('qa01'));

  // --- 2. hidden/inactive record: the authorized update path re-activates it --------------------
  await editRow('qa02').locator('.action-btn.edit').click();
  await modalOpen(page, '#charmCrudModal');
  await page.locator('#crudCharmStockQty').fill('11');
  await setChecked(page, '#crudCharmIsActive', true);
  await clearToast(page);
  await submitCharmForm(page);
  await expect(page.locator('#crmToast')).toHaveText(/updated/i);
  await modalClosed(page, '#charmCrudModal');

  const after02 = await charmFromApi(page, 'qa02');
  expect(after02.availability.isActive).toBe(true);
  expect(Number(after02.availability.stockQty)).toBe(11);
  expect(after02.renderTuning).toEqual(renderTuning(1.4));
  expect(Number((await charmFromApi(page, 'qa03')).pricing.base)).toBe(610);

  // --- 3. duplicate id: the POST refusal is turned into the authorized update -------------------
  // Until the client posts, the charm list hides qa01, so a fresh client read believes the id is
  // new and the CRM sends a create; the refusal is what reveals the stored record.
  let charmPostAttempted = false;
  await page.route('**/api/charms', async (route) => {
    if (route.request().method() !== 'GET') {
      if (route.request().method() === 'POST') charmPostAttempted = true;
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({ response, json: charmPostAttempted ? body : body.filter((entry) => entry.id !== 'qa01') });
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#dashboardContainer')).toBeVisible({ timeout: 20000 });
  await openTalismanTab(page);
  await expect(editRow('qa01')).toHaveCount(0);
  await page.locator('#btnOpenAddCharmModal').click();
  await fillNewTalisman(page, { id: 'qa01', price: 660, stock: 9, nameEn: 'QA QA01 duplicate id' });
  await clearToast(page);
  await submitCharmForm(page);
  await expect(page.locator('#crmToast')).toHaveText(/added to catalog/i);
  await modalClosed(page, '#charmCrudModal');

  const stored01 = await charmFromApi(page, 'qa01');
  expect((await apiCharms(page)).filter((entry) => entry.id === 'qa01')).toHaveLength(1);
  expect(Number(stored01.pricing.base)).toBe(660);
  expect(Number(stored01.availability.stockQty)).toBe(9);
  expect(stored01.renderTuning).toEqual(renderTuning(1.25));
  expect(Number((await charmFromApi(page, 'qa03')).pricing.base)).toBe(610);
  await page.unroute('**/api/charms');

  // --- 4. a row the server no longer stores reports the failure and stays untouched -------------
  await page.route('**/api/charms', async (route) => {
    if (route.request().method() !== 'GET') { await route.continue(); return; }
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({ response, json: [...body, charm('qa77', { pricing: { base: 500 }, displayOrder: 100 })] });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#dashboardContainer')).toBeVisible({ timeout: 20000 });
  await openTalismanTab(page);
  await editRow('qa77').locator('.action-btn.edit').click();
  await modalOpen(page, '#charmCrudModal');
  await page.locator('#crudCharmPrice').fill('505');
  await clearToast(page);
  await submitCharmForm(page);
  await expect(page.locator('#crmToast')).toHaveText(/no longer in the catalog/i);
  await modalOpen(page, '#charmCrudModal');
  expect((await apiCharms(page)).some((entry) => entry.id === 'qa77')).toBe(false);
  await page.unroute('**/api/charms');

  // --- 5. a genuinely new talisman still creates -------------------------------------------------
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#dashboardContainer')).toBeVisible({ timeout: 20000 });
  await openTalismanTab(page);
  await page.getByRole('button', { name: /add new talisman/i }).first().click();
  await fillNewTalisman(page, { id: 'qa50', price: 480, stock: 4, nameEn: 'QA QA50 new' });
  await clearToast(page);
  await submitCharmForm(page);
  await expect(page.locator('#crmToast')).toHaveText(/added/i);
  const created = await charmFromApi(page, 'qa50');
  expect(Number(created.pricing.base)).toBe(480);
  expect(Number(created.availability.stockQty)).toBe(4);

  expect(runtimeErrors).toEqual([]);
});

test('TASK B: order cards carry their own complete shipping information', async ({ page }) => {
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  await page.addInitScript(() => {
    window.__copiedLabels = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text) => { window.__copiedLabels.push(String(text)); } }
    });
  });
  await signIn(page);
  await page.locator('[data-tab="orders"]:visible').click();
  await expect(page.locator('#ordersTableBody .btn-order-detail').first()).toBeVisible({ timeout: 20000 });

  const rowFor = (id) => page.locator('#ordersTableBody tr').filter({ has: page.locator(`.btn-order-detail[data-id="${id}"]`) });

  for (const order of ORDERS) {
    const row = rowFor(order.id);
    const text = await row.innerText();
    const shipping = order.shippingInfo;
    expect(text).toContain(shipping.recipientName);
    expect(text).toContain(shipping.addressLine);
    expect(text).toContain(shipping.province);
    expect(text).toContain(shipping.postalCode);
    expect(text).toContain(shipping.phoneNumber);
    // Exactly one shipping presentation per card: the compact formatted block, no duplicated rows.
    expect(await row.locator('.order-shipping-label-block').count()).toBe(1);
    expect(await row.locator('.order-shipping-label-text').count()).toBe(1);
    expect(await row.locator('td[data-label="Shipping Information"] .order-detail-field').count()).toBe(0);
    const labels = text.toUpperCase();
    expect(labels).not.toContain('RECIPIENT NAME');
    expect(labels).not.toContain('FULL ADDRESS');
    expect(labels).not.toContain('POSTAL CODE');
    expect(await row.locator('.order-copy-shipping-label').count()).toBe(1);
  }

  // No card may show the other order's recipient.
  expect(await rowFor(ORDERS[0].id).innerText()).not.toContain(ORDERS[1].shippingInfo.recipientName);
  expect(await rowFor(ORDERS[1].id).innerText()).not.toContain(ORDERS[0].shippingInfo.recipientName);

  // Section order inside the card: customer/specs -> layout -> pricing -> shipping -> cost.
  const columnX = async (id, label) => (await rowFor(id).locator(`td[data-label="${label}"]`).boundingBox()).x;
  const order0 = ORDERS[0].id;
  const columns = [
    await columnX(order0, 'Customer'),
    await columnX(order0, 'Specs'),
    await columnX(order0, 'Bracelet Layout'),
    await columnX(order0, 'Pricing'),
    await columnX(order0, 'Shipping Information'),
    await columnX(order0, 'Cost')
  ];
  expect(columns).toEqual([...columns].sort((a, b) => a - b));

  // The copy button copies this order's own label.
  await rowFor(ORDERS[0].id).locator('.order-copy-shipping-label').click();
  await rowFor(ORDERS[1].id).locator('.order-copy-shipping-label').click();
  // Copying must never open the order detail modal.
  await expect(page.locator('#orderDetailModal')).not.toHaveClass(/show/);
  const copied = await page.evaluate(() => window.__copiedLabels);
  expect(copied).toHaveLength(2);
  for (const [index, order] of ORDERS.entries()) {
    const lines = copied[index].split('\n');
    expect(lines[0]).toBe(order.shippingInfo.recipientName);
    expect(lines[1]).toBe(`${order.shippingInfo.addressLine} ${order.shippingInfo.province} ${order.shippingInfo.postalCode}`);
    expect(lines[2]).toBe(order.shippingInfo.phoneNumber);
  }
  expect(copied[0]).not.toBe(copied[1]);

  // View Detail keeps working and shows the same values.
  await rowFor(ORDERS[0].id).locator('.btn-order-detail').click();
  const modal = page.locator('#orderDetailModal');
  await modalOpen(page, '#orderDetailModal');
  const modalText = await modal.innerText();
  expect(modalText).toContain(ORDERS[0].shippingInfo.recipientName);
  expect(modalText).toContain(ORDERS[0].shippingInfo.postalCode);
  await page.locator('#btnOrderDetailModalClose').click();
  await modalClosed(page, '#orderDetailModal');

  // Mobile: the card stacks the shipping cell and the table never overflows the viewport.
  // A list payload published without the shipping fields (an older backend revision) is still
  // completed from the order detail endpoint, so the card never shows an empty address block.
  await page.route('**/api/crm/orders?*', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const orders = (body.orders || []).map(({ shippingInfo, ...rest }) => rest);
    await route.fulfill({ response, json: { ...body, orders } });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('[data-tab="orders"]:visible').click();
  await expect(page.locator('#ordersTableBody .btn-order-detail').first()).toBeVisible({ timeout: 20000 });
  const fallbackRow = rowFor(ORDERS[1].id);
  await expect.poll(async () => (await fallbackRow.innerText())).toContain(ORDERS[1].shippingInfo.recipientName);
  const fallbackText = await fallbackRow.innerText();
  expect(fallbackText).toContain(ORDERS[1].shippingInfo.addressLine);
  expect(fallbackText).toContain(ORDERS[1].shippingInfo.postalCode);
  expect(fallbackText).toContain(ORDERS[1].shippingInfo.phoneNumber);
  expect(fallbackText).not.toContain(ORDERS[0].shippingInfo.recipientName);
  await page.evaluate(() => { window.__copiedLabels = []; });
  await fallbackRow.locator('.order-copy-shipping-label').click();
  const fallbackCopied = await page.evaluate(() => window.__copiedLabels);
  expect(fallbackCopied).toEqual([buildFallbackLabel(ORDERS[1].shippingInfo)]);
  await page.unroute('**/api/crm/orders?*');

  // Mobile: the card stacks the shipping cell and the table never overflows the viewport.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('[data-tab="orders"]:visible').click();
  await expect(page.locator('#ordersTableBody .btn-order-detail').first()).toBeVisible({ timeout: 20000 });
  const mobileRow = rowFor(ORDERS[0].id);
  const shippingCell = mobileRow.locator('td[data-label="Shipping Information"]');
  expect(await shippingCell.count()).toBe(1);
  // The stacked card layout turns the cell into a column and its label comes from the data-label
  // pseudo element, which innerText does not expose.
  expect(await shippingCell.evaluate((cell) => getComputedStyle(cell).flexDirection)).toBe('column');
  expect((await mobileRow.innerText())).toContain(ORDERS[0].shippingInfo.postalCode);
  expect(await mobileRow.locator('.order-copy-shipping-label').count()).toBe(1);
  expect(await mobileRow.locator('.order-shipping-label-block').count()).toBe(1);
  // The retained block still carries recipient, address (province + postal code) and phone.
  const mobileBlockText = await mobileRow.locator('.order-shipping-label-text').innerText();
  expect(mobileBlockText.split('\n')[0]).toBe(ORDERS[0].shippingInfo.recipientName);
  expect(mobileBlockText).toContain(ORDERS[0].shippingInfo.addressLine);
  expect(mobileBlockText).toContain(ORDERS[0].shippingInfo.province);
  expect(mobileBlockText).toContain(ORDERS[0].shippingInfo.postalCode);
  expect(mobileBlockText).toContain(ORDERS[0].shippingInfo.phoneNumber);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  expect(runtimeErrors).toEqual([]);
});
