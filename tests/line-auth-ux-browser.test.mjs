import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SHOT_DIR = join(ROOT, 'reports', 'uat', 'screenshots');
await mkdir(SHOT_DIR, { recursive: true });
const MIME_TYPES = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';

async function startFixtureServer({ handoffStatus = 201, authEntryStatus = 503, pendingStatus = 200, pendingPayload = null } = {}) {
  let handoffPosts = 0;
  let authEntryPosts = 0;
  let authConsumePosts = 0;
  let pendingGets = 0;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    const json = (payload, status = 200) => {
      response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(payload));
    };
    if (url.pathname === '/api/auth-entry/sessions/pending' && request.method === 'GET') {
      pendingGets += 1;
      if (pendingStatus !== 200) {
        json({ ok: false, pending: false }, pendingStatus);
        return;
      }
      json(pendingPayload || { ok: true, pending: false });
      return;
    }
    if (url.pathname === '/api/liff-config') {
      json({ environment: 'uat', liffId: 'mock-uat-liff-id' });
      return;
    }
    if (url.pathname === '/api/line-id-token/verify' && request.method === 'POST') {
      json({ verified: true });
      return;
    }
    if (url.pathname === '/api/line-auth-entry' && request.method === 'POST') {
      authEntryPosts += 1;
      if (authEntryStatus !== 201) {
        json({ error: 'fixture auth entry unavailable' }, authEntryStatus);
        return;
      }
      json({ sessionId: 'S'.repeat(43), expiresAt: new Date(Date.now() + 600000).toISOString() }, 201);
      return;
    }
    if (url.pathname === '/api/line-auth-consume' && request.method === 'POST') {
      authConsumePosts += 1;
      json({
        ok: true,
        targetStep: 2,
        journeyId: 'qa-browser-journey',
        snapshot: {
          version: 1,
          step: 1,
          design: {
            wristSize: 17.5,
            beadSize: '6',
            mixedPlacingSize: '6',
            selectedCharmIds: [],
            components: []
          }
        }
      });
      return;
    }
    if (url.pathname === '/api/auth-handoffs' && request.method === 'POST') {
      handoffPosts += 1;
      if (handoffStatus !== 201) {
        json({ error: 'fixture handoff failure' }, handoffStatus);
        return;
      }
      json({ token: 'A'.repeat(43), journeyId: 'qa-browser-journey' }, 201);
      return;
    }
    if (url.pathname === `/api/auth-handoffs/${'A'.repeat(43)}` && request.method === 'GET') {
      json({
        payload: {
          targetStep: 2,
          journeyId: 'qa-browser-journey',
          designSnapshot: {
            version: 1,
            step: 1,
            design: {
              wristSize: 17.5,
              beadSize: '6',
              mixedPlacingSize: '6',
              selectedCharmIds: [],
              components: []
            }
          }
        }
      });
      return;
    }
    if (url.pathname === `/api/auth-handoffs/${'A'.repeat(43)}/consume` && request.method === 'POST') {
      json({ consumed: true });
      return;
    }
    if (url.pathname === '/api/settings') {
      json({});
      return;
    }
    if (url.pathname === '/api/stones' || url.pathname === '/api/charms' || url.pathname === '/api/spacers') {
      json([]);
      return;
    }
    if (url.pathname === '/api/social-proof') {
      json({ displayCount: 1035, recentBracelets: [] });
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      json({});
      return;
    }

    const requested = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\//, '');
    const filePath = normalize(join(ROOT, requested));
    if (!filePath.startsWith(normalize(ROOT))) {
      response.writeHead(403).end();
      return;
    }
    try {
      const file = await readFile(filePath);
      await stat(filePath);
      response.writeHead(200, { 'content-type': MIME_TYPES[extname(filePath)] || 'application/octet-stream' });
      response.end(file);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    getHandoffPosts: () => handoffPosts,
    getAuthEntryPosts: () => authEntryPosts,
    getAuthConsumePosts: () => authConsumePosts,
    getPendingGets: () => pendingGets,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

async function createPage(browser, origin, { loggedIn = false, url = origin, waitForLanding = true, pendingAuthSession = null, initDelayMs = 0, userAgent = MOBILE_UA } = {}) {
  const context = await browser.newContext({
    userAgent,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    serviceWorkers: 'block'
  });
  await context.addInitScript(({ loggedIn, pendingAuthSession, initDelayMs }) => {
    if (pendingAuthSession) {
      sessionStorage.setItem('lucky_uat_line_auth_entry_pending', JSON.stringify(pendingAuthSession));
    }
    window.__lineUxTrace = { loginCalls: 0, initCalls: 0 };
    window.liff = {
      init: async () => {
        if (initDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, initDelayMs));
        window.__lineUxTrace.initCalls += 1;
      },
      isInClient: () => false,
      isLoggedIn: () => loggedIn,
      login: () => {
        window.__lineUxTrace.loginCalls += 1;
      },
      getIDToken: async () => 'mock.header.signature',
      getProfile: async () => ({ userId: 'U_QA_UX', displayName: 'QA UX' }),
      getFriendship: async () => ({ friendFlag: true })
    };
  }, { loggedIn, pendingAuthSession, initDelayMs });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleLogs = [];
  page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)));
  page.on('console', (message) => consoleLogs.push(String(message.text() || '')));
  await page.route('https://static.line-scdn.net/liff/edge/2/sdk.js', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: '// LIFF SDK is replaced by the browser fixture.'
  }));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  if (waitForLanding) {
    await page.locator('#btnLandingLogin').waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.querySelector('#btnLandingLogin')?.disabled);
  }
  return { context, page, pageErrors, consoleLogs };
}

