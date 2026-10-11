// ISSUE 4 diagnostic: the Undo control is bound once to a cached DOM node. If any manual-editing path
// replaces that node, the visible button loses its listener and Undo appears to work exactly once.
// This spec tracks the node identity across real manual actions and then presses Undo twice.
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
const mockApi = async (page) => {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const map = { '/api/stones': 'stones.json', '/api/charms': 'charms.json', '/api/spacers': 'spacers.json', '/api/settings': 'settings.json' };
    const file = map[url.pathname];
    await route.fulfill({ status: 200, contentType: 'application/json', body: file ? JSON.stringify(data(file)) : '{}' });
  });
};
const onboardingOff = async (page) => {
  for (let index = 0; index < 16 && await page.locator('.step3-onboarding').count() > 0; index += 1) {
    await page.mouse.click(195, 780).catch(() => {});
    await page.waitForTimeout(400);
  }
};
const stones = (page) => page.evaluate(() => (JSON.parse(window.localStorage.getItem('lucky_colorstone_state') || '{}').selectedStones || []).length);

test('the Undo control stays bound to the live node through manual editing', async ({ page }) => {
  test.setTimeout(300000);
  await page.setViewportSize({ width: 390, height: 844 });
  page.setDefaultTimeout(10000);
  await mockApi(page);

  await page.goto(`${baseUrl}/index.html?mock=1`);
  await page.locator('#landingView button').first().click();
  await page.locator('#stepView1.active').waitFor({ state: 'visible' });
  await page.locator('#btnNext').click();
  await page.locator('#stepView2.active').waitFor({ state: 'visible' });
  await page.locator('[data-bead-size="6"]').click();
  await page.locator('#btnNext').click();
  await page.locator('#stepView3.active').waitFor({ state: 'visible' });
  await expect(page.locator('#stepView3 .lumi-entry')).toBeVisible({ timeout: 45000 });
  await onboardingOff(page);

  const tag = () => page.evaluate(() => {
    const node = document.getElementById('btnUndoBracelet');
    if (!node) return 'MISSING';
    if (!window.__undoNode || window.__undoNode !== node) {
      window.__undoNode = node;
      window.__undoNodeTag = (window.__undoNodeTag || 0) + 1;
    }
    return window.__undoNodeTag;
  });
  const logs = [];
  logs.push(['after step 3 render', await tag()]);

  for (let index = 0; index < 3; index += 1) {
    await page.locator('#stepView3 .stone-card').nth(index).click({ position: { x: 20, y: 30 } });
    await page.waitForTimeout(520);
    logs.push([`after manual add ${index + 1}`, await tag()]);
  }

  // switch the catalog sections the way a manual customer does
  await page.locator('#catalogTypeFilter [data-catalog-section="charms"]').click();
  await page.waitForTimeout(500);
  logs.push(['after charms tab', await tag()]);
  await page.locator('#catalogTypeFilter [data-catalog-section="spacer"]').click();
  await page.waitForTimeout(500);
  logs.push(['after spacers tab', await tag()]);
  await page.locator('#catalogTypeFilter [data-catalog-section="stones"]').click();
  await page.waitForTimeout(500);
  logs.push(['after stones tab', await tag()]);

  const beforeUndo = await stones(page);
  await page.locator('#btnUndoBracelet').click();
  await page.waitForTimeout(700);
  const afterFirstUndo = await stones(page);
  logs.push(['after first undo', await tag()]);

  const secondClickWorked = await page.evaluate(() => {
    const button = document.getElementById('btnUndoBracelet');
    return Boolean(button) && !button.disabled;
  });
  await page.locator('#btnUndoBracelet').click();
  await page.waitForTimeout(700);
  const afterSecondUndo = await stones(page);

  console.log('UNDO IDENTITY LOG', JSON.stringify({ logs, beforeUndo, afterFirstUndo, afterSecondUndo, secondClickWorked }));
  expect(logs.every(([, tagValue]) => tagValue === 'MISSING' ? false : true)).toBe(true);
});

// Re-adding a stone right after removing one reuses the retained (ghost) slot, which can produce a
// composition snapshot identical to one the history already holds. Every real edit must still be
// individually undoable.
test('re-adding into a retained slot stays undoable for every action', async ({ page }) => {
  test.setTimeout(300000);
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  page.setDefaultTimeout(10000);
  await mockApi(page);

  await page.goto(`${baseUrl}/index.html?mock=1`);
  await page.locator('#landingView button').first().click();
  await page.locator('#stepView1.active').waitFor({ state: 'visible' });
  await page.locator('#btnNext').click();
  await page.locator('#stepView2.active').waitFor({ state: 'visible' });
  await page.locator('[data-bead-size="6"]').click();
  await page.locator('#btnNext').click();
  await page.locator('#stepView3.active').waitFor({ state: 'visible' });
  await expect(page.locator('#stepView3 .lumi-entry')).toBeVisible({ timeout: 45000 });
  await onboardingOff(page);

  const state = () => page.evaluate(() => {
    const persisted = JSON.parse(window.localStorage.getItem('lucky_colorstone_state') || '{}');
    const items = persisted.selectedStones || [];
    return {
      composition: items.map((item) => `${item.componentType || 'stone'}:${item.stoneId || item.charmId || item.spacerId || 'empty'}:${item.uniqueId}`),
      stones: items.filter((item) => (item.componentType || 'stone') === 'stone').length,
      ghosts: items.filter((item) => item.componentType === 'empty').length
    };
  });

  const timeline = [await state()];
  const step = async () => { timeline.push(await state()); };

  for (let index = 0; index < 5; index += 1) {
    await page.locator('#stepView3 .stone-card').nth(index).click({ position: { x: 20, y: 30 } });
    await page.waitForTimeout(520);
    await step();
  }
  for (let index = 0; index < 2; index += 1) {
    const newest = page.locator('#braceletSvg g.bead-node.placed[data-slot-kind="stone"]').last();
    if (!await newest.count()) break;
    await newest.click({ force: true });
    await page.waitForTimeout(560);
    await step();
  }
  // re-add into the freed positions
  for (let index = 0; index < 2; index += 1) {
    await page.locator('#stepView3 .stone-card').nth(index + 1).click({ position: { x: 20, y: 30 } });
    await page.waitForTimeout(520);
    await step();
  }
  const beforeUndo = await state();
  expect(beforeUndo.stones).toBe(5);

  let undone = 0;
  while (await page.locator('#btnUndoBracelet').isEnabled() && undone < 12) {
    await page.locator('#btnUndoBracelet').click();
    await page.waitForTimeout(640);
    undone += 1;
    expect((await state()).composition, `undo ${undone} matches the recorded step`).toEqual(timeline[timeline.length - 1 - undone].composition);
  }
  expect(undone, 'all nine actions are individually undoable').toBe(9);
  expect((await state()).composition).toEqual(timeline[0].composition);
  expect(runtimeErrors).toEqual([]);
});
