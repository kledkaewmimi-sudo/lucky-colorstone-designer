// Compares the Step 3 -> Step 4 transition between the pre-change deployed artifact and the fixed
// candidate, in the same offline harness. Used to prove whether a handoff failure is environmental.
//
//   node .../step4-handoff-compare.mjs <treeDir>
import { chromium } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const tree = path.resolve(process.argv[2] || 'reports/production/full-uat-feature-migration-20261009/reconciled-candidate');
const mode = process.argv[3] || 'lucky';
const mime = (p) => p.endsWith('.html') ? 'text/html; charset=utf-8'
  : p.endsWith('.css') ? 'text/css; charset=utf-8'
  : (p.endsWith('.js') || p.endsWith('.mjs')) ? 'application/javascript; charset=utf-8'
  : p.endsWith('.webp') ? 'image/webp' : p.endsWith('.png') ? 'image/png' : p.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream';

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
  const file = path.resolve(tree, rel);
  if (!file.startsWith(tree) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': mime(file) });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseUrl = 'http://127.0.0.1:' + server.address().port;
const data = (name) => JSON.parse(fs.readFileSync(path.join(tree, 'data', name), 'utf8').replace(/^\uFEFF/, ''));

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'th-TH' });
const page = await context.newPage();
const problems = [];
page.on('pageerror', (error) => problems.push('pageerror: ' + error.message));
page.on('console', (message) => { if (message.type() === 'error') problems.push('console: ' + message.text().slice(0, 120)); });
await page.route('**/api/**', async (route) => {
  const url = new URL(route.request().url());
  const map = { '/api/stones': 'stones.json', '/api/charms': 'charms.json', '/api/spacers': 'spacers.json', '/api/settings': 'settings.json' };
  const file = map[url.pathname];
  await route.fulfill({ status: 200, contentType: 'application/json', body: file ? JSON.stringify(data(file)) : '{}' });
});

const report = (tag) => page.evaluate((label) => ({
  tag: label,
  step3: Boolean(document.querySelector('#stepView3.active')),
  step4: Boolean(document.querySelector('#stepView4.active')),
  toast: [...document.querySelectorAll('.toast, [class*="toast"]')].map((node) => node.textContent.trim()).filter(Boolean).slice(0, 1)
}), tag);

const steps = [];
try {
  await page.goto(baseUrl + '/index.html?mock=1');
  await page.locator('#landingView button').first().click();
  await page.locator('#btnNext').click();
  await page.locator('[data-bead-size="6"]').click();
  await page.locator('#btnNext').click();
  await page.locator('#stepView3.active').waitFor({ state: 'visible', timeout: 45000 });
  await page.locator('#stepView3 .lumi-entry').waitFor({ state: 'visible', timeout: 45000 });
  for (let i = 0; i < 14 && await page.locator('.step3-onboarding').count() > 0; i += 1) { await page.mouse.click(195, 780).catch(() => {}); await page.waitForTimeout(400); }
  if (mode === 'manual') {
    for (let i = 0; i < 3; i += 1) { await page.locator('#stepView3 .stone-card').first().click({ position: { x: 20, y: 30 } }); await page.waitForTimeout(500); }
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      if (await page.locator('#stepView4.active').count()) break;
      await page.locator('#btnNext').click();
      await page.waitForTimeout(2500);
      steps.push(await report('manual-next-' + attempt));
    }
    throw new Error('MANUAL-NEXT-COMPLETE');
  }
  await page.locator('#stepView3 .lumi-entry').click();
  await page.locator('.lucky-page1').waitFor({ state: 'visible', timeout: 25000 });
  await page.locator('[data-lumi-weekday="monday"]').click();
  await page.locator('[data-lumi-birth-date]').selectOption('1');
  await page.locator('[data-lumi-birth-month]').selectOption('1');
  await page.locator('[data-lumi-birth-year]').selectOption('1990');
  if (await page.locator('[data-lumi-style="charm"]').getAttribute('aria-pressed') !== 'true') await page.locator('[data-lumi-style="charm"]').click();
  await page.locator('.lucky-page1-actions [data-lumi-action="goals"]').click();
  const goal = page.locator('[data-lumi-goal="love"]');
  await goal.click({ position: { x: 6, y: 6 } });
  if (await goal.getAttribute('aria-pressed') !== 'true') await goal.evaluate((node) => node.click());
  await page.locator('.lucky-page2-actions [data-lumi-action="generate"]').click();
  await page.locator('.lucky-page3').waitFor({ state: 'visible', timeout: 90000 });
  await page.locator('.lucky-page3-actions [data-lumi-action="use"]').click();
  await page.waitForTimeout(2500);
  steps.push(await report('after-accept (pre-fix build auto-navigates here)'));
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (await page.locator('#stepView4.active').count()) break;
    await page.locator('#btnNext').click();
    await page.waitForTimeout(2500);
    steps.push(await report('explicit-next-' + attempt));
  }
  // If this build auto-navigated, go back to Step 3 and use the manual Next button, so the delayed
  // manual path can be compared with the fixed build's behaviour.
  if (await page.locator('#stepView4.active').count()) {
    await page.locator('#btnBack').click();
    await page.waitForTimeout(3000);
    for (let i = 0; i < 14 && await page.locator('.step3-onboarding').count() > 0; i += 1) { await page.mouse.click(195, 780).catch(() => {}); await page.waitForTimeout(400); }
    steps.push(await report('back-on-step3'));
    await page.locator('#btnNext').click();
    await page.waitForTimeout(2500);
    steps.push(await report('manual-next-after-autonav'));
  }
} catch (error) {
  if (String(error?.message) !== 'MANUAL-NEXT-COMPLETE') steps.push({ error: String(error?.message || error).slice(0, 200) });
} finally {
  await browser.close();
  server.close();
}
console.log('TREE ' + tree);
console.log(JSON.stringify({ steps, problems }, null, 1));