test('an authenticated callback consumes once and restores the original Step 2 design', async () => {
  const server = await startFixtureServer();
  const browser = await chromium.launch({ headless: true });
  let context;
  try {
    const callbackUrl = `${server.origin}/?handoff=${'A'.repeat(43)}`;
    const pageSetup = await createPage(browser, server.origin, {
      loggedIn: true,
      url: callbackUrl,
      waitForLanding: false
    });
    context = pageSetup.context;
    const { page, pageErrors } = pageSetup;
    await page.locator('#stepView2.active').waitFor({ state: 'visible', timeout: 8000 });
    await page.waitForTimeout(200);

    const result = await page.evaluate(() => ({
      loginCalls: window.__lineUxTrace.loginCalls,
      step2Visible: document.querySelector('#stepView2')?.classList.contains('active') === true,
      wrist: document.querySelector('#estimationWristSizeText')?.textContent || '',
      handoffInUrl: new URLSearchParams(window.location.search).has('handoff')
    }));
    assert.equal(result.loginCalls, 0, JSON.stringify(result));
    assert.equal(result.step2Visible, true, JSON.stringify(result));
    assert.equal(result.handoffInUrl, false, JSON.stringify(result));
    assert.match(result.wrist, /17\.5/);
    assert.deepEqual(pageErrors, [], JSON.stringify(pageErrors));
    await page.screenshot({ path: join(SHOT_DIR, 'line-auth-ux-callback-restore-local-20261122.png'), fullPage: true });
  } finally {
    await context?.close();
    await browser.close();
    await server.close();
  }
});

