import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CHROME = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const CUSTOMIZATION_INTENT_KEY = 'lucky_colorstone_customize_login_intent';
const MIME_TYPES = { '.js': 'text/javascript; charset=utf-8', '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };

async function startStaticServer() {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    if (url.pathname === '/api/liff-config') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ environment: 'uat', liffId: 'mock-uat-liff-id' }));
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('[]');
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
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

async function runBrowserScenario({ debug = false, lifecycle = 'none' } = {}) {
  const { server, origin } = await startStaticServer();
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
    viewport: { width: 390, height: 844 },
    isMobile: true
  });
  await context.addInitScript(({ intentKey, lifecycleMode }) => {
    window.__lineAuthTrace = [];
    const trace = (event, details = {}) => window.__lineAuthTrace.push({ event, ...details });
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key, value) {
      if (key === intentKey) {
        trace('rememberCustomizationLoginIntent', { result: false });
        throw new Error('storage blocked by test');
      }
      return originalSetItem.call(this, key, value);
    };
    window.liff = {
      init: async () => trace('liff.init'),
      isInClient: () => { trace('liff.isInClient', { value: false }); return false; },
      isLoggedIn: () => { trace('liff.isLoggedIn', { value: false }); return false; },
      login: () => {
        trace('liff.login', { invoked: true });
        if (lifecycleMode === 'pagehide') {
          window.setTimeout(() => window.dispatchEvent(new PageTransitionEvent('pagehide')), 20);
        }
      },
      getProfile: async () => { trace('liff.getProfile'); return { userId: 'not-recorded' }; }
    };
    const originalAssign = window.location.assign.bind(window.location);
    try {
      window.location.assign = (url) => trace('location.assign', { invoked: true, url: String(url) });
    } catch {
      window.__lineAuthOriginalAssign = originalAssign;
    }
  }, { intentKey: CUSTOMIZATION_INTENT_KEY, lifecycleMode: lifecycle });
  const page = await context.newPage();
  await page.route('https://static.line-scdn.net/liff/edge/2/sdk.js', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: '// LIFF SDK is intentionally mocked by addInitScript for this browser harness.\n'
  }));
  const browserConsole = [];
  page.on('console', (message) => browserConsole.push(message.text()));
  try {
    await page.goto(`${origin}/${debug ? '?line_debug=1' : ''}`, { waitUntil: 'domcontentloaded' });
    const button = page.locator('#btnLandingLogin');
    await button.waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.querySelector('#btnLandingLogin')?.disabled);
    const initialCta = await button.locator('.btn-text').textContent();
    await button.click();
    await page.waitForTimeout(lifecycle === 'none' && debug ? 1650 : 250);
    const result = await page.evaluate(() => ({
      trace: window.__lineAuthTrace,
      cta: document.querySelector('#btnLandingLogin .btn-text')?.textContent?.trim() || '',
      landingVisible: getComputedStyle(document.querySelector('#landingView')).display !== 'none',
      step1Visible: document.querySelector('#stepView1')?.classList.contains('active') === true,
      loginCalls: window.__lineAuthTrace.filter((entry) => entry.event === 'liff.login').length,
      navigationCalls: window.__lineAuthTrace.filter((entry) => entry.event === 'location.assign').length,
      debugPanelPresent: Boolean(document.querySelector('#lineDebugPanel')),
      debugTrace: document.querySelector('#lineDebugPanel .line-debug-output')?.textContent || ''
    }));
    console.log(JSON.stringify({ trace: ['BOOTSTRAP_READY', 'LANDING_CLICK', ...result.trace.map((entry) => entry.event)], initialCta: initialCta?.trim(), ...result, browserConsole }));
    assert.equal(initialCta?.trim(), 'เริ่มออกแบบ');
    assert.ok(result.loginCalls === 1 || result.navigationCalls === 1, JSON.stringify(result));
    assert.equal(result.cta === 'เข้าสู่ระบบด้วย LINE' && result.loginCalls === 0 && result.navigationCalls === 0, false, JSON.stringify(result));
    if (!debug) {
      assert.equal(result.debugPanelPresent, false, JSON.stringify(result));
    } else {
      for (const event of ['LANDING_START_CLICK', 'BEFORE_LIFF_LOGIN', 'LIFF_LOGIN_INVOKED']) {
        assert.match(result.debugTrace, new RegExp(event), JSON.stringify(result));
      }
      if (lifecycle === 'pagehide') {
        assert.match(result.debugTrace, /PAGEHIDE/, JSON.stringify(result));
        assert.doesNotMatch(result.debugTrace, /F05E8/, JSON.stringify(result));
      } else {
        assert.match(result.debugTrace, /LOGIN_INVOKED_NO_NAVIGATION/, JSON.stringify(result));
        assert.match(result.debugTrace, /F05E8/, JSON.stringify(result));
      }
    }
    return result;
  } finally {
    await context.close();
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

async function runAllBrowserScenarios() {
  const scenario = process.env.LINE_DEBUG_SCENARIO || 'all';
  if (scenario === 'plain') return runBrowserScenario();
  if (scenario === 'pagehide') return runBrowserScenario({ debug: true, lifecycle: 'pagehide' });
  if (scenario === 'no-navigation') return runBrowserScenario({ debug: true, lifecycle: 'none' });
  await runBrowserScenario();
  await runBrowserScenario({ debug: true, lifecycle: 'pagehide' });
  await runBrowserScenario({ debug: true, lifecycle: 'none' });
}

runAllBrowserScenarios().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
