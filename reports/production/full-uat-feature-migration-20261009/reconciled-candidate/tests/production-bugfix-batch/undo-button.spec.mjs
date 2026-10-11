import { test, expect } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

// Issue 6 acceptance tests: a fully working Step 3 Undo button driven through the real application.
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

async function mockApi(page) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const map = { '/api/stones': 'stones.json', '/api/charms': 'charms.json', '/api/spacers': 'spacers.json', '/api/settings': 'settings.json' };
    const file = map[url.pathname];
    await route.fulfill({ status: 200, contentType: 'application/json', body: file ? JSON.stringify(data(file)) : '{}' });
  });
}

const onboardingOff = async (page) => {
  for (let i = 0; i < 14 && await page.locator('.step3-onboarding').count() > 0; i += 1) { await page.mouse.click(195, 780).catch(() => {}); await page.waitForTimeout(400); }
};

async function reachStep3(page) {
  await page.goto(baseUrl + '/index.html?mock=1');
  await page.locator('#landingView button').first().click();
  await expect(page.locator('#stepView1.active')).toBeVisible();
  await page.locator('#btnNext').click();
  await expect(page.locator('#stepView2.active')).toBeVisible();
  await page.locator('[data-bead-size="6"]').click();
  await page.locator('#btnNext').click();
  await expect(page.locator('#stepView3.active')).toBeVisible();
  await expect(page.locator('#stepView3 .lumi-entry')).toBeVisible({ timeout: 45000 });
  await onboardingOff(page);
}

// Design fingerprint used to prove preview + item list + price stay synchronised.
const snapshot = (page) => page.evaluate(() => {
  const persisted = JSON.parse(window.localStorage.getItem('lucky_colorstone_state') || '{}');
  const svg = document.querySelector('#braceletSvg');
  const undo = document.querySelector('#btnUndoBracelet');
  return {
    stones: (persisted.selectedStones || []).filter((item) => (item.componentType || 'stone') === 'stone').length,
    spacers: (persisted.selectedStones || []).filter((item) => item.componentType === 'spacer').length,
    empties: (persisted.selectedStones || []).filter((item) => item.componentType === 'empty').length,
    total: (persisted.selectedStones || []).length,
    charms: (persisted.selectedCharmIds || []).length,
    price: document.querySelector('#canvasPriceText')?.textContent || '',
    beadCount: document.querySelector('#canvasBeadCountText')?.textContent || '',
    placedNodes: svg ? svg.querySelectorAll('g.bead-node.placed').length : 0,
    charmNodes: svg ? svg.querySelectorAll('.charm-preview-hitbox').length : 0,
    undoDisabled: undo ? undo.disabled : null,
    step4Active: Boolean(document.querySelector('#stepView4.active'))
  };
});

const settle = (page) => page.waitForTimeout(650);
const trace = [];
const mark = async (page, label) => { const snap = await snapshot(page); trace.push({ label, snap }); return snap; };
const clickFirstStoneCard = async (page) => { await page.locator('#stepView3 .stone-card').first().click({ position: { x: 20, y: 30 } }); await settle(page); };
const clickFirstPlacedStone = async (page) => {
  const node = page.locator('#braceletSvg g.bead-node.placed[data-slot-kind="stone"]').first();
  await node.click({ force: true });
  await settle(page);
};
const undo = async (page) => {
  let enabled = await page.locator('#btnUndoBracelet').isEnabled();
  if (!enabled) { await page.waitForTimeout(900); enabled = await page.locator('#btnUndoBracelet').isEnabled(); }
  if (!enabled) {
    console.log('TRACE-BEFORE-FAILED-UNDO ' + JSON.stringify(trace.map((entry) => entry.label + ' => ' + JSON.stringify(entry.snap)), null, 1));
    throw new Error('Undo button was disabled when an undo was expected. Trace: ' + JSON.stringify(trace.map((entry) => entry.label + ':' + entry.snap.stones + '/' + entry.snap.spacers + '/' + entry.snap.charms)));
  }
  await page.locator('#btnUndoBracelet').click();
  await settle(page);
};