test('landing and Step 1 stay unauthenticated; explicit fallback creates one handoff/login', async () => {
  const server = await startFixtureServer();
  const browser = await chromium.launch({ headless: true });
  let context;
  try {
    const pageSetup = await createPage(browser, server.origin, { url: `${server.origin}/?explicit_login=1` });
    context = pageSetup.context;
    const { page, pageErrors } = pageSetup;

    assert.equal(await page.evaluate(() => window.__lineUxTrace.loginCalls), 0);

    // Use DOM click because the campaign CTA has a continuous float animation.
    await page.evaluate(() => document.querySelector('#btnLandingLogin').click());
    await page.locator('#stepView1.active').waitFor({ state: 'visible', timeout: 5000 });
    assert.equal(await page.evaluate(() => window.__lineUxTrace.loginCalls), 0);

    await page.evaluate(() => {
      document.querySelector('#btnNext').click();
      document.querySelector('#btnNext').click();
    });
    await page.waitForTimeout(500);

    const prompt = await page.evaluate(() => ({
      loginCalls: window.__lineUxTrace.loginCalls,
      initCalls: window.__lineUxTrace.initCalls,
      authState: document.querySelector('#step1AuthStatus')?.dataset.state || '',
      authText: document.querySelector('#step1AuthStatusText')?.textContent || '',
      loadingDisplay: getComputedStyle(document.querySelector('#liffLoadingOverlay')).display
    }));
    assert.equal(prompt.initCalls, 1, JSON.stringify(prompt));
    assert.equal(prompt.loginCalls, 0, JSON.stringify(prompt));
    assert.equal(prompt.authState, 'required', JSON.stringify(prompt));
    assert.match(prompt.authText, /เข้าสู่ระบบด้วย LINE/);
    assert.equal(prompt.loadingDisplay, 'none', JSON.stringify(prompt));
    assert.equal(server.getHandoffPosts(), 0, JSON.stringify(prompt));

    // The customer must explicitly tap the single LINE Login action.
    await page.evaluate(() => document.querySelector('#btnStep1LineConnect').click());
    await page.waitForTimeout(500);

    const result = await page.evaluate(() => ({
      loginCalls: window.__lineUxTrace.loginCalls,
      initCalls: window.__lineUxTrace.initCalls,
      authState: document.querySelector('#step1AuthStatus')?.dataset.state || '',
      authText: document.querySelector('#step1AuthStatusText')?.textContent || '',
      loadingDisplay: getComputedStyle(document.querySelector('#liffLoadingOverlay')).display,
      loadingTitle: document.querySelector('#liffLoadingTitle')?.textContent || '',
      loadingText: document.querySelector('#liffLoadingText')?.textContent || ''
    }));
    assert.equal(result.initCalls, 1, JSON.stringify(result));
    assert.equal(result.loginCalls, 1, JSON.stringify(result));
    assert.equal(server.getHandoffPosts(), 1, JSON.stringify(result));
    assert.equal(result.authState, 'verifying', JSON.stringify(result));
    assert.match(result.authText, /กำลังเชื่อมต่อกับ LINE/);
    assert.equal(result.loadingDisplay, 'flex', JSON.stringify(result));
    assert.match(result.loadingTitle, /กำลังเชื่อมต่อกับ LINE/);
    assert.match(result.loadingText, /กำลังนำคุณไปยัง LINE/);
    assert.deepEqual(pageErrors, [], JSON.stringify(pageErrors));
    await page.screenshot({ path: join(SHOT_DIR, 'line-auth-ux-progress-local-20261122.png'), fullPage: true });
  } finally {
    await context?.close();
    await browser.close();
    await server.close();
  }
});

