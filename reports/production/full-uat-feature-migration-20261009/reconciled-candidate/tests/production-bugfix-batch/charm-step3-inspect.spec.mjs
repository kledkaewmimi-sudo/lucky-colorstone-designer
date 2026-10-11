import { test, expect } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

// Focused inspection: accept a Lucky design that contains an anchored talisman/charm, then dump what
// Step 3 renders so the "undefined" defect can be pinned to a concrete node.
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

test('inspect Step 3 after an anchored-charm Lucky design is accepted', async ({ page }) => {
  test.setTimeout(240000);
  const problems = [];
  page.on('pageerror', (error) => problems.push('pageerror: ' + error.message));
  page.on('console', (message) => { if (message.type() === 'error') problems.push('console: ' + message.text()); });
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
  for (let i = 0; i < 14 && await page.locator('.step3-onboarding').count() > 0; i += 1) { await page.mouse.click(195, 760).catch(() => {}); await page.waitForTimeout(400); }

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
  await expect(page.locator('.lucky-page3')).toBeVisible({ timeout: 60000 });
  await page.locator('.lucky-page3-actions [data-lumi-action="use"]').click();
  await expect(page.locator('.lumi-shell')).toHaveCount(0, { timeout: 30000 });
  await page.waitForTimeout(2000);

  const inspect = async (label) => {
    const result = await page.evaluate(() => {
      const html = document.body.innerHTML;
      const hits = [];
      let index = html.indexOf('undefined');
      while (index >= 0 && hits.length < 25) { hits.push(html.slice(Math.max(0, index - 90), index + 40)); index = html.indexOf('undefined', index + 1); }
      const brokenImages = [...document.querySelectorAll('img')]
        .filter((img) => !img.getAttribute('src') || img.naturalWidth === 0)
        .map((img) => ({ src: img.getAttribute('src'), cls: img.className, connected: img.isConnected }));
      const charmNodes = [...document.querySelectorAll('#stepView3 [data-charm-id], #stepView3 [class*="charm"], #stepView3 [class*="hanging"]')]
        .map((node) => ({ tag: node.tagName, cls: node.className, html: node.outerHTML.slice(0, 200) }));
      const priceNodes = [...document.querySelectorAll('[class*="price"], [class*="total"], [id*="rice"]')]
        .map((node) => ({ id: node.id, cls: node.className, text: node.textContent.replace(/\s+/g, ' ').trim().slice(0, 120) }));
      return {
        activeStep3: Boolean(document.querySelector('#stepView3.active')),
        activeStep4: Boolean(document.querySelector('#stepView4.active')),
        undefinedHits: hits,
        brokenImages,
        charmNodes: charmNodes.slice(0, 12),
        priceNodes: priceNodes.slice(0, 12),
        storedState: (() => { try { return JSON.parse(window.localStorage.getItem('lucky_colorstone_state') || '{}'); } catch (error) { return { error: String(error.message) }; } })()
      };
    });
    console.log('INSPECT ' + label + ' ' + JSON.stringify(result, null, 1).slice(0, 6000));
    await page.screenshot({ path: `tests/production-bugfix-batch/evidence/inspect-${label}.png`, fullPage: true });
  };

  await inspect('after-accept');
  await page.locator('#btnBack').click();
  await page.waitForTimeout(1500);
  for (let i = 0; i < 14 && await page.locator('.step3-onboarding').count() > 0; i += 1) { await page.mouse.click(195, 760).catch(() => {}); await page.waitForTimeout(400); }
  await inspect('back-on-step3');
  console.log('PROBLEMS ' + JSON.stringify(problems));
});
