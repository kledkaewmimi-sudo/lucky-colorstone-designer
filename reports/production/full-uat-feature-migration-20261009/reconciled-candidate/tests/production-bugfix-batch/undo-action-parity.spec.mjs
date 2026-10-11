// TASK A3: one Undo click must reverse exactly one user action, for every action kind.
//
// Every user action is recorded as an observable state (placed beads, stones, charms, ghost slots,
// price). Undo is then pressed until the control disables and the trajectory is compared with those
// recorded states in reverse - an action-by-action oracle, not "the button reacted".
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
const mockApi = async (page) => {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const map = { '/api/stones': 'stones.json', '/api/charms': 'charms.json', '/api/spacers': 'spacers.json', '/api/settings': 'settings.json' };
    const file = map[url.pathname];
    await route.fulfill({ status: 200, contentType: 'application/json', body: file ? JSON.stringify(data(file)) : '{}' });
  });
};
const state = (page) => page.evaluate(() => {
  const persisted = JSON.parse(window.localStorage.getItem('lucky_colorstone_state') || '{}');
  const items = persisted.selectedStones || [];
  return {
    placed: document.querySelectorAll('#braceletSvg g.bead-node.placed').length,
    placedStones: document.querySelectorAll('#braceletSvg g.bead-node.placed[data-slot-kind="stone"]').length,
    stones: items.filter((item) => (item.componentType || 'stone') === 'stone').length,
    charms: items.filter((item) => item.componentType === 'charm').length + (persisted.selectedCharmIds || []).length,
    ghosts: items.filter((item) => item.componentType === 'empty').length,
    price: (document.querySelector('#canvasPriceText')?.textContent || '').trim(),
    undoDisabled: document.querySelector('#btnUndoBracelet')?.disabled ?? null
  };
});
const openEditor = async (page) => {
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
  for (let index = 0; index < 16 && await page.locator('.step3-onboarding').count() > 0; index += 1) {
    await page.mouse.click(195, 780).catch(() => {});
    await page.waitForTimeout(400);
  }
};
const addStone = async (page, index, wait = 420) => {
  const card = page.locator('#stepView3 .stone-card').nth(index % 6);
  // On short viewports the sticky preview card can cover the catalog; centre the card first so the
  // click reaches it exactly like a customer scroll-then-tap does.
  await card.evaluate((node) => node.scrollIntoView({ block: 'center' })).catch(() => {});
  await page.waitForTimeout(80);
  await card.click({ position: { x: 20, y: 30 } });
  await page.waitForTimeout(wait);
};
const removeBead = async (page, { wait = 560, position = 2 } = {}) => {
  const target = page.locator('#braceletSvg g.bead-node.placed[data-slot-kind="stone"]').nth(position);
  if (!await target.count()) return false;
  await target.tap();
  await page.waitForTimeout(wait);
  return true;
};
const undoOnce = async (page, wait = 600) => {
  await page.locator('#btnUndoBracelet').click();
  await page.waitForTimeout(wait);
  return state(page);
};

// Returns the index of a placed bead whose centre is comfortably inside the visible viewport (the ring
// can sit under the sticky preview card, which would otherwise stall a tap on actionability).
const tappableBeadIndex = (page) => page.evaluate(() => {
  const nodes = [...document.querySelectorAll('#braceletSvg g.bead-node.placed[data-slot-kind="stone"]')];
  const limit = window.innerHeight - 140;
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const rect = nodes[index].getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    if (centerY > 240 && centerY < limit && centerX > 12 && centerX < window.innerWidth - 12) return index;
  }
  return nodes.length - 1;
});

// states[0] is the starting bracelet; states[i] is the state after action i. The first Undo must
// restore states[n-1] (the state before the last action).
const verifyUndoParity = async (page, states, label, { maxSteps = 80 } = {}) => {
  const trajectory = [];
  let guard = 0;
  while (await page.locator('#btnUndoBracelet').isEnabled() && guard < maxSteps) {
    guard += 1;
    trajectory.push(await undoOnce(page));
  }
  const expected = [...states].reverse().slice(1);
  const divergence = trajectory.findIndex((entry, index) => (
    index >= expected.length
    || entry.placed !== expected[index].placed
    || entry.price !== expected[index].price
    || entry.charms !== expected[index].charms
    || entry.stones !== expected[index].stones
  ));
  console.log('UNDO-PARITY ' + JSON.stringify({
    label,
    actions: states.length - 1,
    undoSteps: trajectory.length,
    placedTrajectory: trajectory.map((entry) => entry.placed).slice(0, 24),
    expectedPlaced: expected.map((entry) => entry.placed).slice(0, 24),
    divergenceAt: divergence
  }));
  expect(divergence, `${label}: undo step ${divergence + 1} must restore exactly the previous action`).toBe(-1);
  expect(trajectory.length, `${label}: every action must be undoable`).toBe(expected.length);
  return trajectory;
};

