import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { chromium } = require('D:/Projects/lucky-colorstone-uat/node_modules/playwright');
const ROOT = fileURLToPath(new URL('../frontend/', import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};
const TOKEN = 'A'.repeat(43);
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';

async function fixture() {
  const counts = { reads: 0, consumes: 0 };
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    const json = (body, status = 200) => {
      response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(body));
    };
    if (url.pathname === '/api/liff-config') return json({ environment: 'production', liffId: '2010525799-qImIuhla' });
    if (url.pathname === '/api/line-id-token/verify') return json({ verified: true });
    if (url.pathname === `/api/auth-handoffs/${TOKEN}`) {
      counts.reads += 1;
      return json({ payload: { targetStep: 3, designSnapshot: {
        version: 1, step: 3,
        design: { wristSize: 17.5, beadSize: '6', mixedPlacingSize: 6, selectedCharmIds: [], components: [] }
      } } });
    }
    if (url.pathname === `/api/auth-handoffs/${TOKEN}/consume`) {
      counts.consumes += 1;
      return json({ consumed: true });
    }
    if (url.pathname === '/api/auth-entry/sessions/pending') return json({ ok: true, pending: false });
    if (url.pathname === '/api/settings' || url.pathname === '/api/social-proof') return json({});
    if (url.pathname === '/api/stones' || url.pathname === '/api/charms' || url.pathname === '/api/spacers') return json([]);
    if (url.pathname.startsWith('/api/')) return json({});

    const requested = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\//, '');
    const filePath = normalize(join(ROOT, requested));
    if (!filePath.startsWith(normalize(ROOT))) { response.writeHead(403).end(); return; }
    try {
      const file = await readFile(filePath);
      await stat(filePath);
      response.writeHead(200, { 'content-type': MIME[extname(filePath)] || 'application/octet-stream' });
      response.end(file);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { origin: `http://127.0.0.1:${server.address().port}`, counts, close: () => new Promise((resolve) => server.close(resolve)) };
}

async function open(browser, origin, { friendFlag = false } = {}) {
  const context = await browser.newContext({ userAgent: UA, viewport: { width: 390, height: 844 }, isMobile: true, serviceWorkers: 'block' });
  await context.addInitScript((flag) => {
    localStorage.setItem('lucky_colorstone_state', JSON.stringify({
      wristSize: 16,
      beadSize: null,
      currentStep: 1,
      lineUserId: 'U_PROD_OA'
    }));
    window.__prodOaTrace = { loginCalls: 0, initCalls: 0, friendshipCalls: 0 };
    window.liff = {
      init: async () => { window.__prodOaTrace.initCalls += 1; },
      isInClient: () => false,
      isLoggedIn: () => true,
      getContext: () => ({ viewType: 'external' }),
      login: () => { window.__prodOaTrace.loginCalls += 1; },
      getIDToken: async () => 'mock.header.signature',
      getProfile: async () => ({ userId: 'U_PROD_OA', displayName: 'QA' }),
      getFriendship: async () => { window.__prodOaTrace.friendshipCalls += 1; return { friendFlag: flag }; }
    };
  }, friendFlag);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error?.message || error)));
  await page.route('https://static.line-scdn.net/liff/edge/2/sdk.js', (route) => route.fulfill({ contentType: 'text/javascript', body: '// fixture' }));
  await page.goto(`${origin}/?line_oa_handoff=${TOKEN}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const step3 = document.querySelector('#stepView3');
    const step4 = document.querySelector('#stepView4');
    return step3?.classList.contains('active') || step4?.classList.contains('active');
  }, { timeout: 15000 });
  return { context, page, errors };
}

test('Production OA resume restores Step 3 from the server handoff without a repeated LINE login', async () => {
  const server = await fixture();
  const browser = await chromium.launch({ headless: true });
  let pageSetup;
  try {
    pageSetup = await open(browser, server.origin);
    const result = await pageSetup.page.evaluate(() => ({
      step3: document.querySelector('#stepView3')?.classList.contains('active') === true,
      step4: document.querySelector('#stepView4')?.classList.contains('active') === true,
      wrist: document.querySelector('#canvasWristContext')?.textContent || '',
      handoffInUrl: new URLSearchParams(window.location.search).has('line_oa_handoff'),
      ...window.__prodOaTrace
    }));
    assert.equal(result.step3, true, JSON.stringify(result));
    assert.equal(result.step4, false, JSON.stringify(result));
    assert.match(result.wrist, /17\.5/);
    assert.equal(result.handoffInUrl, false, JSON.stringify(result));
    assert.equal(result.loginCalls, 0, JSON.stringify(result));
    assert.equal(result.initCalls, 1, JSON.stringify(result));
    assert.equal(server.counts.consumes, 1, JSON.stringify(server.counts));
    assert.deepEqual(pageSetup.errors, []);
  } finally {
    await pageSetup?.context.close();
    await browser.close();
    await server.close();
  }
});

test('Production existing friend passes the centralized OA gate without opening Add Friend', async () => {
  const app = await readFile(join(ROOT, 'app.js'), 'utf8');
  const start = app.indexOf('async function canEnterOperationalStep4');
  const end = app.indexOf('async function resumeLineOaFriendshipAfterReturn', start);
  const gate = app.slice(start, end);
  assert.match(gate, /if \(friendship\.friendFlag\) \{\s*trackVerifiedLineOaConnection\(\);\s*return true;\s*\}/);
  assert.doesNotMatch(gate, /liff\.login|startLiffLoginForCustomization/);
});
