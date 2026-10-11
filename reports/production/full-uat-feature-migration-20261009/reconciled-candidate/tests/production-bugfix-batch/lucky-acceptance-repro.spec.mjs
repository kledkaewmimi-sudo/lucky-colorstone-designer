import { test, expect } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

// Production bugfix batch - Lucky acceptance reproduction harness.
// Serves the production source tree (this directory) with mocked /api from its own data/*.json and
// drives the real customer flow + the real Lucky engine:
//   landing -> Step 1 -> Step 2 -> Step 3 -> Lucky page1 -> page2 -> page3 -> accept.
// It records: Step 4 auto-navigation, replace-confirmation visibility, and any `undefined` that
// leaks into the Step 3 bracelet rendering after a charm/talisman design is accepted.
const root = process.cwd();
let server;
let baseUrl;

const mime = (p) => p.endsWith('.html') ? 'text/html; charset=utf-8'
  : p.endsWith('.css') ? 'text/css; charset=utf-8'
  : (p.endsWith('.js') || p.endsWith('.mjs')) ? 'application/javascript; charset=utf-8'
  : p.endsWith('.webp') ? 'image/webp' : p.endsWith('.png') ? 'image/png'
  : p.endsWith('.svg') ? 'image/svg+xml' : p.endsWith('.jpg') ? 'image/jpeg' : 'application/octet-stream';

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const file = path.resolve(root, rel);
    if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': mime(file) });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = 'http://127.0.0.1:' + server.address().port;
});
test.afterAll(() => server?.close());

const data = (name) => JSON.parse(fs.readFileSync(path.resolve(root, 'data', name), 'utf8'));

async function mockApi(page) {
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() !== 'GET' && req.method() !== 'HEAD') { await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); return; }
    const map = { '/api/stones': 'stones.json', '/api/charms': 'charms.json', '/api/spacers': 'spacers.json', '/api/settings': 'settings.json' };
    const file = map[url.pathname];
    await route.fulfill({ status: 200, contentType: 'application/json', body: file ? JSON.stringify(data(file)) : '{}' });
  });
}

const screenshotDir = 'tests/production-bugfix-batch/evidence';

async function reachStep3(page) {
  await page.goto(baseUrl + '/index.html?mock=1');
  await expect(page.locator('#landingView')).toBeVisible();
  await page.locator('#landingView button').first().click();
  await expect(page.locator('#stepView1.active')).toBeVisible();
  await page.locator('#btnNext').click();
  await expect(page.locator('#stepView2.active')).toBeVisible();
  await page.locator('[data-bead-size="6"]').click();
  await page.locator('#btnNext').click();
  await expect(page.locator('#stepView3.active')).toBeVisible();
  await expect(page.locator('#stepView3 .lumi-entry')).toBeVisible({ timeout: 45000 });
  await dismissFirstVisitOnboarding(page);
}

// The first-visit Step 3 tutorial swallows taps (its capture handler calls stopImmediatePropagation)
// until the visitor taps through it, exactly as a real first-time customer must. Tap through it so the
// Lucky entry is clickable, then wait for the overlay to leave the DOM.
async function dismissFirstVisitOnboarding(page) {
  for (let attempt = 0; attempt < 14; attempt += 1) {
    if (await page.locator('.step3-onboarding').count() === 0) return;
    await page.mouse.click(195, 760).catch(() => {});
    await page.waitForTimeout(450);
  }
  await expect(page.locator('.step3-onboarding')).toHaveCount(0, { timeout: 15000 });
}

const pickFirstGoal = async (page, goal) => {
  const button = page.locator(`[data-lumi-goal="${goal}"]`);
  await button.click({ position: { x: 6, y: 6 } });
  if (await button.getAttribute('aria-pressed') !== 'true') await button.evaluate((node) => node.click());
};

// Opens Lucky, answers page 1 (keeping the requested style) and page 2, then generates the design.
async function runLucky(page, { style = 'charm', goal = 'luck' } = {}) {
  await page.locator('#stepView3 .lumi-entry').click();
  await expect(page.locator('.lucky-page1')).toBeVisible();
  await page.locator('[data-lumi-weekday="monday"]').click();
  await page.locator('[data-lumi-birth-date]').selectOption('1');
  await page.locator('[data-lumi-birth-month]').selectOption('1');
  await page.locator('[data-lumi-birth-year]').selectOption('1990');
  const styleKey = style === 'charm' ? 'charm' : 'stone';
  const styleButton = page.locator(`[data-lumi-style="${styleKey}"]`);
  if (await styleButton.getAttribute('aria-pressed') !== 'true') await styleButton.click();
  await page.locator('.lucky-page1-actions [data-lumi-action="goals"]').click();
  await pickFirstGoal(page, goal);
  await page.locator('.lucky-page2-actions [data-lumi-action="generate"]').click();
  try {
    await expect(page.locator('.lucky-page3')).toBeVisible({ timeout: 60000 });
  } catch (error) {
    const shell = await page.evaluate(() => (document.querySelector('.lumi-shell')?.innerHTML || '').slice(0, 600));
    throw new Error('Lucky did not reach the recommendation page. shell=' + shell);
  }
  await expect(page.locator('.lucky-result-bracelet svg').first()).toBeVisible({ timeout: 30000 });
}

