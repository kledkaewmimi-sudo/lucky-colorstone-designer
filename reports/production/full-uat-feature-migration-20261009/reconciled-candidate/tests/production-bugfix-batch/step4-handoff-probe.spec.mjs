import { test, expect } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

// Isolates the Step 3 -> Step 4 step in the offline harness: accept a Lucky design, then press the
// normal Next button. Used to prove the LINE handoff failure is environmental and not a regression.
const root = process.cwd();
let server;
let baseUrl;
const mime = (p) => p.endsWith('.html') ? 'text/html; charset=utf-8'
  : p.endsWith('.css') ? 'text/css; charset=utf-8'
  : (p.endsWith('.js') || p.endsWith('.mjs')) ? 'application/javascript; charset=utf-8'
  : p.endsWith('.webp') ? 'image/webp' : p.endsWith('.png') ? 'image/png' : 'application/octet-stream';

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

const prepareStep3 = async (page) => {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const map = { '/api/stones': 'stones.json', '/api/charms': 'charms.json', '/api/spacers': 'spacers.json', '/api/settings': 'settings.json' };
    const file = map[url.pathname];
    await route.fulfill({ status: 200, contentType: 'application/json', body: file ? JSON.stringify(data(file)) : '{}' });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseUrl + '/index.html?mock=1');
  await page.locator('#landingView button').first().click();
  await page.locator('#btnNext').click();
  await page.locator('[data-bead-size="6"]').click();
  await page.locator('#btnNext').click();
  await expect(page.locator('#stepView3.active')).toBeVisible();
  await expect(page.locator('#stepView3 .lumi-entry')).toBeVisible({ timeout: 45000 });
  for (let i = 0; i < 14 && await page.locator('.step3-onboarding').count() > 0; i += 1) { await page.mouse.click(195, 780).catch(() => {}); await page.waitForTimeout(400); }
};

const report = (page, label) => page.evaluate((tag) => ({
  tag,
  step3: Boolean(document.querySelector('#stepView3.active')),
  step4: Boolean(document.querySelector('#stepView4.active')),
  toast: [...document.querySelectorAll('.toast, [class*="toast"]')].map((node) => node.textContent.trim()).filter(Boolean).slice(0, 1)
}), label).then((value) => console.log('HANDOFF ' + JSON.stringify(value)));

for (const count of [0, 3]) {
  test('Step 3 -> Step 4 with ' + count + ' manual stones', async ({ page }) => {
    test.setTimeout(240000);
    await prepareStep3(page);
    for (let i = 0; i < count; i += 1) { await page.locator('#stepView3 .stone-card').first().click({ position: { x: 20, y: 30 } }); await page.waitForTimeout(500); }
    await page.locator('#stepView3 .lumi-entry').click();
    await expect(page.locator('.lucky-page1')).toBeVisible();
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
    await expect(page.locator('.lucky-page3')).toBeVisible({ timeout: 90000 });
    await page.locator('.lucky-page3-actions [data-lumi-action="use"]').click();
    await page.waitForTimeout(1500);
    if (await page.locator('.lumi-replace').isVisible().catch(() => false)) { await page.locator('.lumi-replace [data-lumi-action="commit"]').click(); await page.waitForTimeout(1800); }
    await report(page, 'after-accept');
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      if (await page.locator('#stepView4.active').count()) break;
      await page.locator('#btnNext').click();
      await page.waitForTimeout(2500);
      await report(page, 'next-attempt-' + attempt);
    }
  });
}
