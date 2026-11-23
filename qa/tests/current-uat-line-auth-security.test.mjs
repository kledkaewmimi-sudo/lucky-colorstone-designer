import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../lib/app-root.mjs';
import { browserType, createFixtureBrowserContext } from '../lib/browser-fixtures.mjs';
import { startStaticServer } from '../lib/static-server.mjs';
import { writeEvidence } from '../lib/evidence.mjs';

const MOBILE_USER_AGENT = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
const IOS_INSTAGRAM_USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) ' +
  'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1 Instagram 360.0.0.0';

const appSource = fs.readFileSync(path.join(REPO_ROOT, 'app.js'), 'utf8');
const serverSource = fs.readFileSync(path.join(REPO_ROOT, 'server.js'), 'utf8');
const settings = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data/settings.json'), 'utf8'));
const stones = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data/stones.json'), 'utf8'));
const charms = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data/charms.json'), 'utf8'));
const spacers = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data/spacers.json'), 'utf8'));

function check(checks, name, pass, details = {}) {
  checks.push({ name, pass: Boolean(pass), ...details });
}

async function runScenario(server, browser, { userAgent, liff, action }) {
  const context = await createFixtureBrowserContext(browser, {
    origin: server.origin,
    width: 390,
    userAgent,
    settings: structuredClone(settings),
    stones: structuredClone(stones),
    charms: structuredClone(charms),
    spacers: structuredClone(spacers),
    liff
  });
  const page = await context.newPage();
  const requests = [];
  const pageErrors = [];
  page.on('request', (request) => requests.push(request.url()));
  page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)));
  try {
    await page.goto(`${server.origin}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.locator('#btnLandingLogin[data-start-handler-ready="true"]').waitFor({ state: 'attached', timeout: 20000 });
    await page.evaluate(() => document.querySelector('#btnLandingLogin')?.click());
    await page.locator('#stepView1.active').waitFor({ state: 'visible', timeout: 5000 });
    const details = await action({ page, requests });
    return { ...details, requests, pageErrors };
  } finally {
    await context.close();
  }
}

const checks = [];
const server = await startStaticServer(REPO_ROOT);
const browser = await browserType().chromium.launch({ headless: true });
try {
  const explicit = await runScenario(server, browser, {
    userAgent: IOS_INSTAGRAM_USER_AGENT,
    liff: { loggedIn: false, inClient: false, initDelayMs: 0, loginNavigates: false },
    action: async ({ page }) => {
      await page.locator('#wristSizeNext').click();
      await page.locator('#btnNext').click();
      await page.waitForFunction(
        () => document.querySelector('#step1AuthStatus')?.dataset.state === 'required',
        null,
        { timeout: 5000 }
      );
      const before = await page.evaluate(() => ({
        step1Visible: document.querySelector('#stepView1')?.classList.contains('active') === true,
        step2Visible: document.querySelector('#stepView2')?.classList.contains('active') === true,
        authState: document.querySelector('#step1AuthStatus')?.dataset.state || '',
        hidden: document.querySelector('#step1AuthStatus')?.hidden === true,
        connectVisible: document.querySelector('#btnStep1LineConnect')?.hidden === false,
        loginCalls: window.__liffFixtureMetrics?.loginCalls || 0
      }));
      await page.locator('#btnStep1LineConnect').click();
      await page.waitForTimeout(500);
      const after = await page.evaluate(() => ({
        step1Visible: document.querySelector('#stepView1')?.classList.contains('active') === true,
        step2Visible: document.querySelector('#stepView2')?.classList.contains('active') === true,
        loginCalls: window.__liffFixtureMetrics?.loginCalls || 0,
        authState: document.querySelector('#step1AuthStatus')?.dataset.state || ''
      }));
      return { before, after };
    }
  });
  check(checks, 'Instagram Next stays on Step 1 without automatic LIFF login', explicit.before.step1Visible
    && !explicit.before.step2Visible
    && explicit.before.loginCalls === 0, explicit.before);
  check(checks, 'Instagram exposes the explicit Step 1 LINE fallback', explicit.before.authState === 'required'
    && explicit.before.hidden === false
    && explicit.before.connectVisible === true
    && explicit.requests.every((url) => new URL(url).hostname !== 'liff.line.me'), {
    ...explicit.before,
    liffRequests: explicit.requests.filter((url) => new URL(url).hostname === 'liff.line.me')
  });
  check(checks, 'explicit Step 1 fallback cannot enter Step 2 without identity', explicit.after.step2Visible === false
    && explicit.after.authState === 'failed', explicit.after);

  const loggedIn = await runScenario(server, browser, {
    userAgent: MOBILE_USER_AGENT,
    liff: { loggedIn: true, inClient: false, initDelayMs: 0, profileDelayMs: 0 },
    action: async ({ page }) => {
      await page.locator('#wristSizeNext').click();
      await page.waitForFunction(
        () => window.__liffFixtureMetrics?.profileCompletedAt !== null,
        null,
        { timeout: 10000 }
      );
      await page.locator('#btnNext').click();
      await page.locator('#stepView2.active').waitFor({ state: 'visible', timeout: 10000 });
      return {
        step2Visible: await page.locator('#stepView2').evaluate((node) => node.classList.contains('active')),
        step1Visible: await page.locator('#stepView1').evaluate((node) => node.classList.contains('active'))
      };
    }
  });
  check(checks, 'verified mobile identity reaches Step 2 through the authenticated path', loggedIn.step2Visible === true
    && loggedIn.step1Visible === false, loggedIn);

  check(checks, 'auto auth-entry is restricted away from Instagram and LINE in-client', /detectBrowserContext\(window\.navigator\.userAgent \|\| ''\)\.isInstagram/.test(appSource)
    && /!isLiffInClient\(\)/.test(appSource)
    && /AUTO_LOGIN_AT_BOUNDARY/.test(appSource), {});
  check(checks, 'pending auth-entry recovery remains cookie-bound and server-validated', /recoverPendingAutoAuthEntry/.test(appSource)
    && /\/api\/auth-entry\/sessions\/pending/.test(serverSource)
    && /verifyUatLineIdToken/.test(serverSource), {});
  check(checks, 'no raw ID token is persisted in browser storage', !/sessionStorage\.setItem\([^\n]*idToken/i.test(appSource)
    && !/localStorage\.setItem\([^\n]*idToken/i.test(appSource), {});

  assert.equal(explicit.pageErrors.length, 0, JSON.stringify(explicit.pageErrors));
  assert.equal(loggedIn.pageErrors.length, 0, JSON.stringify(loggedIn.pageErrors));
} catch (error) {
  check(checks, 'security suite completed without exception', false, {
    error: String(error?.message || error)
  });
} finally {
  await browser.close();
  await server.close();
}

const failed = checks.filter((entry) => !entry.pass);
const result = {
  completedAt: new Date().toISOString(),
  status: failed.length === 0 ? 'PASS' : 'FAIL',
  appRoot: REPO_ROOT,
  checks,
  failed: failed.map((entry) => entry.name)
};
writeEvidence('reports/qa/browser/progressive-line-startup.json', result);
console.log(JSON.stringify({ status: result.status, checks: checks.length, failed: result.failed }, null, 2));
if (failed.length > 0) process.exitCode = 1;