test('20 consecutive manual additions undo one action at a time', async ({ page }) => {
  test.setTimeout(420000);
  await openEditor(page);
  const states = [await state(page)];
  for (let index = 0; index < 20; index += 1) {
    await addStone(page, index);
    states.push(await state(page));
  }
  expect(states[states.length - 1].stones).toBe(20);
  await verifyUndoParity(page, states, '20 additions');
});

test('20 consecutive bead removals undo one action at a time', async ({ page }) => {
  test.setTimeout(420000);
  page.setDefaultTimeout(12000);
  await openEditor(page);
  for (let index = 0; index < 24; index += 1) await addStone(page, index, 180);
  await page.waitForTimeout(600);
  const before = await state(page);
  // The ring can sit under the sticky preview card, so each removal targets a bead whose centre is
  // comfortably inside the visible viewport.
  for (let index = 0; index < 20; index += 1) {
    const target = await tappableBeadIndex(page);
    if (target < 0) break;
    await page.locator('#braceletSvg g.bead-node.placed[data-slot-kind="stone"]').nth(target).tap();
    await page.waitForTimeout(220);
  }
  await page.waitForTimeout(600);
  const after = await state(page);
  expect(after.placedStones).toBe(before.placedStones - 20);

  const increments = [];
  let previous = after.placed;
  for (let index = 0; index < 20; index += 1) {
    const current = (await undoOnce(page, 620)).placed;
    increments.push(current - previous);
    previous = current;
  }
  console.log('UNDO-REMOVALS ' + JSON.stringify({ beforePlaced: before.placed, afterPlaced: after.placed, increments }));
  expect(increments, 'each removal is undone by exactly one press, one bead at a time').toEqual(new Array(20).fill(1));
  expect(previous).toBe(before.placed);
});

test('mixed add / remove sequence undoes one action at a time', async ({ page }) => {
  test.setTimeout(420000);
  await openEditor(page);
  const states = [await state(page)];
  for (let index = 0; index < 8; index += 1) {
    await addStone(page, index);
    states.push(await state(page));
  }
  const actions = ['add', 'add', 'remove', 'add', 'remove', 'remove', 'add', 'remove'];
  for (let index = 0; index < actions.length; index += 1) {
    if (actions[index] === 'add') await addStone(page, index + 3);
    else await removeBead(page);
    states.push(await state(page));
  }
  await verifyUndoParity(page, states, 'mixed sequence');
});

test('rapid taps and double taps each record exactly one action', async ({ page }) => {
  test.setTimeout(420000);
  await openEditor(page);
  for (let index = 0; index < 14; index += 1) await addStone(page, index);
  const beforeBurst = await state(page);
  for (let index = 0; index < 4; index += 1) await removeBead(page, { wait: 120 });
  await page.waitForTimeout(900);
  const afterBurst = await state(page);
  expect(afterBurst.placed, 'four rapid taps remove four beads').toBe(beforeBurst.placed - 4);
  await removeBead(page, { wait: 60 });
  await removeBead(page, { wait: 700 });
  const afterDoubleTap = await state(page);
  // Two separate taps are two user actions, each removing exactly one bead (never more - that is what
  // the duplicate-event guard protects) and each being exactly one Undo step.
  expect(afterDoubleTap.placed, 'two rapid taps remove exactly two beads').toBe(afterBurst.placed - 2);

  const increments = [];
  let previous = afterDoubleTap.placed;
  for (let index = 0; index < 6; index += 1) {
    const current = (await undoOnce(page, 700)).placed;
    increments.push(current - previous);
    previous = current;
  }
  console.log('UNDO-RAPID ' + JSON.stringify({ beforeBurst: beforeBurst.placed, afterBurst: afterBurst.placed, afterDoubleTap: afterDoubleTap.placed, increments }));
  expect(increments, 'each rapid action adds exactly one bead back').toEqual([1, 1, 1, 1, 1, 1]);
  expect(previous).toBe(beforeBurst.placed);
});

test('touch interaction never removes a bead accidentally and the catalog still scrolls', async ({ page }) => {
  test.setTimeout(300000);
  page.setDefaultTimeout(12000);
  await openEditor(page);
  for (let index = 0; index < 8; index += 1) await addStone(page, index);
  const before = await state(page);

  // Scrolling the catalog must never change the bracelet composition.
  await page.locator('#stoneCatalogGrid').hover();
  await page.mouse.wheel(0, 240);
  await page.waitForTimeout(500);
  const afterScroll = await state(page);
  expect(afterScroll.placed).toBe(before.placed);
  expect(afterScroll.stones).toBe(before.stones);

  // The bead nodes must own their gestures (no double-tap-zoom delay) for the tap path to stay
  // immediate on iOS.
  const touchAction = await page.locator('#braceletSvg g.bead-node.placed').first().evaluate((node) => getComputedStyle(node).touchAction);
  expect(touchAction).toBe('manipulation');
});

