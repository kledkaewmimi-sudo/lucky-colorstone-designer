'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('D:/Projects/lucky-colorstone-uat/node_modules/playwright');

const ROOT = path.join(__dirname, '../frontend');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      const file = path.join(ROOT, pathname === '/' ? 'index.html' : pathname.replace(/^\//, ''));
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.statusCode = 404;
        res.end('not found');
        return;
      }
      res.setHeader('Content-Security-Policy-Report-Only', "default-src 'self'; script-src 'self' 'unsafe-inline' https://static.line-scdn.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https:");
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
      res.end(fs.readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const stone = {
  id: 'test-stone',
  name: 'Test Stone',
  nameTh: 'หินทดสอบ',
  p4: 100,
  p6: 150,
  p10: 250,
  category: 'love',
  categoryId: 'love',
  image: '/assets/golden_rutile.png',
  sizes: [4, 6, 10],
  inStock: true,
  stockQty: 99,
  availability: { isActive: true, inStock: true, stockQty: 99 }
};

function apiBody(pathname) {
  if (pathname === '/api/liff-config') return { environment: 'production', liffId: '2010525799-qImIuhla' };
  if (pathname === '/api/settings') return { globalDiscountPercent: 20, discountEnabled: true, showDiscountBanner: true, landingBraceletCount: 1412, catalogCategories: [], lumiEnabled: false, catalogLayoutOrder: {} };
  if (pathname === '/api/stones') return [stone];
  if (pathname === '/api/charms') return [{ id: 'test-charm', name: { th: 'เครื่องรางทดสอบ', en: 'Test Charm' }, sku: 'CHARM-TEST', type: 'charm', pricing: { base: 100 }, business: { sizeCm: 1.5, footprintMm: 15, threadingOccupancyMm: 15 }, availability: { inStock: true, isActive: true, stockQty: 5 }, image: { primary: '/assets/charms/pixiu/px01.webp' } }];
  if (pathname === '/api/spacers') return [{ id: 'test-spacer', name: { th: 'ชาร์มทดสอบ', en: 'Test Spacer' }, sku: 'SPACER-TEST', type: 'flat-spacer', pricing: { base: 50 }, business: { displaySizeMm: 9, effectiveLengthMm: 9, sizeMm: 9 }, availability: { inStock: true, isActive: true, stockQty: 5 }, image: { primary: '/assets/spacers/diamond-ball-orange-9mm.png' } }];
  if (pathname === '/api/social-proof') return { count: 1412, previews: [] };
  if (pathname === '/api/auth-entry/sessions/pending') return { ok: true, pending: false };
  if (pathname === '/api/line-id-token/verify') return { verified: true };
  if (pathname === '/api/auth-handoffs') return { token: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' };
  if (pathname === '/api/line-auth-entry') return { sessionId: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', expiresAt: new Date(Date.now() + 600000).toISOString() };
  if (pathname === '/api/line-auth-consume') return { ok: true, targetStep: 2, snapshot: { design: { wristSize: 16, beadSize: '6', mixedPlacingSize: 6, selectedCharmIds: [], components: [] } } };
  if (pathname === '/api/stripe/checkout-session') return { url: 'https://checkout.test/session' };
  if (pathname === '/api/orders') return [];
  return {};
}

test('production candidate customer journey smoke: Landing -> Step 1 -> Step 2 -> Step 3 -> Step 4', async () => {
  const { server, port } = await serve();
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
      viewport: { width: 390, height: 844 }
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      window.liff = {
        init: async () => {},
        isInClient: () => false,
        isLoggedIn: () => true,
        getProfile: async () => ({ userId: 'U_TEST_CANDIDATE', displayName: 'Candidate Tester' }),
        getIDToken: async () => 'header.payload.signature',
        getFriendship: async () => ({ friendFlag: true }),
        login: () => {},
        logout: () => {}
      };
    });
    await page.route('https://static.line-scdn.net/**', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    await page.route('https://customize.luckycolorstone.com/**', (route) => route.abort());
    await page.route('https://lucky-colorstone-designer.onrender.com/**', (route) => route.abort());
    await page.route('https://checkout.test/**', (route) => route.abort());
    await page.route('**/api/**', async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(apiBody(pathname)) });
    });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#landingView', { state: 'visible', timeout: 15000 });
    assert.equal(await page.locator('#landingView').isVisible(), true);
    assert.equal(await page.locator('#landingHeroCarousel').count(), 1);

    await page.locator('#btnLandingLogin').click({ force: true });
    await page.waitForSelector('#stepView1.active', { timeout: 15000 });
    assert.equal(await page.locator('#wristWheelDisplay').count(), 1);
    assert.equal(await page.locator('#btnNext').isEnabled(), true);

    await page.locator('#btnNext').click();
    await page.waitForSelector('#stepView2.active', { timeout: 15000 });
    assert.equal(await page.locator('#beadSizeOptionsList .bead-size-card').count(), 4);

    await page.locator('.bead-size-card[data-bead-size="6"]').click();
    await page.locator('#btnNext').click();
    await page.waitForSelector('#stepView3.active', { timeout: 15000 });
    await page.waitForSelector('.stone-card[data-stone-id]', { timeout: 15000 });
    assert.ok(await page.locator('.stone-card[data-stone-id]').count() >= 1);

    await page.locator('[data-catalog-section="charms"]').click();
    await page.waitForSelector('.charm-component-section [data-charm-id="test-charm"]', { timeout: 10000 });
    await page.locator('.charm-component-section [data-charm-id="test-charm"] .stone-add-btn').click({ force: true });
    await page.locator('[data-catalog-section="spacer"]').click();
    await page.waitForSelector('.spacer-component-section [data-spacer-id="test-spacer"]', { timeout: 10000 });
    await page.locator('.spacer-component-section [data-spacer-id="test-spacer"] .stone-add-btn').click({ force: true });
    await page.locator('[data-catalog-section="stones"]').click();
    const firstCard = page.locator('.stone-card[data-stone-id]').first();
    for (let i = 0; i < 30; i += 1) {
      await firstCard.locator('.stone-add-btn').click({ force: true });
    }
    await page.waitForTimeout(500);
    await page.locator('#btnNext').click();
    await page.waitForSelector('#stepView4.active', { timeout: 15000 });

    assert.equal(await page.locator('#priceSubtotal').count(), 1);
    assert.equal(await page.locator('#priceTotal').count(), 1);
    assert.equal(await page.locator('#summaryTitleText').count(), 1);
    assert.equal(await page.locator('#shippingRecipientName').count(), 1);
    assert.equal(await page.locator('#billingItemsList').count(), 1);
    const subtotalText = await page.locator('#priceSubtotal').textContent();
    const totalText = await page.locator('#priceTotal').textContent();
    const subtotal = Number(subtotalText.replace(/[^0-9]/g, ''));
    const total = Number(totalText.replace(/[^0-9]/g, ''));
    assert.ok(subtotal > 0, `subtotal was ${subtotalText}`);
    assert.ok(total > 0 && total <= subtotal, `total ${totalText} subtotal ${subtotalText}`);

    await page.locator('#shippingRecipientName').fill('ทดสอบ ผู้รับ');
    await page.locator('#shippingPhoneNumber').fill('0812345678');
    await page.locator('#shippingAddressLine').fill('123 ถนนทดสอบ');
    await page.locator('#shippingProvince').fill('กรุงเทพมหานคร');
    await page.locator('#shippingPostalCode').fill('10110');
    const checkoutRequest = page.waitForRequest((request) => request.url().includes('/api/stripe/checkout-session') && request.method() === 'POST', { timeout: 20000 });
    await page.locator('#btnNext').click();
    const request = await checkoutRequest;
    const payload = request.postDataJSON();
    assert.equal(payload.order.recipientName, 'ทดสอบ ผู้รับ');
    assert.ok(payload.order.beads.length > 0);
    assert.ok(payload.order.netPrice > 0);
    assert.equal(typeof payload.checkoutAttemptId, 'string');

    assert.equal(errors.length, 0, `page errors: ${errors.join(' | ')}`);
  } finally {
    await browser.close();
    server.close();
  }
});
