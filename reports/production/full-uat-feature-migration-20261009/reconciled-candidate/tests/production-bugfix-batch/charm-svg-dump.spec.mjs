import { test, expect } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

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

test('dump anchored charm SVG nodes after a Lucky charm design', async ({ page }) => {
  test.setTimeout(240000);
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
  await expect(page.locator('#stepView3 .lumi-entry')).toBeVisible({ timeout: 45000 });
  for (let i = 0; i < 14 && await page.locator('.step3-onboarding').count() > 0; i += 1) { await page.mouse.click(195, 760).catch(() => {}); await page.waitForTimeout(400); }
  await page.locator('#stepView3 .lumi-entry').click();
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
  await page.waitForTimeout(2000);
  if (await page.locator('#stepView4.active').count()) { await page.locator('#btnBack').click(); await page.waitForTimeout(1500); }
  for (let i = 0; i < 14 && await page.locator('.step3-onboarding').count() > 0; i += 1) { await page.mouse.click(195, 760).catch(() => {}); await page.waitForTimeout(400); }

  const dump = await page.evaluate(() => {
    const svg = document.querySelector('#braceletSvg');
    const nodes = [...svg.querySelectorAll('*')];
    const charmRefs = nodes.filter((node) => {
      const attrs = [...node.attributes].map((a) => a.value).join(' ');
      return /tg01|charm/i.test(attrs) || /charm/i.test(node.className?.baseVal || node.className || '');
    });
    return {
      totalNodes: nodes.length,
      charmRefCount: charmRefs.length,
      charmOuter: charmRefs.slice(0, 40).map((node) => node.outerHTML.slice(0, 300))
    };
  });
  console.log('SVGDUMP ' + JSON.stringify(dump, null, 1).slice(0, 8000));
});