// Everything the Step 3 renderer produced, plus a raw scan for the literal string "undefined".
const step3Snapshot = (page) => page.evaluate(() => {
  const view = document.querySelector('#stepView3');
  const svg = document.querySelector('#braceletSvg');
  const nodes = svg ? [...svg.querySelectorAll('*')] : [];
  const undefinedAttributes = [];
  const undefinedText = [];
  for (const node of nodes) {
    for (const attribute of [...node.attributes]) {
      if (String(attribute.value).includes('undefined') || String(attribute.value).includes('null')) {
        undefinedAttributes.push(node.tagName + '[' + attribute.name + '=' + attribute.value + ']');
      }
      if ((node.tagName === 'text' || node.tagName === 'title') && String(node.textContent).includes('undefined')) {
        undefinedText.push(node.textContent);
      }
    }
  }
  const images = [...view.querySelectorAll('img')].map((img) => img.getAttribute('src'));
  const summaryText = [...view.querySelectorAll('.bracelet-summary, .summary-line, .selected-summary, [class*="summary"]')]
    .map((node) => node.textContent.replace(/\s+/g, ' ').trim()).join(' | ');
  let persisted = {};
  try { persisted = JSON.parse(window.localStorage.getItem('lucky_colorstone_state') || '{}') || {}; } catch (error) { persisted = { parseError: String(error.message) }; }
  return {
    activeStep: document.querySelector('#stepView4.active') ? 4 : 3,
    step4Active: Boolean(document.querySelector('#stepView4.active')),
    step3Active: Boolean(document.querySelector('#stepView3.active')),
    svgPresent: Boolean(svg),
    svgNodeCount: nodes.length,
    svgSlotCount: svg ? svg.querySelectorAll('[data-slot-kind]').length : 0,
    undefinedAttributes,
    undefinedText,
    suspiciousImageSrc: images.filter((src) => !src || src.includes('undefined')),
    summaryText,
    selectedStones: JSON.parse(JSON.stringify(persisted.selectedStones || [])),
    charmIds: persisted.selectedCharmIds || [],
    persistedKeys: Object.keys(persisted)
  };
});

test('Lucky charm acceptance: Step 3 render, replacement confirmation and Step 4 navigation', async ({ page }) => {
  test.setTimeout(240000);
  const problems = [];
  page.on('pageerror', (error) => problems.push('pageerror: ' + error.message));
  page.on('console', (message) => { if (message.type() === 'error') problems.push('console: ' + message.text()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  fs.mkdirSync(screenshotDir, { recursive: true });
  await reachStep3(page);

  // ---- first Lucky run: charm style, empty editor -> no replacement confirmation expected ----
  await runLucky(page, { style: 'charm', goal: 'love' });
  await page.screenshot({ path: `${screenshotDir}/repro-01-charm-recommendation.png` });
  await page.locator('.lucky-page3-actions [data-lumi-action="use"]').click();
  // Either the confirmation card (existing design) or a direct acceptance (empty editor) is allowed here.
  const firstConfirmVisible = await page.locator('.lumi-replace').isVisible().catch(() => false);
  if (firstConfirmVisible) await page.locator('.lumi-replace [data-lumi-action="commit"]').click();
  await expect(page.locator('.lumi-shell')).toHaveCount(0, { timeout: 30000 });
  await page.waitForTimeout(1500);

  const afterFirst = await step3Snapshot(page);
  await page.screenshot({ path: `${screenshotDir}/repro-02-charm-step3-after-accept.png`, fullPage: true });

  // ---- second Lucky run: the editor now holds the first bracelet -> confirmation must appear ----
  let secondConfirmVisible = false;
  let secondAcceptOutcome = 'not-attempted';
  try {
    await runLucky(page, { style: 'charm', goal: 'love' });
    await page.locator('.lucky-page3-actions [data-lumi-action="use"]').click();
    secondConfirmVisible = await page.locator('.lumi-replace').isVisible().catch(() => false);
    secondAcceptOutcome = secondConfirmVisible ? 'confirmation-shown' : 'no-confirmation';
    await page.screenshot({ path: `${screenshotDir}/repro-03-second-accept.png` });
    if (secondConfirmVisible) await page.locator('.lumi-replace [data-lumi-action="commit"]').click();
    await page.waitForTimeout(1500);
  } catch (error) {
    secondAcceptOutcome = 'error: ' + String(error.message || error).slice(0, 240);
  }

  console.log('REPRO ' + JSON.stringify({
    firstConfirmVisible,
    afterFirst: { activeStep: afterFirst.activeStep, undefinedAttributes: afterFirst.undefinedAttributes.slice(0, 6), suspiciousImageSrc: afterFirst.suspiciousImageSrc, stoneCount: afterFirst.selectedStones.length, charmIds: afterFirst.charmIds },
    secondConfirmVisible,
    secondAcceptOutcome,
    problems
  }, null, 1));
});

test('Lucky stone-only acceptance keeps the Step 3 bracelet valid', async ({ page }) => {
  test.setTimeout(240000);
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await reachStep3(page);
  await runLucky(page, { style: 'stone', goal: 'luck' });
  await page.locator('.lucky-page3-actions [data-lumi-action="use"]').click();
  if (await page.locator('.lumi-replace').isVisible().catch(() => false)) await page.locator('.lumi-replace [data-lumi-action="commit"]').click();
  await expect(page.locator('.lumi-shell')).toHaveCount(0, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const snapshot = await step3Snapshot(page);
  console.log('REPRO-stone-only ' + JSON.stringify({ svgPresent: snapshot.svgPresent, slots: snapshot.svgSlotCount, undefined: snapshot.undefinedAttributes.slice(0, 6), step4: snapshot.step4Active, stones: snapshot.selectedStones.length }, null, 1));
  expect(snapshot.svgPresent).toBe(true);
  expect(snapshot.undefinedAttributes).toEqual([]);
});
