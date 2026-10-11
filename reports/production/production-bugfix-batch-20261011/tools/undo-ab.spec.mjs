// TASK A1 measurement spec: one Undo click must reverse exactly one user action.
//
// Serves the variant tree it is run from, builds a synthetic bracelet (8 additions), performs 4 bead
// removals by touch tap, then presses Undo until the button disables while recording the visible
// placed-bead count after every step. The expected trajectory is the oracle:
//   removals: 7,6,5,4   undos: 5,6,7,8 (the removals) then 7,6,5,4,3,2,1,0 (the additions)
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

test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

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
const snapshot = (page) => page.evaluate(() => {
  const persisted = JSON.parse(window.localStorage.getItem('lucky_colorstone_state') || '{}');
  const items = persisted.selectedStones || [];
  return {
    placed: document.querySelectorAll('#braceletSvg g.bead-node.placed').length,
    stones: items.filter((item) => (item.componentType || 'stone') === 'stone').length,
    empties: items.filter((item) => item.componentType === 'empty').length,
    price: (document.querySelector('#canvasPriceText')?.textContent || '').trim(),
    undoDisabled: document.querySelector('#btnUndoBracelet')?.disabled ?? null
  };
});

test('one undo reverses exactly one action (touch removals)', async ({ page }) => {
  test.setTimeout(420000);
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const map = { '/api/stones': 'stones.json', '/api/charms': 'charms.json', '/api/spacers': 'spacers.json', '/api/settings': 'settings.json' };
    const file = map[url.pathname];
    await route.fulfill({ status: 200, contentType: 'application/json', body: file ? JSON.stringify(data(file)) : '{}' });
  });

  await page.goto(`${baseUrl}/index.html?mock=1`);
  await page.locator('#landingView button').first().click();
  await page.locator('#stepView1.active').waitFor({ state: 'visible' });
  await page.locator('#btnNext').click();
  await page.locator('#stepView2.active').waitFor({ state: 'visible' });
  await page.locator('[data-bead-size="6"]').click();
  await page.locator('#btnNext').click();
  await page.locator('#stepView3.active').waitFor({ state: 'visible' });
  await expect(page.locator('#stepView3 .lumi-entry')).toBeVisible({ timeout: 45000 });
  for (let index = 0; index < 16 && await page.locator('.step3-onboarding').count() > 0; index += 1) {
    await page.mouse.click(195, 780).catch(() => {});
    await page.waitForTimeout(400);
  }

  const additions = [];
  for (let index = 0; index < 8; index += 1) {
    await page.locator('#stepView3 .stone-card').nth(index % 6).click({ position: { x: 20, y: 30 } });
    await page.waitForTimeout(420);
    additions.push((await snapshot(page)).placed);
  }

  const removals = [];
  const tapBead = async () => {
    const target = page.locator('#braceletSvg g.bead-node.placed[data-slot-kind="stone"]').nth(2);
    if (!await target.count()) return false;
    await target.tap();
    await page.waitForTimeout(560);
    return true;
  };
  for (let index = 0; index < 4; index += 1) {
    if (!await tapBead()) break;
    removals.push((await snapshot(page)).placed);
  }

  const undoTrajectory = [];
  let guard = 0;
  while (await page.locator('#btnUndoBracelet').isEnabled() && guard < 40) {
    guard += 1;
    await page.locator('#btnUndoBracelet').click();
    await page.waitForTimeout(620);
    undoTrajectory.push((await snapshot(page)).placed);
  }

  const finalState = await snapshot(page);
  const report = {
    additions,
    removals,
    undoTrajectory,
    finalState,
    runtimeErrors,
    expectedUndoTrajectory: [5, 6, 7, 8, 7, 6, 5, 4, 3, 2, 1, 0]
  };
  console.log('UNDO-AB RESULT ' + JSON.stringify(report));
  expect(runtimeErrors).toEqual([]);
});
