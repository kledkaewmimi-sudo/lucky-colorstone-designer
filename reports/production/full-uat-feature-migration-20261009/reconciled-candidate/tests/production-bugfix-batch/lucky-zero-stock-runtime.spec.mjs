// Runtime (browser) evidence for the 2026-10-11 design-eligibility policy: with the served catalog
// holding ZERO stock for every active stone and charm, Lucky must still produce and apply a valid
// design for a luck + love goal set, still anchor Lucky Clover, and never use Pyrite.
//
// This is the runtime counterpart of the offline coverage matrix: the same engine files that the
// 3,528-case matrix imports are the files this page loads, but here the real UI, the real catalog
// plumbing and the real Step-3 import/acceptance path run in Chromium.
import { test, expect } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
let server;
let baseUrl;
const mime = (file) => (file.endsWith('.html') ? 'text/html; charset=utf-8'
  : file.endsWith('.css') ? 'text/css; charset=utf-8'
    : (file.endsWith('.js') || file.endsWith('.mjs')) ? 'application/javascript; charset=utf-8'
      : file.endsWith('.webp') ? 'image/webp'
        : file.endsWith('.png') ? 'image/png'
          : file.endsWith('.json') ? 'application/json; charset=utf-8'
            : 'application/octet-stream');

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const file = path.resolve(root, relative);
    if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': mime(file) });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(() => server?.close());

const data = (name) => JSON.parse(fs.readFileSync(path.resolve(root, 'data', name), 'utf8').replace(/^\uFEFF/, ''));
const zeroStock = (records) => records.map((record) => ({
  ...record,
  inStock: false,
  stockQty: 0,
  stock_qty: 0,
  availability: { ...(record.availability || {}), inStock: false, stockQty: 0, stock_qty: 0 }
}));

const mockZeroStockApi = async (page, { zero = true } = {}) => {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const map = { '/api/stones': 'stones.json', '/api/charms': 'charms.json', '/api/spacers': 'spacers.json' };
    const file = map[url.pathname];
    if (url.pathname === '/api/settings') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ globalDiscountPercent: 0, discountEnabled: false, showDiscountBanner: false }) });
      return;
    }
    const records = file ? data(file) : [];
    const body = zero ? zeroStock(records) : records;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
};

const onboardingOff = async (page) => {
  for (let index = 0; index < 16 && await page.locator('.step3-onboarding').count() > 0; index += 1) {
    await page.mouse.click(195, 780).catch(() => {});
    await page.waitForTimeout(400);
  }
};

const reachStep3 = async (page, bead = '6') => {
  await page.goto(`${baseUrl}/index.html?mock=1`);
  await page.locator('#landingView button').first().click();
  await page.locator('#stepView1.active').waitFor({ state: 'visible' });
  await page.locator('#btnNext').click();
  await page.locator('#stepView2.active').waitFor({ state: 'visible' });
  await page.locator(`[data-bead-size="${bead}"]`).click();
  await page.locator('#btnNext').click();
  await page.locator('#stepView3.active').waitFor({ state: 'visible' });
  await expect(page.locator('#stepView3 .lumi-entry')).toBeVisible({ timeout: 45000 });
  await onboardingOff(page);
};

const state = (page) => page.evaluate(() => {
  const persisted = JSON.parse(window.localStorage.getItem('lucky_colorstone_state') || '{}');
  return {
    stoneIds: (persisted.selectedStones || []).map((item) => item.stoneId || item.id).filter(Boolean),
    // Anchored charms live in selectedCharmIds; loop talismans (bee_heart, e.g. Lucky Clover) are
    // placed in the ring as charm items.
    charmIds: [
      ...(persisted.selectedCharmIds || []),
      ...(persisted.selectedStones || []).filter((item) => item.componentType === 'charm').map((item) => item.charmId)
    ].filter(Boolean),
    step3: Boolean(document.querySelector('#stepView3.active')),
    step4: Boolean(document.querySelector('#stepView4.active'))
  };
});

test('runtime: a fully zero-stock but active catalog still yields an applicable Lucky design', async ({ page }) => {
  test.setTimeout(300000);
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await mockZeroStockApi(page, { zero: process.env.LUCKY_RUNTIME_STOCK !== 'in-stock' });
  await reachStep3(page);

  await page.locator('#stepView3 .lumi-entry').click();
  await page.locator('.lucky-page1').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('[data-lumi-weekday="monday"]').click();
  await page.locator('[data-lumi-birth-date]').selectOption('1');
  await page.locator('[data-lumi-birth-month]').selectOption('1');
  await page.locator('[data-lumi-birth-year]').selectOption('1990');
  const style = process.env.LUCKY_RUNTIME_STYLE === 'stone' ? 'stone' : 'charm';
  if (await page.locator(`[data-lumi-style="${style}"]`).getAttribute('aria-pressed') !== 'true') await page.locator(`[data-lumi-style="${style}"]`).click();
  await page.locator('.lucky-page1-actions [data-lumi-action="goals"]').click();

  const goals = (process.env.LUCKY_RUNTIME_GOALS || 'luck').split(',');
  for (const goal of goals) {
    const button = page.locator(`[data-lumi-goal="${goal}"]`);
    await button.waitFor({ state: 'attached', timeout: 25000 });
    for (let attempt = 0; attempt < 4 && await button.getAttribute('aria-pressed') !== 'true'; attempt += 1) {
      await button.evaluate((node) => node.click());
      await page.waitForTimeout(400);
    }
  }

  await page.locator('.lucky-page2-actions [data-lumi-action="generate"]').click();
  // Zero stock must not block the result page.
  await expect(page.locator('.lucky-page3')).toBeVisible({ timeout: 120000 });
  const page3Text = await page.locator('.lucky-page3').innerText();
  expect(page3Text.toLowerCase()).not.toContain('undefined');

  await page.locator('.lucky-page3-actions [data-lumi-action="use"]').click();
  await page.waitForTimeout(1500);
  if (await page.locator('.lumi-replace').isVisible().catch(() => false)) {
    await page.locator('.lumi-replace [data-lumi-action="commit"]').click();
    await page.waitForTimeout(2500);
  }

  const applied = await state(page);
  expect(applied.step3, 'the accepted design stays on Step 3').toBe(true);
  expect(applied.step4).toBe(false);
  expect(applied.stoneIds.length).toBeGreaterThan(10);
  expect(applied.stoneIds).not.toContain('pyrite');
  expect(applied.charmIds).toContain('cl01');
  expect(runtimeErrors).toEqual([]);
});
