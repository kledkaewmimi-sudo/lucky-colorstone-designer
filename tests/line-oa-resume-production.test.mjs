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
const INTENT_TOKEN = 'C'.repeat(43);
const SNAPSHOT_COMPONENTS = Array.from({ length: 29 }, (_, i) => ({ componentType: 'stone', stoneId: 'stone1', size: 6, uniqueId: i + 1 }));
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';

async function fixture({ pendingAuth = false } = {}) {
  const counts = { reads: 0, consumes: 0, posts: 0, handoffBodies: [] };
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    const json = (body, status = 200) => {
      response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(body));
    };
    if (url.pathname === '/api/auth-handoffs' && request.method === 'POST') {
      let body = '';
      for await (const chunk of request) body += chunk;
      counts.posts += 1;
      counts.handoffBodies.push(JSON.parse(body || '{}'));
      return json({ token: TOKEN, expiresAt: Date.now() + 600000 }, 201);
    }
    if (url.pathname === '/api/liff-config') return json({ environment: 'production', liffId: '2010525799-qImIuhla' });
    if (url.pathname === '/api/line-id-token/verify') return json({ verified: true });
    if (url.pathname === `/api/auth-handoffs/${TOKEN}`) {
      counts.reads += 1;
      return json({ payload: { targetStep: 3, designSnapshot: {
        version: 1, step: 3,
        design: { wristSize: 17.5, beadSize: '6', mixedPlacingSize: 6, selectedCharmIds: [], components: SNAPSHOT_COMPONENTS }
      } } });
    }
    if (url.pathname === `/api/auth-handoffs/${TOKEN}/consume`) {
      counts.consumes += 1;
      return json({ ok: true, payload: { targetStep: 3, designSnapshot: {
        version: 1, step: 3,
        design: { wristSize: 17.5, beadSize: '6', mixedPlacingSize: 6, selectedCharmIds: [], components: SNAPSHOT_COMPONENTS }
      } } });
    }
    if (url.pathname === '/api/auth-entry/sessions/pending') return json(pendingAuth ? { ok: true, pending: true, sessionId: 'F'.repeat(43), tabSessionId: 'G'.repeat(43), expiresAt: new Date(Date.now() + 600000).toISOString() } : { ok: true, pending: false });
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

