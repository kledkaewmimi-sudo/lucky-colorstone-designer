'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('D:/Projects/lucky-colorstone-uat/node_modules/playwright');

const ROOT = path.join(__dirname, '../frontend');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      const file = path.join(ROOT, pathname === '/' ? 'crm.html' : pathname.replace(/^\//, ''));
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.statusCode = 404;
        res.end('not found');
        return;
      }
      res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
      res.end(fs.readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const safeOrder = {
  id: 'ORD-SAFE-001',
  adminOrderNumber: 'LC-1001',
  customerName: 'สมชาย ใจดี',
  date: new Date().toISOString(),
  wristSize: 16,
  beadSize: 6,
  totalBeads: 29,
  status: 'Payment Received',
  subtotal: 1500,
  discountPercent: 20,
  discountAmount: 300,
  netPrice: 1200,
  finalPrice: 1200,
  selectedStones: [],
  beads: [{ stoneId: 'test-stone', name: 'Test Stone', nameTh: 'หินทดสอบ', size: 6, color: '#ccc', image: '/assets/golden_rutile.png' }],
  hasCharm: false,
  hasSpacer: false,
  spacerCount: 0,
  shippingInfo: { recipientName: 'สมชาย ใจดี', phoneNumber: '0812345678', addressLine: '123 ถนนทดสอบ', province: 'กรุงเทพมหานคร', postalCode: '10110' }
};

test('CRM normal order renders, preserves Thai text, and exposes the workflow status control', async () => {
  const { server, port } = await serve();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/api/**', async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      let body = {};
      if (pathname === '/api/admin/session') body = { authenticated: true, csrf: '', username: 'admin' };
      else if (pathname === '/api/settings') body = { globalDiscountPercent: 20, discountEnabled: true, showDiscountBanner: true, landingBraceletCount: 1412, catalogCategories: [], lumiEnabled: false, catalogLayoutOrder: {} };
      else if (['/api/stones', '/api/charms', '/api/spacers', '/api/purchases', '/api/purchase-costs', '/api/purchase-costs/stones'].includes(pathname)) body = [];
      else if (pathname === '/api/crm/overview') body = { totalOrders: 1, revenue: 1200, paidOrderCount: 1, averageOrderValue: 1200, activeStones: 0, outOfStock: 0 };
      else if (pathname === '/api/crm/orders') body = { orders: [safeOrder], page: 1, limit: 20, total: 1, hasMore: false };
      else if (pathname === '/api/orders') body = [safeOrder];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto(`http://127.0.0.1:${port}/crm.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    await page.click('#btnTabOrders');
    await page.waitForTimeout(800);
    const result = await page.evaluate(() => {
      const body = document.getElementById('ordersTableBody');
      const select = body?.querySelector('.status-dropdown');
      return {
        text: body?.innerText || '',
        selectId: select?.getAttribute('data-id') || '',
        selectValue: select?.value || '',
        detailButton: Boolean(body?.querySelector('.btn-order-detail[data-id="ORD-SAFE-001"]')),
        thai: body?.innerText.includes('สมชาย ใจดี') || false
      };
    });
    assert.match(result.text, /ORD-SAFE-001/);
    assert.match(result.text, /LC-1001/);
    assert.equal(result.thai, true);
    assert.equal(result.selectId, 'ORD-SAFE-001');
    assert.equal(result.selectValue, 'Payment Received');
    assert.equal(result.detailButton, true);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});
