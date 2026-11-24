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
      const file = path.join(ROOT, pathname === '/' ? 'index.html' : pathname.replace(/^\//, ''));
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

const tab = 'ttttttttttttttttttttttttttttttttttttttttttt';
const session = 'sssssssssssssssssssssssssssssssssssssssssss';

test('auth-entry return restores the verified snapshot directly into Step 2 without replaying Landing', async () => {
  const { server, port } = await serve();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    const requests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => requests.push(request.url()));
    await page.addInitScript(({ tabId, sessionId }) => {
      localStorage.setItem('lucky_colorstone_customize_login_intent', JSON.stringify({ ts: Date.now(), step: 1, targetStep: 2 }));
      sessionStorage.setItem('lucky_prod_line_auth_entry_pending', JSON.stringify({
        version: 1,
        tabSessionId: tabId,
        sessionId,
        expiresAt: Date.now() + 600000
      }));
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
    }, { tabId: tab, sessionId: session });
    await page.route('https://static.line-scdn.net/**', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    await page.route('https://customize.luckycolorstone.com/**', (route) => route.abort());
    await page.route('https://liff.line.me/**', (route) => route.abort());
    await page.route('**/api/**', async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      let body = {};
      if (pathname === '/api/liff-config') body = { environment: 'production', liffId: '2010525799-qImIuhla' };
      else if (pathname === '/api/settings') body = { globalDiscountPercent: 20, discountEnabled: true, landingBraceletCount: 1412, catalogCategories: [], lumiEnabled: false, catalogLayoutOrder: {} };
      else if (pathname === '/api/stones') body = [{ id: 'test-stone', name: 'Test Stone', nameTh: 'หินทดสอบ', p4: 100, p6: 150, p10: 250, category: 'love', image: '/assets/golden_rutile.png', sizes: [4, 6, 10], inStock: true, stockQty: 99 }];
      else if (pathname === '/api/charms' || pathname === '/api/spacers') body = [];
      else if (pathname === '/api/auth-entry/sessions/pending') body = { ok: true, pending: true, sessionId: session, tabSessionId: tab, expiresAt: new Date(Date.now() + 600000).toISOString() };
      else if (pathname === '/api/line-auth-consume') body = {
        ok: true,
        targetStep: 2,
        snapshot: { version: 1, design: { wristSize: 16, beadSize: '6', mixedPlacingSize: 6, selectedCharmIds: [], components: [{ type: 'stone', id: 'test-stone', size: 6 }] } },
        analyticsContinuity: { visitorId: 'v-test', sessionId: 's-test' }
      };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#stepView2.active', { timeout: 15000 });
    const result = await page.evaluate(() => ({
      step2: document.getElementById('stepView2')?.classList.contains('active') || false,
      landing: document.getElementById('landingView')?.classList.contains('active') || false,
      wrist: document.getElementById('wristSizeValue')?.textContent || '',
      pending: sessionStorage.getItem('lucky_prod_line_auth_entry_pending') || '',
      bead6: document.querySelector('.bead-size-card[data-bead-size="6"]')?.classList.contains('active') || false
    }));
    assert.equal(result.step2, true);
    assert.equal(result.landing, false);
    assert.equal(result.pending, '');
    assert.equal(result.bead6, true);
    assert.equal(errors.length, 0, errors.join(' | '));
    assert.equal(requests.some((url) => url.includes('idToken') || url.includes('id_token')), false);
  } finally {
    await browser.close();
    server.close();
  }
});


test('refresh after a successful auth-entry restore keeps the customer on Step 2', async () => {
  const { server, port } = await serve();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    let consumed = false;
    await page.addInitScript(({ tabId, sessionId }) => {
      localStorage.setItem('lucky_colorstone_customize_login_intent', JSON.stringify({ ts: Date.now(), step: 1, targetStep: 2 }));
      sessionStorage.setItem('lucky_prod_line_auth_entry_pending', JSON.stringify({
        version: 1,
        tabSessionId: tabId,
        sessionId,
        expiresAt: Date.now() + 600000
      }));
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
    }, { tabId: tab, sessionId: session });
    await page.route('https://static.line-scdn.net/**', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    await page.route('https://customize.luckycolorstone.com/**', (route) => route.abort());
    await page.route('https://liff.line.me/**', (route) => route.abort());
    await page.route('**/api/**', async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      let body = {};
      if (pathname === '/api/liff-config') body = { environment: 'production', liffId: '2010525799-qImIuhla' };
      else if (pathname === '/api/settings') body = { globalDiscountPercent: 20, discountEnabled: true, landingBraceletCount: 1412, catalogCategories: [], lumiEnabled: false, catalogLayoutOrder: {} };
      else if (pathname === '/api/stones' || pathname === '/api/charms' || pathname === '/api/spacers') body = [];
      else if (pathname === '/api/auth-entry/sessions/pending') body = consumed
        ? { ok: true, pending: false }
        : { ok: true, pending: true, sessionId: session, tabSessionId: tab, expiresAt: new Date(Date.now() + 600000).toISOString() };
      else if (pathname === '/api/line-auth-consume') {
        consumed = true;
        body = {
          ok: true,
          targetStep: 2,
          snapshot: { version: 1, design: { wristSize: 16, beadSize: '6', mixedPlacingSize: 6, selectedCharmIds: [], components: [{ type: 'stone', id: 'test-stone', size: 6 }] } },
          analyticsContinuity: { visitorId: 'v-test', sessionId: 's-test' }
        };
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#stepView2.active', { timeout: 15000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#stepView2.active', { timeout: 15000 });
    const result = await page.evaluate(() => ({
      step2: document.getElementById('stepView2')?.classList.contains('active') || false,
      landing: document.getElementById('landingView')?.classList.contains('active') || false
    }));
    assert.equal(result.step2, true);
    assert.equal(result.landing, false);
  } finally {
    await browser.close();
    server.close();
  }
});
