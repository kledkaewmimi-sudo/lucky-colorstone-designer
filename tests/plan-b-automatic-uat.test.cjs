'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('D:/Projects/lucky-colorstone-uat/node_modules/playwright');

const ROOT = path.join(__dirname, '../frontend');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      const file = path.join(ROOT, pathname === '/' ? 'index.html' : pathname.replace(/^\//, ''));
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.statusCode = 404; res.end('not found'); return;
      }
      res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
      res.end(fs.readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const IPHONE_INSTAGRAM = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_6_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 456.0.0.36.62 (iPhone18,2; iOS 26_6_2; th_TH; th; scale=3.00; 1320x2868; IABMV/1) Safari/604.1';

async function openApp(browser, port, userAgent, { handoffStatus = 201, loggedIn = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, userAgent });
  await page.addInitScript((isLoggedIn) => {
    window.liff = {
      init: async () => {}, isInClient: () => false, isLoggedIn: () => isLoggedIn,
      getProfile: async () => (isLoggedIn ? { userId: 'U_TEST', displayName: 'Tester' } : {}),
      getIDToken: async () => (isLoggedIn ? 'header.payload.signature' : ''),
      getFriendship: async () => ({ friendFlag: true }), login: () => {}, logout: () => {}
    };
  }, loggedIn);
  await page.route('https://static.line-scdn.net/**', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  await page.route('https://liff.line.me/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<html>LINE</html>' }));
  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/auth-handoffs') {
      const body = handoffStatus === 201 ? { token: 'a'.repeat(43) } : { ok: false };
      await route.fulfill({ status: handoffStatus, contentType: 'application/json', body: JSON.stringify(body) });
      return;
    }
    let body = {};
    if (pathname === '/api/liff-config') body = { environment: 'production', liffId: '2010525799-qImIuhla' };
    else if (pathname === '/api/settings') body = { globalDiscountPercent: 20, discountEnabled: true, catalogCategories: [], lumiEnabled: false, catalogLayoutOrder: {} };
    else if (pathname === '/api/stones' || pathname === '/api/charms' || pathname === '/api/spacers') body = [];
    else if (pathname === '/api/auth-entry/sessions/pending') body = { ok: true, pending: false };
    else if (pathname === '/api/line-auth-entry') body = { sessionId: 'b'.repeat(43), expiresAt: new Date(Date.now() + 600000).toISOString() };
    else if (pathname === '/api/line-id-token/verify') body = { verified: true };
    else if (pathname === '/api/line-auth-consume') body = { ok: true, snapshot: { design: { wristSize: 16, beadSize: '6', mixedPlacingSize: 6, selectedCharmIds: [], components: [] } } };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
  if (userAgent.includes('Instagram')) {
    await page.evaluate(() => { const screen = document.getElementById('instagramHandoffScreen'); if (screen) screen.hidden = true; document.getElementById('btnLandingLogin')?.click(); });
    await page.waitForSelector('#stepView1.active', { state: 'attached', timeout: 15000 });
  } else {
    await page.click('#btnLandingLogin', { force: true });
    await page.waitForSelector('#stepView1.active', { timeout: 15000 });
  }
  return page;
}

test('Step 1 Next starts automatic Plan A auth-entry without a manual login button', async () => {
  const { server, port } = await serve();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await openApp(browser, port, IPHONE_SAFARI);
    const requestPromise = page.waitForRequest((request) => new URL(request.url()).pathname === '/api/line-auth-entry', { timeout: 15000 });
    await page.evaluate(() => document.getElementById('btnNext')?.click());
    const request = await requestPromise;
    assert.equal(request.method(), 'POST');
    assert.equal(await page.locator('#btnStep1LineConnect').isVisible(), false);
  } finally { await browser.close(); server.close(); }
});

test('Instagram IAB starts automatic Plan B and never exposes a manual login button', async () => {
  const { server, port } = await serve();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await openApp(browser, port, IPHONE_INSTAGRAM, { handoffStatus: 503 });
    const lineNavigation = page.waitForRequest((request) => request.url().startsWith('https://liff.line.me/'), { timeout: 15000 });
    await page.evaluate(() => document.getElementById('btnNext')?.click());
    await lineNavigation;
    assert.equal(await page.locator('#btnStep1LineConnect').count(), 0);
  } finally { await browser.close(); server.close(); }
});

test('completed authentication returns to Step 2 after backward navigation without a second handoff', async () => {
  const { server, port } = await serve();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await openApp(browser, port, IPHONE_SAFARI, { loggedIn: true });
    let authEntryCalls = 0;
    page.on('request', (request) => { if (new URL(request.url()).pathname === '/api/line-auth-entry') authEntryCalls += 1; });
    await page.evaluate(() => { sessionStorage.setItem('lucky_prod_line_auth_attempt_state', JSON.stringify({ status: 'completed', attemptId: 'A'.repeat(43), updatedAt: Date.now() })); });
    await page.evaluate(() => document.getElementById('btnNext')?.click());
    await page.waitForSelector('#stepView2.active', { timeout: 15000 });
    assert.equal(authEntryCalls, 0);
    assert.equal(await page.locator('#stepView2').isVisible(), true);
  } finally { await browser.close(); server.close(); }
});
