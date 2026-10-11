// ISSUE 4: Undo must walk the whole history of a MANUALLY designed bracelet.
//
// The owner reported that a manually designed bracelet only undoes one edit, while Lucky-generated
// bracelets undo several. This spec reproduces the owner's workflow exactly - an empty manual
// bracelet, >=10 sequential stone additions, a talisman, a spacer, several removals, >=20 distinct
// user actions - and then verifies EVERY intermediate state while undoing back to the manual
// baseline, including the disabled state at the bottom of the history.
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

// Composition + order + price, so every intermediate state can be compared exactly.
const snap = (page) => page.evaluate(() => {
  const persisted = JSON.parse(window.localStorage.getItem('lucky_colorstone_state') || '{}');
  const items = persisted.selectedStones || [];
  const svg = document.querySelector('#braceletSvg');
  const nodes = svg ? [...svg.querySelectorAll('g.bead-node')] : [];
  return {
    composition: items.map((item) => `${item.componentType || 'stone'}:${item.stoneId || item.charmId || item.spacerId || 'empty'}`),
    stones: items.filter((item) => (item.componentType || 'stone') === 'stone').length,
    spacers: items.filter((item) => item.componentType === 'spacer').length,
    charms: items.filter((item) => item.componentType === 'charm').length,
    charmIds: [...(persisted.selectedCharmIds || [])],
    ghosts: items.filter((item) => item.componentType === 'empty').length,
    placed: nodes.filter((node) => node.classList.contains('placed')).length,
    price: document.querySelector('#canvasPriceText')?.textContent || '',
    undoDisabled: document.querySelector('#btnUndoBracelet')?.disabled ?? null
  };
});

const section = { stone: 'stones', charm: 'charms', spacer: 'spacer' };
const cardSelector = {
  stone: '#stoneCatalogGrid [data-stone-id]:visible',
  charm: '[data-charm-id]:visible',
  spacer: '[data-spacer-id]:visible'
};
const selectTab = async (page, tab) => {
  const tabButton = page.locator(`#catalogTypeFilter [data-catalog-section="${section[tab]}"]`);
  // Some sections are only offered for certain bead sizes, so a missing tab is a valid state.
  if (await tabButton.count() === 0) return false;
  await tabButton.click();
  await page.waitForTimeout(400);
  return await page.locator(cardSelector[tab]).count() > 0;
};

test('manual design: >=20 user actions are all undoable with every intermediate state verified', async ({ page }) => {
  test.setTimeout(420000);
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  page.setDefaultTimeout(10000);
  await mockApi(page);
  await reachStep3(page);

  const baseline = await snap(page);
  expect(baseline.stones, 'the manual editor starts empty').toBe(0);
  expect(baseline.undoDisabled, 'nothing to undo before the first edit').toBe(true);

  const timeline = [baseline];
  const pushState = async () => { timeline.push(await snap(page)); };

  // 1. ten sequential stone additions through the catalog grid (manual path, no Lucky)
  for (let index = 0; index < 10; index += 1) {
    await page.locator('#stepView3 .stone-card').nth(index % 6).click({ position: { x: 20, y: 30 } });
    await page.waitForTimeout(520);
    await pushState();
  }
  expect((await snap(page)).stones, 'ten manual additions land').toBe(10);

  // 2. a talisman (charm tab)
  if (await selectTab(page, 'charm')) {
    await page.locator(cardSelector.charm).first().click({ position: { x: 20, y: 30 } });
    await page.waitForTimeout(600);
    await pushState();
    await selectTab(page, 'stone');
  }

  // 3. a spacer
  if (await selectTab(page, 'spacer')) {
    await page.locator(cardSelector.spacer).first().click({ position: { x: 20, y: 30 } });
    await page.waitForTimeout(600);
    await pushState();
    await selectTab(page, 'stone');
  }

  // 4. several removals (each removal returns to a state that was already seen)
  for (let index = 0; index < 4; index += 1) {
    const bead = page.locator('#braceletSvg g.bead-node.placed[data-slot-kind="stone"]').first();
    if (!await bead.count()) break;
    await bead.click({ force: true });
    await page.waitForTimeout(560);
    await pushState();
  }

  // 5. more valid edits until at least 20 distinct user actions exist
  let guard = 0;
  while (timeline.length - 1 < 20 && guard < 24) {
    guard += 1;
    await page.locator('#stepView3 .stone-card').nth(guard % 6).click({ position: { x: 20, y: 30 } });
    await page.waitForTimeout(520);
    await pushState();
  }

  // every recorded action must have changed the composition or the price
  const distinctActions = timeline.filter((entry, index) => index > 0
    && (JSON.stringify(entry.composition) !== JSON.stringify(timeline[index - 1].composition) || entry.price !== timeline[index - 1].price));
  expect(distinctActions.length, 'at least 20 distinct user actions happened').toBeGreaterThanOrEqual(20);

  // 6. undo everything and verify every intermediate state
  let undone = 0;
  while (await page.locator('#btnUndoBracelet').isEnabled()) {
    await page.locator('#btnUndoBracelet').click();
    await page.waitForTimeout(620);
    undone += 1;
    const expected = timeline[timeline.length - 1 - undone];
    const actual = await snap(page);
    expect(actual.composition, `undo ${undone} restores the recorded composition`).toEqual(expected.composition);
    expect(actual.price, `undo ${undone} restores the recorded price`).toBe(expected.price);
    expect(actual.charmIds, `undo ${undone} restores the recorded charms`).toEqual(expected.charmIds);
    if (undone > 40) break;
  }

  const restored = await snap(page);
  expect(undone, 'every user action is individually undoable').toBeGreaterThanOrEqual(20);
  expect(restored.composition, 'the manual baseline is restored exactly').toEqual(baseline.composition);
  expect(restored.stones).toBe(0);
  expect(restored.ghosts).toBe(0);
  expect(restored.price).toBe(baseline.price);
  expect(restored.undoDisabled, 'the button disables only at the bottom of the history').toBe(true);
  expect(runtimeErrors).toEqual([]);
});