test('Undo restores add / remove / replace / spacer / charm edits and never navigates', async ({ page }) => {
  test.setTimeout(240000);
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await reachStep3(page);

  // Empty history -> Undo is disabled and clicking it does nothing.
  let state = await snapshot(page);
  expect(state.undoDisabled, 'Undo must be disabled with no prior state').toBe(true);
  const before = state;
  await page.locator('#btnUndoBracelet').click({ force: true });
  await settle(page);
  expect(await snapshot(page)).toEqual(before);

  // Add stone -> Undo restores the previous composition, price and preview.
  await clickFirstStoneCard(page);
  await mark(page, 'after-add-stone');
  state = await snapshot(page);
  expect(state.stones).toBe(1);
  expect(state.undoDisabled).toBe(false);
  await page.screenshot({ path: 'tests/production-bugfix-batch/evidence/undo-01-after-add.png' });
  await undo(page);
  await mark(page, 'after-undo-add-stone');
  let restored = await snapshot(page);
  expect(restored.stones).toBe(0);
  expect(restored.price).toBe(before.price);
  expect(restored.beadCount).toBe(before.beadCount);
  expect(restored.placedNodes).toBe(before.placedNodes);
  expect(restored.undoDisabled).toBe(true);

  // Multiple edits -> multiple consecutive Undos.
  for (let i = 0; i < 3; i += 1) await clickFirstStoneCard(page);
  await mark(page, 'after-three-adds');
  expect((await snapshot(page)).stones).toBe(3);
  await undo(page);
  await mark(page, 'undo-1');
  expect((await snapshot(page)).stones).toBe(2);
  await undo(page);
  await mark(page, 'undo-2');
  expect((await snapshot(page)).stones).toBe(1);
  await undo(page);
  await mark(page, 'undo-3');
  expect((await snapshot(page)).stones).toBe(0);
  // Empty history: the control is disabled and a forced activation must not change any state.
  const emptyHistory = await snapshot(page);
  expect(emptyHistory.undoDisabled, 'Undo must disable itself at empty history').toBe(true);
  await page.locator('#btnUndoBracelet').evaluate((node) => node.click());
  await settle(page);
  expect(await snapshot(page), 'Undo at empty history must not act').toEqual(emptyHistory);

  // Remove stone -> Undo brings it back (with the identical price/preview).
  for (let i = 0; i < 3; i += 1) await clickFirstStoneCard(page);
  const threeStones = await snapshot(page);
  await mark(page, 'three-stones');
  await clickFirstPlacedStone(page);
  await mark(page, 'after-remove');
  expect((await snapshot(page)).stones).toBe(2);
  await undo(page);
  restored = await snapshot(page);
  expect(restored.stones).toBe(3);
  expect(restored.price).toBe(threeStones.price);
  expect(restored.placedNodes).toBe(threeStones.placedNodes);

  // Replace stone (remove keeps a retained slot, the next add fills it with a different stone) -> Undo.
  await clickFirstPlacedStone(page);
  const afterRemoval = await snapshot(page);
  await page.locator('#stepView3 .stone-card').nth(2).click({ position: { x: 20, y: 30 } });
  await settle(page);
  expect(await snapshot(page)).not.toEqual(afterRemoval);
  await undo(page);
  expect(await snapshot(page)).toEqual(afterRemoval);
  await undo(page);
  expect((await snapshot(page)).stones).toBe(3);
  await mark(page, 'after-two-undos');

  // Add spacer -> Undo removes it.
  await page.locator('#catalogTypeFilter [data-catalog-section="spacer"]').click();
  await page.waitForTimeout(500);
  await mark(page, 'spacer-tab');
  const spacerCard = page.locator('#charmSectionMount .spacer-component-section .stone-card').first();
  await spacerCard.click({ position: { x: 20, y: 30 } });
  await settle(page);
  await mark(page, 'after-spacer-add');
  expect((await snapshot(page)).spacers).toBe(1);
  await undo(page);
  await mark(page, 'after-spacer-undo');
  expect((await snapshot(page)).spacers).toBe(0);

  // Add charm -> Undo removes it; remove charm -> Undo restores it.
  await page.locator('#catalogTypeFilter [data-catalog-section="charms"]').click();
  await page.waitForTimeout(500);
  await page.locator('#charmSectionMount .charm-component-section .stone-card').first().click({ position: { x: 20, y: 30 } });
  await settle(page);
  const withCharm = await snapshot(page);
  expect(withCharm.charms).toBe(1);
  expect(withCharm.charmNodes).toBeGreaterThan(0);
  await undo(page);
  const withoutCharm = await snapshot(page);
  expect(withoutCharm.charms).toBe(0);
  expect(withoutCharm.step4Active).toBe(false);

  // Undo is not a Step navigation and never reaches Step 4.
  expect((await snapshot(page)).step4Active).toBe(false);
  await expect(page.locator('#stepView3.active')).toBeVisible();
  await page.screenshot({ path: 'tests/production-bugfix-batch/evidence/undo-02-final.png', fullPage: true });
});