async function open(browser, origin, { friendFlag = false, search = `?line_oa_handoff=${TOKEN}` } = {}) {
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
  await page.goto(`${origin}/${search}`, { waitUntil: 'domcontentloaded' });
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
    assert.equal(server.counts.reads, 0, JSON.stringify(server.counts));
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

test('Production OA handoff is not converted to Step 1 by the startup auth recovery timeout', async () => {
  const server = await fixture();
  const browser = await chromium.launch({ headless: true });
  let context;
  try {
    context = await browser.newContext({ userAgent: UA, viewport: { width: 390, height: 844 }, isMobile: true, serviceWorkers: 'block' });
    await context.addInitScript((token) => {
      localStorage.setItem('lucky_colorstone_state', JSON.stringify({
        wristSize: 16,
        beadSize: null,
        currentStep: 1,
        lineUserId: ''
      }));
      sessionStorage.setItem('lucky_prod_line_auth_entry_pending', JSON.stringify({
        version: 1,
        tabSessionId: 'D'.repeat(43),
        sessionId: 'E'.repeat(43),
        expiresAt: Date.now() + 600000
      }));
      window.__prodOaTimerTrace = { loginCalls: 0 };
      window.liff = {
        init: async () => {},
        isInClient: () => false,
        isLoggedIn: () => false,
        getContext: () => ({ viewType: 'external' }),
        login: () => { window.__prodOaTimerTrace.loginCalls += 1; },
        getIDToken: async () => 'mock.header.signature',
        getProfile: async () => ({ userId: 'U_PROD_OA', displayName: 'QA' }),
        getFriendship: async () => ({ friendFlag: false })
      };
    }, TOKEN);
    const page = await context.newPage();
    await page.route('https://static.line-scdn.net/liff/edge/2/sdk.js', (route) => route.fulfill({ contentType: 'text/javascript', body: '// fixture' }));
    await page.goto(`${server.origin}/?line_oa_handoff=${TOKEN}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(21500);
    const result = await page.evaluate(() => ({
      step3: document.querySelector('#stepView3')?.classList.contains('active') === true,
      step1: document.querySelector('#stepView1')?.classList.contains('active') === true,
      wrist: document.querySelector('#canvasWristContext')?.textContent || '',
      loginCalls: window.__prodOaTimerTrace.loginCalls
    }));
    assert.equal(result.step3, true, JSON.stringify(result));
    assert.equal(result.step1, false, JSON.stringify(result));
    assert.match(result.wrist, /17\.5/);
    assert.equal(result.loginCalls, 0, JSON.stringify(result));
  } finally {
    await context?.close();
    await browser.close();
    await server.close();
  }
});

test('Production OA handoff takes precedence over a stale auth-entry return', async () => {
  const server = await fixture({ pendingAuth: true });
  const browser = await chromium.launch({ headless: true });
  let context;
  try {
    context = await browser.newContext({ userAgent: UA, viewport: { width: 390, height: 844 }, isMobile: true, serviceWorkers: 'block' });
    await context.addInitScript(() => {
      localStorage.setItem('lucky_colorstone_state', JSON.stringify({ wristSize: 16, beadSize: null, currentStep: 1, lineUserId: 'U_PROD_OA' }));
      window.liff = {
        init: async () => {},
        isInClient: () => false,
        isLoggedIn: () => true,
        getContext: () => ({ viewType: 'external' }),
        login: () => {},
        getIDToken: async () => 'mock.header.signature',
        getProfile: async () => ({ userId: 'U_PROD_OA', displayName: 'QA' }),
        getFriendship: async () => ({ friendFlag: false })
      };
    });
    const page = await context.newPage();
    await page.route('https://static.line-scdn.net/liff/edge/2/sdk.js', (route) => route.fulfill({ contentType: 'text/javascript', body: '// fixture' }));
    await page.goto(`${server.origin}/?line_oa_handoff=${TOKEN}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    const result = await page.evaluate(() => ({
      step3: document.querySelector('#stepView3')?.classList.contains('active') === true,
      step1: document.querySelector('#stepView1')?.classList.contains('active') === true,
      wrist: document.querySelector('#canvasWristContext')?.textContent || ''
    }));
    assert.equal(result.step3, true, JSON.stringify(result));
    assert.equal(result.step1, false, JSON.stringify(result));
    assert.match(result.wrist, /17\.5/);
  } finally {
    await context?.close();
    await browser.close();
    await server.close();
  }
});

test('Production Step 3 external OA flow creates a targetStep 3 handoff and carries its token into LIFF', async () => {
  const server = await fixture();
  const browser = await chromium.launch({ headless: true });
  let context;
  try {
    context = await browser.newContext({ userAgent: UA, viewport: { width: 390, height: 844 }, isMobile: true, serviceWorkers: 'block' });
    await context.addInitScript(({ components, intentToken }) => {
      localStorage.setItem('lucky_colorstone_state', JSON.stringify({
        wristSize: 17.5, beadSize: '6', currentStep: 3, lineUserId: 'U_PROD_OA', selectedStones: components
      }));
      localStorage.setItem('lucky_colorstone_customize_login_intent', JSON.stringify({
        version: 2, ts: Date.now(), step: 3, targetStep: 4,
        handoffToken: intentToken, mode: 'guest_design_handoff'
      }));
      window.liff = {
        init: async () => {}, isInClient: () => false, isLoggedIn: () => true,
        getContext: () => ({ viewType: 'external' }), login: () => {},
        getIDToken: async () => 'mock.header.signature',
        getProfile: async () => ({ userId: 'U_PROD_OA', displayName: 'QA' }),
        getFriendship: async () => ({ friendFlag: false })
      };
    }, { components: Array.from({ length: 29 }, (_, i) => ({ componentType: 'stone', stoneId: 'stone1', size: 6, uniqueId: i + 1 })), intentToken: INTENT_TOKEN });
    const page = await context.newPage();
    await page.route('https://static.line-scdn.net/liff/edge/2/sdk.js', (route) => route.fulfill({ contentType: 'text/javascript', body: '// fixture' }));
    await page.route('https://liff.line.me/**', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body>LIFF</body></html>' }));
    await page.goto(`${server.origin}/`, { waitUntil: 'domcontentloaded' });
    const liffRequest = await page.waitForRequest((request) => request.url().includes('liff.line.me'), { timeout: 10000 });
    assert.equal(server.counts.posts, 1);
    assert.equal(server.counts.handoffBodies[0].targetStep, 3);
    assert.ok(server.counts.handoffBodies[0].designSnapshot);
    assert.match(liffRequest.url(), new RegExp(`line_oa_handoff=${TOKEN}`));
    assert.match(liffRequest.url(), new RegExp(`liff\\.state=.*line_oa_handoff`));
  } finally {
    await context?.close();
    await browser.close();
    await server.close();
  }
});

test('Production OA token is recovered from a nested liff.state callback', async () => {
  const server = await fixture();
  const browser = await chromium.launch({ headless: true });
  let setup;
  try {
    setup = await open(browser, server.origin, { search: `?liff.state=${encodeURIComponent(`?line_oa_handoff=${TOKEN}`)}` });
    const result = await setup.page.evaluate(() => ({
      step3: document.querySelector('#stepView3')?.classList.contains('active') === true,
      step1: document.querySelector('#stepView1')?.classList.contains('active') === true,
      wrist: document.querySelector('#canvasWristContext')?.textContent || ''
    }));
    assert.equal(result.step3, true, JSON.stringify(result));
    assert.equal(result.step1, false, JSON.stringify(result));
    assert.match(result.wrist, /17\.5/);
  } finally {
    await setup?.context.close();
    await browser.close();
    await server.close();
  }
});

test('Production existing OA friend goes directly to Step 4', async () => {
  const app = await readFile(join(ROOT, 'app.js'), 'utf8');
  const start = app.indexOf('async function canEnterOperationalStep4');
  const end = app.indexOf('async function resumeLineOaFriendshipAfterReturn', start);
  const gate = app.slice(start, end);
  assert.match(gate, /if \(friendship\.friendFlag\) \{\s*trackVerifiedLineOaConnection\(\);\s*return true;\s*\}/);
  assert.doesNotMatch(gate, /liff\.login|startLiffLoginForCustomization/);
});

test('Production cancelled OA friendship remains on Step 3 with the design and no Login', async () => {
  const server = await fixture();
  const browser = await chromium.launch({ headless: true });
  let setup;
  try {
    setup = await open(browser, server.origin);
    const result = await setup.page.evaluate(() => ({
      step3: document.querySelector('#stepView3')?.classList.contains('active') === true,
      step4: document.querySelector('#stepView4')?.classList.contains('active') === true,
      wrist: document.querySelector('#canvasWristContext')?.textContent || '',
      loginCalls: window.__prodOaTrace.loginCalls
    }));
    assert.equal(result.step3, true, JSON.stringify(result));
    assert.equal(result.step4, false, JSON.stringify(result));
    assert.match(result.wrist, /17\.5/);
    assert.equal(result.loginCalls, 0, JSON.stringify(result));
  } finally {
    await setup?.context.close();
    await browser.close();
    await server.close();
  }
});

test('Production malformed OA token does not erase a valid Step 3 design', async () => {
  const server = await fixture();
  const browser = await chromium.launch({ headless: true });
  let context;
  try {
    context = await browser.newContext({ userAgent: UA, viewport: { width: 390, height: 844 }, isMobile: true, serviceWorkers: 'block' });
    await context.addInitScript(() => {
      localStorage.setItem('lucky_colorstone_state', JSON.stringify({
        wristSize: 17.5, beadSize: '6', currentStep: 3, lineUserId: 'U_PROD_OA',
        selectedStones: Array.from({ length: 29 }, (_, i) => ({ componentType: 'stone', stoneId: 'stone1', size: 6, uniqueId: i + 1 }))
      }));
      window.liff = {
        init: async () => {}, isInClient: () => false, isLoggedIn: () => true,
        getContext: () => ({ viewType: 'external' }), login: () => {},
        getIDToken: async () => 'mock.header.signature',
        getProfile: async () => ({ userId: 'U_PROD_OA' }),
        getFriendship: async () => ({ friendFlag: false })
      };
    });
    const page = await context.newPage();
    await page.route('https://static.line-scdn.net/liff/edge/2/sdk.js', (route) => route.fulfill({ contentType: 'text/javascript', body: '// fixture' }));
    await page.goto(`${server.origin}/?line_oa_handoff=malformed`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const result = await page.evaluate(() => ({
      step3: document.querySelector('#stepView3')?.classList.contains('active') === true,
      landing: document.querySelector('#landingView')?.style.display || '',
      wrist: document.querySelector('#canvasWristContext')?.textContent || ''
    }));
    assert.equal(result.step3, true, JSON.stringify(result));
    assert.notEqual(result.landing, 'flex', JSON.stringify(result));
    assert.match(result.wrist, /17\.5/);
  } finally {
    await context?.close();
    await browser.close();
    await server.close();
  }
});

test('Production OA friendship code never calls liff.login or liff.logout', async () => {
  const app = await readFile(join(ROOT, 'app.js'), 'utf8');
  const start = app.indexOf('function getLineOaHandoffToken');
  const end = app.indexOf('function requiresLineOaFriendshipForOperationalStep4');
  const oa = app.slice(start, end + 500);
  assert.doesNotMatch(oa, /liff\.login\s*\(/);
  assert.doesNotMatch(oa, /liff\.logout\s*\(/);
  assert.match(oa, /liff\.requestFriendship\s*\(/);
  assert.match(oa, /goToStep\(4\)/);
});

test('Production external OA flow never enters LIFF without a valid server handoff token', async () => {
  const app = await readFile(join(ROOT, 'app.js'), 'utf8');
  const start = app.indexOf('async function openLineOaAddFriendExperience');
  const end = app.indexOf('async function recheckLineOaFriendshipAndResume', start);
  const flow = app.slice(start, end);
  assert.match(flow, /const handoffToken = String\(resumeHandoff\?\.token \|\| ''\)\.trim\(\)/);
  assert.ok(flow.includes("if (!/^[A-Za-z0-9_-]{43}$/.test(handoffToken))"));
  assert.match(flow, /if \(!entryUrl \|\| !entryUrl\.includes\(.*line_oa_handoff=/s);
  assert.ok(flow.indexOf('if (!/^[A-Za-z0-9_-]{43}$/.test(handoffToken))') < flow.indexOf('window.location.assign(entryUrl)'));
  assert.match(flow, /State\.currentStep = 3/);
  assert.match(flow, /return \{ opened: false, source: 'liff_handoff_unavailable' \}/);
});

test('Production Full LIFF opens the native friendship prompt without another login', async () => {
  const server = await fixture();
  const browser = await chromium.launch({ headless: true });
  let context;
  try {
    context = await browser.newContext({ userAgent: UA, viewport: { width: 390, height: 844 }, isMobile: true, serviceWorkers: 'block' });
    await context.addInitScript(() => {
      localStorage.setItem('lucky_colorstone_state', JSON.stringify({ wristSize: 16, beadSize: null, currentStep: 1, lineUserId: 'U_PROD_OA' }));
      window.__fullLiffTrace = { requestFriendship: 0, login: 0 };
      window.liff = {
        init: async () => {},
        isInClient: () => true,
        isLoggedIn: () => true,
        getContext: () => ({ viewType: 'full' }),
        login: () => { window.__fullLiffTrace.login += 1; },
        getIDToken: async () => 'mock.header.signature',
        getProfile: async () => ({ userId: 'U_PROD_OA', displayName: 'QA' }),
        getFriendship: async () => ({ friendFlag: false }),
        requestFriendship: async () => { window.__fullLiffTrace.requestFriendship += 1; }
      };
    });
    const page = await context.newPage();
    await page.route('https://static.line-scdn.net/liff/edge/2/sdk.js', (route) => route.fulfill({ contentType: 'text/javascript', body: '// fixture' }));
    await page.goto(`${server.origin}/?line_oa_handoff=${TOKEN}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#stepView3')?.classList.contains('active'), { timeout: 15000 });
    await page.waitForTimeout(1200);
    const result = await page.evaluate(() => ({
      step3: document.querySelector('#stepView3')?.classList.contains('active') === true,
      step4: document.querySelector('#stepView4')?.classList.contains('active') === true,
      wrist: document.querySelector('#canvasWristContext')?.textContent || '',
      ...window.__fullLiffTrace
    }));
    assert.equal(result.step3, true, JSON.stringify(result));
    assert.equal(result.step4, false, JSON.stringify(result));
    assert.match(result.wrist, /17\.5/);
    assert.equal(result.requestFriendship, 1, JSON.stringify(result));
    assert.equal(result.login, 0, JSON.stringify(result));
  } finally {
    await context?.close();
    await browser.close();
    await server.close();
  }
});

test('Production consume contract accepts the API { ok: true, payload } response', async () => {
  const app = await readFile(join(ROOT, 'app.js'), 'utf8');
  const start = app.indexOf('async function consumeDeferredLineAuthHandoff');
  const end = app.indexOf('async function restoreDeferredLineCallbackBeforeReset', start);
  const consume = app.slice(start, end);
  assert.match(consume, /consumeResult\?\.ok === true/);
  assert.match(consume, /consumeResult\?\.consumed === true/);
  assert.match(consume, /let consumedPayload = consumeResult\?\.payload \|\| null/);
  assert.match(consume, /const readResponse = await fetch\(handoffUrl\)/);
  assert.match(consume, /snapshot: consumedPayload\.designSnapshot/);
});

test('Production index holds first paint for an OA handoff return', async () => {
  const html = await readFile(join(ROOT, 'index.html'), 'utf8');
  assert.match(html, /lineOaCallback/);
  assert.match(html, /callbackParams\.has\('line_oa_handoff'\)/);
  assert.match(html, /hashParams\.has\('line_oa_handoff'\)/);
  assert.match(html, /lineOaCallback \|\| validV2Intent/);
  assert.match(html, /callback-bootstrap-hold/);
});

test('Production friendship verification is reused only for the current transition', async () => {
  const app = await readFile(join(ROOT, 'app.js'), 'utf8');
  assert.match(app, /let lineOaFriendshipVerifiedForStep4 = false/);
  assert.match(app, /if \(lineOaFriendshipVerifiedForStep4\) return true/);
  assert.match(app, /lineOaFriendshipVerifiedForStep4 = false/);
  assert.match(app, /The one-transition friendship grant is consumed only after the final/);
});


test('Production direct links opened in the LINE app enter the Full LIFF URL before app startup', async () => {
  const server = await fixture();
  const browser = await chromium.launch({ headless: true });
  let context;
  try {
    const lineUa = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36 Line/14.20.0';
    context = await browser.newContext({ userAgent: lineUa, viewport: { width: 390, height: 844 }, isMobile: true, serviceWorkers: 'block' });
    await context.addInitScript(() => {
      window.liff = {
        init: async () => {}, isInClient: () => false, isLoggedIn: () => false,
        getContext: () => ({ viewType: 'external' }), login: () => {},
        getIDToken: async () => '', getProfile: async () => ({})
      };
    });
    const page = await context.newPage();
    await page.route('https://liff.line.me/**', (route) => route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><html><body>LIFF entry intercepted</body></html>'
    }));
    const liffRequestPromise = page.waitForRequest((request) => request.url().startsWith('https://liff.line.me/2010525799-qImIuhla'));
    await page.goto(`${server.origin}/?utm_source=line&ref=oa`, { waitUntil: 'domcontentloaded' });
    const liffRequest = await liffRequestPromise;
    const current = new URL(liffRequest.url());
    assert.equal(current.hostname, 'liff.line.me');
    assert.equal(current.pathname, '/2010525799-qImIuhla');
    assert.equal(current.searchParams.get('utm_source'), 'line');
    assert.equal(current.searchParams.get('ref'), 'oa');
    assert.equal(current.searchParams.get('lc_line_liff_entry'), '1');
  } finally {
    await context?.close();
    await browser.close();
    await server.close();
  }
});

test('Production LIFF callbacks and OA handoffs are not redirected back into the LIFF entry URL', async () => {
  const html = await readFile(join(ROOT, 'index.html'), 'utf8');
  assert.match(html, /isLineAppBrowser/);
  assert.match(html, /isCallbackOrResume/);
  assert.match(html, /line_oa_handoff/);
  assert.match(html, /lc_line_liff_entry/);
  assert.match(html, /window\.location\.replace\(entry\.toString\(\)\)/);
});

test('LINE callback keeps the original transition and shows the requested Add Friend loading copy', async () => {
  const html = await readFile(join(ROOT, 'index.html'), 'utf8');
  const css = await readFile(join(ROOT, 'index.css'), 'utf8');
  const app = await readFile(join(ROOT, 'app.js'), 'utf8');
  assert.match(html, /pastel-spinner[\\s\\S]*?<p>LOADING…<br>เพิ่มเพื่อนเพื่อเข้าสู่ขั้นตอนถัดไป<\\/p>/);
  assert.match(css, /callback-bootstrap-content p[\\s\\S]*?font-size: 16px[\\s\\S]*?font-weight: 700/);
  assert.doesNotMatch(css, /callback-bootstrap-content[\\s\\S]*?border-radius: 24px[\\s\\S]*?background: #fff/);
  const start = app.indexOf('function showLineOaFriendshipTransition');
  const end = app.indexOf('function hideLineOaFriendshipTransition', start);
  const transition = app.slice(start, end);
  assert.match(transition, /title: 'กำลังเชื่อมต่อ LINE'/);
  assert.match(transition, /body: 'เพิ่มเพื่อน Lucky Colorstone เพื่อรับข้อมูลคำสั่งซื้อและดำเนินการต่อ'/);
});