test('handoff creation failure stays on Step 1 and never starts LINE login', async () => {
  const server = await startFixtureServer({ handoffStatus: 503 });
  const browser = await chromium.launch({ headless: true });
  let context;
  try {
    const pageSetup = await createPage(browser, server.origin);
    context = pageSetup.context;
    const { page, pageErrors } = pageSetup;
    await page.evaluate(() => document.querySelector('#btnLandingLogin').click());
    await page.locator('#stepView1.active').waitFor({ state: 'visible', timeout: 5000 });
    await page.evaluate(() => document.querySelector('#btnNext').click());
    await page.evaluate(() => document.querySelector('#btnStep1LineConnect').click());
    await page.waitForTimeout(500);

    const result = await page.evaluate(() => ({
      loginCalls: window.__lineUxTrace.loginCalls,
      authState: document.querySelector('#step1AuthStatus')?.dataset.state || '',
      authText: document.querySelector('#step1AuthStatusText')?.textContent || '',
      loadingDisplay: getComputedStyle(document.querySelector('#liffLoadingOverlay')).display,
      step1Visible: document.querySelector('#stepView1')?.classList.contains('active') === true,
      step2Visible: document.querySelector('#stepView2')?.classList.contains('active') === true
    }));
    assert.equal(server.getHandoffPosts(), 1, JSON.stringify(result));
    assert.equal(result.loginCalls, 0, JSON.stringify(result));
    assert.equal(result.authState, 'failed', JSON.stringify(result));
    assert.match(result.authText, /ไม่สามารถบันทึกการออกแบบของคุณได้/);
    assert.equal(result.loadingDisplay, 'none', JSON.stringify(result));
    assert.equal(result.step1Visible, true, JSON.stringify(result));
    assert.equal(result.step2Visible, false, JSON.stringify(result));
    assert.deepEqual(pageErrors, [], JSON.stringify(pageErrors));
    await page.screenshot({ path: join(SHOT_DIR, 'line-auth-ux-handoff-failure-local-20261122.png'), fullPage: true });
  } finally {
    await context?.close();
    await browser.close();
    await server.close();
  }
});

test('Step 1 boundary exposes one explicit LINE Login action and no auth entry', async () => {
  const server = await startFixtureServer({ authEntryStatus: 201 });
  const browser = await chromium.launch({ headless: true });
  let context;
  try {
    const pageSetup = await createPage(browser, server.origin, { url: `${server.origin}/?explicit_login=1` });
    context = pageSetup.context;
    const { page, pageErrors } = pageSetup;
    await page.evaluate(() => document.querySelector('#btnLandingLogin').click());
    await page.locator('#stepView1.active').waitFor({ state: 'visible', timeout: 5000 });
    await page.evaluate(() => document.querySelector('#btnNext').click());
    await page.waitForTimeout(300);
    const prompt = await page.evaluate(() => ({
      authState: document.querySelector('#step1AuthStatus')?.dataset.state || '',
      authText: document.querySelector('#step1AuthStatusText')?.textContent || '',
      authEntryPosts: 0,
      handoffInUrl: new URLSearchParams(window.location.search).has('handoff')
    }));
    assert.equal(prompt.authState, 'required', JSON.stringify(prompt));
    assert.match(prompt.authText, /เข้าสู่ระบบด้วย LINE/);
    assert.equal(prompt.handoffInUrl, false, JSON.stringify(prompt));
    assert.equal(server.getAuthEntryPosts(), 0, JSON.stringify(prompt));
    assert.equal(server.getHandoffPosts(), 0, JSON.stringify(prompt));

    await page.evaluate(() => document.querySelector('#btnStep1LineConnect').click());
    await page.waitForTimeout(500);
    assert.equal(server.getAuthEntryPosts(), 0, JSON.stringify(prompt));
    assert.equal(server.getHandoffPosts(), 1, JSON.stringify(prompt));
    assert.deepEqual(pageErrors, [], JSON.stringify(pageErrors));
  } finally {
    await context?.close();
    await browser.close();
    await server.close();
  }
});