test('Undo button placement mirrors Reset on mobile and desktop', async ({ page }) => {
  test.setTimeout(120000);
  await mockApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await reachStep3(page);
  await clickFirstStoneCard(page);

  const boxes = async (label) => {
    const undoBox = await page.locator('#btnUndoBracelet').boundingBox();
    const resetBox = await page.locator('#btnResetBracelet').boundingBox();
    const card = await page.locator('#step3PreviewCard').boundingBox();
    expect(undoBox && resetBox && card, label + ': controls must be laid out').toBeTruthy();
    // Same row and same size, mirrored corners, both inside the preview card.
    expect(Math.abs(undoBox.y - resetBox.y), label + ': same row').toBeLessThanOrEqual(2);
    expect(Math.abs(undoBox.height - resetBox.height), label + ': mirrored height').toBeLessThanOrEqual(2);
    // The Thai labels differ in length, so only the shared control metrics must match.
    expect(Math.abs(undoBox.width - resetBox.width), label + ': comparable control width').toBeLessThanOrEqual(40);
    expect(Math.abs(undoBox.height - resetBox.height), label + ': identical control height').toBeLessThanOrEqual(2);
    expect(Math.abs((undoBox.y + undoBox.height) - (resetBox.y + resetBox.height)), label + ': baseline aligned').toBeLessThanOrEqual(2);
    expect(undoBox.x).toBeLessThan(resetBox.x);
    expect(undoBox.x - card.x).toBeGreaterThanOrEqual(8);
    expect(undoBox.x - card.x).toBeLessThanOrEqual(16);
    expect((card.x + card.width) - (resetBox.x + resetBox.width)).toBeGreaterThanOrEqual(8);
    expect(undoBox.x + undoBox.width, label + ': no overlap').toBeLessThan(resetBox.x);
    expect(undoBox.height, label + ': touch target').toBeGreaterThanOrEqual(32);
    console.log(`PLACEMENT ${label} ${JSON.stringify({ undoBox, resetBox })}`);
    await page.screenshot({ path: `tests/production-bugfix-batch/evidence/undo-placement-${label}.png`, fullPage: true });
  };

  await boxes('mobile-390x844');
  await page.setViewportSize({ width: 320, height: 568 });
  await page.waitForTimeout(400);
  await boxes('mobile-320x568');
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForTimeout(400);
  await boxes('desktop-1366x768');
});

test('Undo survives a confirmed Lucky replacement and ignores a cancelled one', async ({ page }) => {
  test.setTimeout(300000);
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await reachStep3(page);

  // Build a small manual bracelet so the replacement confirmation is required.
  for (let i = 0; i < 3; i += 1) await clickFirstStoneCard(page);
  const manual = await snapshot(page);

  const runLuckyWithCharm = async (goal) => {
    await page.locator('#stepView3 .lumi-entry').click();
    await page.locator('.lucky-page1').waitFor({ state: 'visible', timeout: 25000 });
    await page.locator('[data-lumi-weekday="monday"]').click();
    await page.locator('[data-lumi-birth-date]').selectOption('1');
    await page.locator('[data-lumi-birth-month]').selectOption('1');
    await page.locator('[data-lumi-birth-year]').selectOption('1990');
    if (await page.locator('[data-lumi-style="charm"]').getAttribute('aria-pressed') !== 'true') await page.locator('[data-lumi-style="charm"]').click();
    await page.locator('.lucky-page1-actions [data-lumi-action="goals"]').click();
    const goalButton = page.locator(`[data-lumi-goal="${goal}"]`);
    await goalButton.click({ position: { x: 6, y: 6 } });
    if (await goalButton.getAttribute('aria-pressed') !== 'true') await goalButton.evaluate((node) => node.click());
    await page.locator('.lucky-page2-actions [data-lumi-action="generate"]').click();
    await expect(page.locator('.lucky-page3')).toBeVisible({ timeout: 90000 });
    await page.locator('.lucky-page3-actions [data-lumi-action="use"]').click();
    await page.waitForTimeout(1200);
  };

  // Cancelled replacement: history and editor must be untouched.
  await runLuckyWithCharm('love');
  await expect(page.locator('.lumi-replace')).toBeVisible({ timeout: 15000 });
  const beforeCancel = await snapshot(page);
  await page.locator('.lumi-replace [data-lumi-action="recommendation"]').click();
  await page.waitForTimeout(800);
  await page.locator('.lumi-shell [data-lumi-action="close"]').click().catch(() => {});
  await page.waitForTimeout(800);
  expect(await snapshot(page)).toEqual(beforeCancel);
  await undo(page);
  expect((await snapshot(page)).stones, 'cancelled replacement must not add history').toBe(2);
  await undo(page);
  await undo(page);
  expect((await snapshot(page)).stones).toBe(0);

  // Rebuild and confirm: one Undo must restore the pre-Lucky bracelet.
  for (let i = 0; i < 3; i += 1) await clickFirstStoneCard(page);
  expect((await snapshot(page)).stones).toBe(3);
  await runLuckyWithCharm('money');
  await expect(page.locator('.lumi-replace')).toBeVisible({ timeout: 15000 });
  await page.locator('.lumi-replace [data-lumi-action="commit"]').click();
  await page.waitForTimeout(2000);
  const applied = await snapshot(page);
  expect(applied.stones, 'Lucky design applied').toBeGreaterThan(3);
  expect(applied.charms).toBeGreaterThan(0);
  expect(applied.step4Active, 'accepting a Lucky design must not navigate').toBe(false);
  expect(await page.evaluate(() => document.querySelector('#stepView3')?.classList.contains('active'))).toBe(true);

  await undo(page);
  const reverted = await snapshot(page);
  expect(reverted.stones, 'pre-replacement bracelet restored').toBe(3);
  expect(reverted.charms).toBe(0);
  expect(reverted.price).toBe(manual.price);
  expect(reverted.step4Active).toBe(false);
  await page.screenshot({ path: 'tests/production-bugfix-batch/evidence/undo-03-after-lucky-undo.png', fullPage: true });
});