test('talisman insertion and removal are each one undoable action', async ({ page }) => {
  test.setTimeout(420000);
  await openEditor(page);
  const states = [await state(page)];
  for (let index = 0; index < 10; index += 1) {
    await addStone(page, index);
    states.push(await state(page));
  }
  await page.locator('#catalogTypeFilter [data-catalog-section="charms"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-charm-id]:visible').first().click({ position: { x: 20, y: 30 } });
  await page.waitForTimeout(700);
  states.push(await state(page));
  expect(states[states.length - 1].charms).toBeGreaterThan(states[0].charms);
  await page.locator('#catalogTypeFilter [data-catalog-section="stones"]').click();
  await page.waitForTimeout(400);
  await removeBead(page);
  states.push(await state(page));
  await verifyUndoParity(page, states, 'talisman insert + removal');
});

test('Lucky acceptance then manual editing keeps one action per Undo', async ({ page }) => {
  test.setTimeout(420000);
  await openEditor(page);
  const states = [await state(page)];
  await page.locator('#stepView3 .lumi-entry').click();
  await page.locator('.lucky-page1').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('[data-lumi-weekday="monday"]').click();
  await page.locator('[data-lumi-birth-date]').selectOption('1');
  await page.locator('[data-lumi-birth-month]').selectOption('1');
  await page.locator('[data-lumi-birth-year]').selectOption('1990');
  await page.locator('.lucky-page1-actions [data-lumi-action="goals"]').click();
  const goal = page.locator('[data-lumi-goal="luck"]');
  await goal.waitFor({ state: 'attached', timeout: 25000 });
  for (let attempt = 0; attempt < 4 && await goal.getAttribute('aria-pressed') !== 'true'; attempt += 1) {
    await goal.evaluate((node) => node.click());
    await page.waitForTimeout(400);
  }
  await page.locator('.lucky-page2-actions [data-lumi-action="generate"]').click();
  await expect(page.locator('.lucky-page3')).toBeVisible({ timeout: 120000 });
  await page.locator('.lucky-page3-actions [data-lumi-action="use"]').click();
  await page.waitForTimeout(1800);
  if (await page.locator('.lumi-replace').isVisible().catch(() => false)) {
    await page.locator('.lumi-replace [data-lumi-action="commit"]').click();
    await page.waitForTimeout(2500);
  }
  states.push(await state(page));
  expect(states[1].stones).toBeGreaterThan(10);
  for (let index = 0; index < 3; index += 1) {
    await removeBead(page);
    states.push(await state(page));
  }
  await addStone(page, 2);
  states.push(await state(page));
  await verifyUndoParity(page, states, 'Lucky then manual edits');
});

test('desktop mouse addition and removal are each one undoable action', async ({ page }) => {
  test.setTimeout(420000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await openEditor(page);
  const states = [await state(page)];
  for (let index = 0; index < 6; index += 1) {
    await page.locator('#stepView3 .stone-card').nth(index).click();
    await page.waitForTimeout(420);
    states.push(await state(page));
  }
  for (let index = 0; index < 3; index += 1) {
    // The sticky preview card overlays part of the ring on a desktop viewport; this suite measures
    // Undo parity, so the click is delivered to the bead directly (tap reachability at narrow widths
    // is covered by ios-bead-removal-latency.spec.mjs).
    await page.locator('#braceletSvg g.bead-node.placed[data-slot-kind="stone"]').nth(2).click({ force: true });
    await page.waitForTimeout(560);
    states.push(await state(page));
  }
  await verifyUndoParity(page, states, 'desktop mouse');
});

test('keyboard navigation never removes a bead accidentally', async ({ page }) => {
  test.setTimeout(300000);
  page.setDefaultTimeout(12000);
  await openEditor(page);
  for (let index = 0; index < 6; index += 1) await addStone(page, index);
  const before = await state(page);
  // Tabbing through the editor must not activate destructive controls.
  for (let index = 0; index < 10; index += 1) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(600);
  const after = await state(page);
  expect(after.placed).toBe(before.placed);
  expect(after.undoDisabled).toBe(false);

  // The Undo control is keyboard reachable and performs exactly one action.
  await page.locator('#btnUndoBracelet').focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(650);
  expect((await state(page)).placed).toBe(before.placed - 1);
});

test('narrow iPhone viewport keeps one action per Undo', async ({ page }) => {
  test.setTimeout(420000);
  page.setDefaultTimeout(12000);
  await openEditor(page);
  const states = [await state(page)];
  // Build the bracelet at the standard width, then verify the narrow iPhone width: the sticky preview
  // card covers part of the catalog at 320x568 in this harness, but the removal + Undo path (what the
  // narrow viewport must keep intact) is exercised here at that exact size.
  for (let index = 0; index < 8; index += 1) {
    await addStone(page, index);
    states.push(await state(page));
  }
  await page.setViewportSize({ width: 320, height: 568 });
  await page.waitForTimeout(400);
  for (let index = 0; index < 3; index += 1) {
    const target = await tappableBeadIndex(page);
    if (target < 0) break;
    await page.locator('#braceletSvg g.bead-node.placed[data-slot-kind="stone"]').nth(target).tap();
    await page.waitForTimeout(560);
    states.push(await state(page));
  }
  await verifyUndoParity(page, states, 'narrow viewport');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