test('root return consumes the pending tab session once and restores exact Step 2 design', async () => {
  const server = await startFixtureServer();
  const browser = await chromium.launch({ headless: true });
  let context;
  try {
    const pageSetup = await createPage(browser, server.origin, {
      loggedIn: true,
      waitForLanding: false,
      pendingAuthSession: {
        version: 1,
        sessionId: 'S'.repeat(43),
        tabSessionId: 'T'.repeat(43),
        expiresAt: Date.now() + 600000
      }
    });
    context = pageSetup.context;
    const { page, pageErrors } = pageSetup;
    await page.locator('#stepView2.active').waitFor({ state: 'visible', timeout: 8000 });
    const result = await page.evaluate(() => ({
      wrist: document.querySelector('#estimationWristSizeText')?.textContent || '',
      step2Visible: document.querySelector('#stepView2')?.classList.contains('active') === true,
      handoffInUrl: new URLSearchParams(window.location.search).has('handoff')
    }));
    assert.equal(result.step2Visible, true, JSON.stringify(result));
    assert.equal(result.handoffInUrl, false, JSON.stringify(result));
    assert.match(result.wrist, /17\.5/);
    assert.equal(server.getAuthConsumePosts(), 1, JSON.stringify(result));
    assert.deepEqual(pageErrors, [], JSON.stringify(pageErrors));
  } finally {
    await context?.close();
    await browser.close();
    await server.close();
  }
});

test('root recovers a browser-bound pending session when tab sessionStorage is absent', async () => {
  const pendingPayload = {
    ok: true,
    pending: true,
    sessionId: 'S'.repeat(43),
    tabSessionId: 'T'.repeat(43),
    expiresAt: new Date(Date.now() + 600000).toISOString()
  };
  const server = await startFixtureServer({ pendingPayload });
  const browser = await chromium.launch({ headless: true });
  let context;
  try {
    const pageSetup = await createPage(browser, server.origin, {
      loggedIn: true,
      waitForLanding: false
    });
    context = pageSetup.context;
    const { page, pageErrors } = pageSetup;
    await page.locator('#stepView2.active').waitFor({ state: 'visible', timeout: 8000 });
    const result = await page.evaluate(() => ({
      wrist: document.querySelector('#estimationWristSizeText')?.textContent || '',
      step2Visible: document.querySelector('#stepView2')?.classList.contains('active') === true,
      pendingCleared: sessionStorage.getItem('lucky_uat_line_auth_entry_pending') === null
    }));
    assert.equal(result.step2Visible, true, JSON.stringify(result));
    assert.match(result.wrist, /17\.5/);
    assert.equal(result.pendingCleared, true, JSON.stringify(result));
    assert.equal(server.getPendingGets(), 1, JSON.stringify(result));
    assert.equal(server.getAuthConsumePosts(), 1, JSON.stringify(result));
    assert.deepEqual(pageErrors, [], JSON.stringify(pageErrors));
  } finally {
    await context?.close();
    await browser.close();
    await server.close();
  }
});

test('expired pending auth-entry fails closed instead of legacy Step 2 resume', async () => {
  const server = await startFixtureServer({
    pendingPayload: { ok: true, pending: false, expired: true }
  });
  const browser = await chromium.launch({ headless: true });
  let context;
  try {
    const pageSetup = await createPage(browser, server.origin, {
      loggedIn: true,
      waitForLanding: false
    });
    context = pageSetup.context;
    const { page, pageErrors } = pageSetup;
    await page.locator('#stepView1.active').waitFor({ state: 'visible', timeout: 8000 });
    const result = await page.evaluate(() => ({
      step1Visible: document.querySelector('#stepView1')?.classList.contains('active') === true,
      step2Visible: document.querySelector('#stepView2')?.classList.contains('active') === true,
      authState: document.querySelector('#step1AuthStatus')?.dataset.state || ''
    }));
    assert.equal(result.step1Visible, true, JSON.stringify(result));
    assert.equal(result.step2Visible, false, JSON.stringify(result));
    assert.equal(result.authState, 'failed', JSON.stringify(result));
    assert.equal(server.getAuthConsumePosts(), 0, JSON.stringify(result));
    assert.deepEqual(pageErrors, [], JSON.stringify(pageErrors));
  } finally {
    await context?.close();
    await browser.close();
    await server.close();
  }
});

