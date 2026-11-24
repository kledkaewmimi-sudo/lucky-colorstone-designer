'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('D:/Projects/lucky-colorstone-uat/node_modules/playwright');

const ROOT = path.join(__dirname, '../frontend');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

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

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const IPHONE_INSTAGRAM = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_6_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 456.0.0.36.62 (iPhone18,2; iOS 26_6_2; th_TH; th; scale=3.00; 1320x2868; IABMV/1) Safari/604.1';

async function openApp(browser, port, userAgent, { handoffStatus = 503 } = {}) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, userAgent });
  await page.addInitScript(() => {
    window.liff = {
      init: async () => {},
      isInClient: () => false,
      isLoggedIn: () => false,
      getProfile: async () => ({}),
      getIDToken: async () => '',
      getFriendship: async () => ({ friendFlag: false }),
      login: () => {},
      logout: () => {}
    };
  });
  await page.route('https://static.line-scdn.net/**', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/auth-handoffs') {
      await route.fulfill({ status: handoffStatus, contentType: 'application/json', body: '{"ok":false}' });
      return;
    }
    let body = {};
    if (pathname === '/api/liff-config') body = { environment: 'production', liffId: '2010525799-qImIuhla' };
    else if (pathname === '/api/settings') body = { globalDiscountPercent: 20, discountEnabled: true, catalogCategories: [], lumiEnabled: false, catalogLayoutOrder: {} };
    else if (pathname === '/api/stones' || pathname === '/api/charms' || pathname === '/api/spacers') body = [];
    else if (pathname === '/api/auth-entry/sessions/pending') body = { ok: true, pending: false };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
  if (userAgent.includes('Instagram')) {
    await page.evaluate(() => {
      const screen = document.getElementById('instagramHandoffScreen');
      if (screen) screen.hidden = true;
      document.getElementById('btnLandingLogin')?.click();
    });
    await page.waitForSelector('#stepView1.active', { state: 'attached', timeout: 15000 });
  } else {
    await page.click('#btnLandingLogin', { force: true });
    await page.waitForSelector('#stepView1.active', { timeout: 15000 });
  }
  return page;
}

test('Plan B manual button is hidden on initial Step 1 and appears only after auto failure', async () => {
  const { server, port } = await serve();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await openApp(browser, port, IPHONE_SAFARI);

    const before = await page.evaluate(() => ({
      statusHidden: document.getElementById('step1AuthStatus')?.hidden,
      actionHidden: document.getElementById('btnStep1LineConnect')?.hidden
    }));
    assert.equal(before.statusHidden, true);
    assert.equal(before.actionHidden, true);

    await page.evaluate(() => document.getElementById('btnNext')?.click());
    await page.waitForSelector('#btnStep1LineConnect:not([hidden])', { timeout: 15000 });
    const after = await page.evaluate(() => ({
      actionText: document.getElementById('btnStep1LineConnect')?.textContent?.trim() || '',
      state: document.getElementById('step1AuthStatus')?.dataset.state || '',
      statusText: document.getElementById('step1AuthStatusText')?.textContent?.trim() || ''
    }));
    assert.equal(after.actionText, 'เข้าสู่ระบบด้วย LINE');
    assert.equal(after.state, 'manual');
    assert.match(after.statusText, /ไม่สามารถเข้าสู่ระบบ LINE/);
  } finally {
    await browser.close();
    server.close();
  }
});

test('Instagram IAB gets an external-browser instruction, not a manual login button', async () => {
  const { server, port } = await serve();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await openApp(browser, port, IPHONE_INSTAGRAM);
    await page.evaluate(() => document.getElementById('btnNext')?.click());
    await page.waitForSelector('#step1AuthStatus:not([hidden])', { timeout: 15000 });
    const result = await page.evaluate(() => ({
      state: document.getElementById('step1AuthStatus')?.dataset.state || '',
      actionHidden: document.getElementById('btnStep1LineConnect')?.hidden,
      text: document.getElementById('step1AuthStatusText')?.textContent?.trim() || ''
    }));
    assert.equal(result.state, 'instagram_external');
    assert.equal(result.actionHidden, true);
    assert.match(result.text, /Safari|Chrome/);
  } finally {
    await browser.close();
    server.close();
  }
});

test('Plan B manual action reuses auth-entry and sends an opaque handoff token', async () => {
  const { server, port } = await serve();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await openApp(browser, port, IPHONE_SAFARI, { handoffStatus: 503 });
    let handoffCalls = 0;
    await page.route('**/api/auth-handoffs', async (route) => {
      handoffCalls += 1;
      if (handoffCalls === 1) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{"ok":false}' });
      } else {
        await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ token: 'a'.repeat(43) }) });
      }
    });
    await page.route('**/api/line-auth-entry', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        sessionId: 'b'.repeat(43),
        expiresAt: new Date(Date.now() + 600000).toISOString()
      }) });
    });
    await page.evaluate(() => document.getElementById('btnNext')?.click());
    await page.waitForSelector('#btnStep1LineConnect:not([hidden])', { timeout: 15000 });
    const requestPromise = page.waitForRequest((request) => new URL(request.url()).pathname === '/api/line-auth-entry');
    await page.evaluate(() => document.getElementById('btnStep1LineConnect')?.click());
    const request = await requestPromise;
    const body = JSON.parse(request.postData() || '{}');
    assert.equal(request.method(), 'POST');
    assert.match(body.handoffToken, /^[A-Za-z0-9_-]{43}$/);
    assert.match(body.tabSessionId, /^[A-Za-z0-9_-]{43}$/);
  } finally {
    await browser.close();
    server.close();
  }
});