// Removals are the pattern the owner used ("remove multiple components"). Removing the component
// that was added last returns the composition to a state the history already recorded, which is
// where a state-comparison duplicate guard silently drops a genuine edit.
test('manual design: removing the components that were just added stays fully undoable', async ({ page }) => {
  test.setTimeout(300000);
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  page.setDefaultTimeout(10000);
  await mockApi(page);
  await reachStep3(page);

  const timeline = [await snap(page)];
  for (let index = 0; index < 3; index += 1) {
    await page.locator('#stepView3 .stone-card').nth(index).click({ position: { x: 20, y: 30 } });
    await page.waitForTimeout(520);
    timeline.push(await snap(page));
  }
  expect(timeline[3].stones).toBe(3);

  for (let index = 0; index < 3; index += 1) {
    const newest = page.locator('#braceletSvg g.bead-node.placed[data-slot-kind="stone"]').last();
    if (!await newest.count()) break;
    await newest.click({ force: true });
    await page.waitForTimeout(560);
    timeline.push(await snap(page));
  }
  expect(timeline[timeline.length - 1].stones, 'all three removals land').toBe(0);

  let undone = 0;
  while (await page.locator('#btnUndoBracelet').isEnabled() && undone < 8) {
    await page.locator('#btnUndoBracelet').click();
    await page.waitForTimeout(640);
    undone += 1;
    const expected = timeline[timeline.length - 1 - undone];
    const actual = await snap(page);
    expect(actual.composition, `undo ${undone} restores composition ${expected.stones} stones`).toEqual(expected.composition);
  }
  expect(undone, 'every add and every removal is individually undoable').toBe(6);
  expect((await snap(page)).stones).toBe(0);
  expect(runtimeErrors).toEqual([]);
});

test('manual design: rapid Undo taps keep walking the history without a delayed timer recreating states', async ({ page }) => {
  test.setTimeout(420000);
  await page.setViewportSize({ width: 390, height: 844 });
  page.setDefaultTimeout(10000);
  await mockApi(page);
  await reachStep3(page);

  const baseline = await snap(page);
  for (let index = 0; index < 12; index += 1) {
    await page.locator('#stepView3 .stone-card').nth(index % 5).click({ position: { x: 20, y: 30 } });
    await page.waitForTimeout(260);
  }
  await page.waitForTimeout(900);
  const edited = await snap(page);
  expect(edited.stones).toBeGreaterThan(6);

  let taps = 0;
  while (await page.locator('#btnUndoBracelet').isEnabled() && taps < 30) {
    await page.locator('#btnUndoBracelet').click({ force: true });
    taps += 1;
  }
  await page.waitForTimeout(1500); // any delayed settle timer would push a state back here
  const afterRapid = await snap(page);
  expect(afterRapid.composition).toEqual(baseline.composition);
  expect(afterRapid.undoDisabled).toBe(true);
});