test('delayed LIFF initialization survives the LINE Continue confirmation window', async () => {
  const server = await startFixtureServer();
  const browser = await chromium.launch({ headless: true });
  let context;
  try {
    const pageSetup = await createPage(browser, server.origin, { initDelayMs: 7000 });
    context = pageSetup.context;
    const { page, pageErrors, consoleLogs } = pageSetup;
    await page.waitForTimeout(8500);
    const result = await page.evaluate(() => ({
      initCalls: window.__lineUxTrace.initCalls,
      landingVisible: Boolean(document.querySelector('#btnLandingLogin'))
    }));
    assert.equal(result.initCalls, 1, JSON.stringify(result));
    assert.equal(result.landingVisible, true, JSON.stringify(result));
    assert.equal(consoleLogs.some((line) => line.includes('LIFF initialization failed or timed out')), false);
    assert.deepEqual(pageErrors, [], JSON.stringify(pageErrors));
  } finally {
    await context?.close();
    await browser.close();
    await server.close();
  }
});

test('Instagram auto-attempts escape without any custom recovery UI; direct Chrome bypasses', async () => {
  const server = await startFixtureServer();
  const browser = await chromium.launch({ headless: true });
  let instagramContext;
  let chromeContext;
  try {
    const instagramUa = 'Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230901.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.0.0 Mobile Safari/537.36 Instagram 320.0.0.0.0';
    const instagram = await createPage(browser, server.origin, { userAgent: instagramUa });
    instagramContext = instagram.context;
    await instagram.page.waitForTimeout(500);
    assert.equal(await instagram.page.locator('#instagramBrowserTransition').count(), 0);
    assert.equal(await instagram.page.evaluate(() => sessionStorage.getItem('lucky_uat_instagram_auto_escape_attempted')), '1');
    assert.equal(instagram.pageErrors.length, 0, JSON.stringify(instagram.pageErrors));
    await instagramContext.close();
    instagramContext = null;

    const chromeUa = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36';
    const chrome = await createPage(browser, server.origin, { userAgent: chromeUa });
    chromeContext = chrome.context;
    await chrome.page.waitForTimeout(500);
    assert.equal(await chrome.page.locator('#instagramBrowserTransition').count(), 0);
    assert.equal(await chrome.page.evaluate(() => sessionStorage.getItem('lucky_uat_instagram_auto_escape_attempted')), null);
    assert.equal(chrome.pageErrors.length, 0, JSON.stringify(chrome.pageErrors));
  } finally {
    await instagramContext?.close();
    await chromeContext?.close();
    await browser.close();
    await server.close();
  }
});

test('Instagram iOS keeps its meta escape but renders no recovery card; Safari and LINE bypass', async () => {
  const server = await startFixtureServer();
  const browser = await chromium.launch({ headless: true });
  let instagramContext;
  let safariContext;
  let lineContext;
  try {
    const iosInstagramUa = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 320.0.0.0.0';
    const instagram = await createPage(browser, server.origin, { userAgent: iosInstagramUa });
    instagramContext = instagram.context;
    await instagram.page.waitForTimeout(500);
    assert.equal(await instagram.page.locator('#instagramBrowserTransition').count(), 0);
    assert.match(await instagram.page.evaluate(() => document.querySelector('meta[http-equiv="refresh"]')?.content || ''), /^0;url=instagram:\/\/extbrowser\/\?url=https?%3A%2F%2F/);
    assert.equal(instagram.pageErrors.length, 0, JSON.stringify(instagram.pageErrors));
    await instagramContext.close();
    instagramContext = null;

    const safariUa = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    const safari = await createPage(browser, server.origin, { userAgent: safariUa });
    safariContext = safari.context;
    assert.equal(await safari.page.locator('#instagramBrowserTransition').count(), 0);

    const lineUa = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36 Line/15.0.0';
    const line = await createPage(browser, server.origin, { userAgent: lineUa });
    lineContext = line.context;
    assert.equal(await line.page.locator('#instagramBrowserTransition').count(), 0);
  } finally {
    await instagramContext?.close();
    await safariContext?.close();
    await lineContext?.close();
    await browser.close();
    await server.close();
  }
});
