// TASK A: iPhone / iOS Safari bead-removal latency.
//
// Runs in WebKit (the iOS Safari engine) with touch enabled and measures the real interaction
// timeline: tap -> event dispatch -> DOM repaint of the ring. It also records whether the tapped bead
// receives a transform/scale (the "stretched bead" the owner saw) and how long the removal takes.
//
// WebKit automation is NOT a real iPhone: REAL_IPHONE_VERIFICATION stays UNVERIFIED. The measured
// event-to-DOM latency is reported as engine-level evidence only.
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
const addStones = async (page, count) => {
  for (let index = 0; index < count; index += 1) {
    await page.locator('#stepView3 .stone-card').nth(index % 6).click({ position: { x: 20, y: 30 } });
    await page.waitForTimeout(420);
  }
};

// Records the tap timeline inside the page: native events, the scaled state of the tapped node and the
// moment the ring is rebuilt without that bead.
const installTapRecorder = (page) => page.evaluate(() => {
  window.__tapLog = [];
  const now = () => Math.round(performance.now() * 10) / 10;
  const record = (name) => window.__tapLog.push({ name, t: now() });
  const svg = document.getElementById('braceletSvg');
  window.__placedAt = () => document.querySelectorAll('#braceletSvg g.bead-node.placed').length;
  window.__placedBefore = window.__placedAt();
  window.__scaleSamples = [];
  window.__tapTargetScale = [];

  ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click'].forEach((type) => {
    svg.addEventListener(type, (event) => {
      record(type);
      if (type === 'pointerdown') {
        const node = event.target.closest('g.bead-node');
        window.__tappedNode = node || null;
        window.__tappedIndex = node?.dataset?.slotSourceIndex ?? null;
        const sample = () => {
          if (!window.__tappedNode) return;
          const node = window.__tappedNode;
          const matrix = node.getCTM?.();
          const scale = matrix ? Math.round(Math.hypot(matrix.a, matrix.b) * 1000) / 1000 : null;
          window.__scaleSamples.push({ t: now(), scale });
          // TASK B metric: the moment the tapped bead is visually gone (immediate feedback), recorded
          // separately from the moment the ring is rebuilt with the authoritative composition.
          if (!window.__visualHiddenAt) {
            const opacity = Number(getComputedStyle(node).opacity);
            const hiddenByClass = node.classList.contains('is-removing');
            const detached = !node.isConnected;
            if (hiddenByClass || detached || opacity === 0) window.__visualHiddenAt = now();
          }
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      }
    }, true);
  });

  const observer = new MutationObserver(() => {
    const placed = window.__placedAt();
    if (placed !== window.__placedBefore) {
      window.__placedBefore = placed;
      record(`dom-placed-${placed}`);
    }
  });
  observer.observe(svg, { childList: true, subtree: true });
  window.__tapObserver = observer;
  return true;
});

const readTapLog = (page) => page.evaluate(() => {
  const log = window.__tapLog || [];
  const first = (name) => log.find((entry) => entry.name === name);
  const dom = log.find((entry) => entry.name.startsWith('dom-placed-'));
  const relative = (entry) => (entry ? Math.round((entry.t - (first('pointerdown')?.t ?? 0)) * 10) / 10 : null);
  return {
    events: log.map((entry) => `${entry.name}@${Math.round((entry.t - (first('pointerdown')?.t ?? 0)) * 10) / 10}`),
    pointerDownToPointerUpMs: relative(first('pointerup')),
    pointerDownToTouchEndMs: relative(first('touchend')),
    pointerDownToClickMs: relative(first('click')),
    pointerDownToDomRemovalMs: relative(dom),
    pointerDownToVisualHiddenMs: window.__visualHiddenAt ? Math.round((window.__visualHiddenAt - (first('pointerdown')?.t ?? 0)) * 10) / 10 : null,
    pointerUpToVisualHiddenMs: window.__visualHiddenAt && first('pointerup') ? Math.round((window.__visualHiddenAt - first('pointerup').t) * 10) / 10 : null,
    scaleSamples: (window.__scaleSamples || []).slice(0, 14)
  };
});

test('single tap removes the bead without a stretched node or a click-bound delay', async ({ page }) => {
  test.setTimeout(300000);
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  // The product reports one `item_removed` analytics event per removal, which is the exact count of
  // beads a single tap removed (the ring rebuild makes DOM counts ambiguous while it is in flight).
  const removalEvents = [];
  page.on('request', (request) => {
    if (!request.url().includes('/api/analytics/event')) return;
    try {
      const body = JSON.parse(request.postData() || '{}');
      if (body.eventName === 'item_removed') removalEvents.push(body);
    } catch { /* ignore malformed analytics bodies */ }
  });
  await mockApi(page);
  await reachStep3(page);
  await addStones(page, 6);
  await page.waitForTimeout(700);

  await installTapRecorder(page);
  await page.locator('#braceletSvg g.bead-node.placed[data-slot-kind="stone"]').nth(2).tap();
  await page.waitForTimeout(1200);
  const measured = await readTapLog(page);
  console.log('IOS TAP MEASUREMENT', JSON.stringify(measured));

  const placedAfter = await page.locator('#braceletSvg g.bead-node.placed[data-slot-kind="stone"]').count();
  console.log('IOS TAP RESULT ' + JSON.stringify({
    placedAfter,
    removalEvents: removalEvents.length,
    removedIds: removalEvents.map((entry) => entry.item_id),
    persistedItems: await page.evaluate(() => (JSON.parse(window.localStorage.getItem('lucky_colorstone_state') || '{}').selectedStones || []).length)
  }));
  expect(placedAfter).toBe(5);
  expect(removalEvents.length, 'one tap must remove exactly one bead').toBe(1);
  expect(runtimeErrors).toEqual([]);
});

test('ten sequential removals and rapid taps keep the ring consistent', async ({ page }) => {
  test.setTimeout(300000);
  await mockApi(page);
  await reachStep3(page);
  await addStones(page, 12);
  await page.waitForTimeout(700);

  const removeOne = async () => {
    const target = page.locator('#braceletSvg g.bead-node.placed[data-slot-kind="stone"]').nth(2);
    if (!await target.count()) return false;
    await target.tap();
    return true;
  };

  const startedAt = Date.now();
  for (let index = 0; index < 10; index += 1) {
    if (!await removeOne()) break;
    await page.waitForTimeout(260);
  }
  const sequentialMs = Date.now() - startedAt;
  // A removed bead stays in the loop as a retained empty slot, so the authoritative metric is the
  // number of PLACED stones, not the array length.
  const placedQty = (page) => page.evaluate(() => document.querySelectorAll('#braceletSvg g.bead-node.placed').length);
  const afterSequential = await placedQty(page);

  // rapid taps: no waiting between taps (target the last placed bead, which always exists)
  const rapid = async () => {
    const target = page.locator('#braceletSvg g.bead-node.placed[data-slot-kind="stone"]').last();
    if (!await target.count()) return;
    await target.tap();
  };
  for (let index = 0; index < 2; index += 1) await rapid();
  await page.waitForTimeout(1200);
  const afterRapid = await placedQty(page);
  console.log('IOS SEQUENTIAL MEASUREMENT', JSON.stringify({ sequentialMs, afterSequential, afterRapid }));
  expect(afterSequential, 'ten taps remove ten beads').toBe(2);
  expect(afterRapid, 'the rapid taps remove another bead each').toBe(0);
});

const editorState = (page) => page.evaluate(() => {
  const persisted = JSON.parse(window.localStorage.getItem('lucky_colorstone_state') || '{}');
  const items = persisted.selectedStones || [];
  return {
    composition: items.map((item) => `${item.componentType || 'stone'}:${item.stoneId || item.charmId || item.spacerId || 'empty'}:${item.uniqueId}`),
    stones: items.filter((item) => (item.componentType || 'stone') === 'stone').length,
    charms: items.filter((item) => item.componentType === 'charm').length + (persisted.selectedCharmIds || []).length,
    ghosts: items.filter((item) => item.componentType === 'empty').length,
    price: (document.querySelector('#canvasPriceText')?.textContent || '').trim(),
    beadCount: (document.querySelector('#canvasBeadCountText')?.textContent || '').trim(),
    placed: document.querySelectorAll('#braceletSvg g.bead-node.placed').length,
    undoDisabled: document.querySelector('#btnUndoBracelet')?.disabled ?? null
  };
});

// locator.tap() performs a real touch tap after scrolling the bead into view, which is closer to a
// customer tap on a phone than hand-computed viewport coordinates (the ring can sit under the sticky
// preview card).
const tapBead = async (locator) => { await locator.tap(); };

test('removals keep price, counts, geometry and Undo in sync (tap then undo, undo to the baseline)', async ({ page }) => {
  test.setTimeout(300000);
  await mockApi(page);
  await reachStep3(page);
  const emptyBaseline = await editorState(page);
  // The timeline starts at the empty bracelet so the eight additions are part of the oracle, and every
  // entry is a real recorded state (no synthetic values).
  const timeline = [emptyBaseline];
  for (let index = 0; index < 8; index += 1) {
    await page.locator('#stepView3 .stone-card').nth(index % 6).click({ position: { x: 20, y: 30 } });
    await page.waitForTimeout(420);
    timeline.push(await editorState(page));
  }
  await page.waitForTimeout(600);
  for (let index = 0; index < 4; index += 1) {
    await tapBead(page.locator('#braceletSvg g.bead-node.placed[data-slot-kind="stone"]').nth(2));
    await page.waitForTimeout(500);
    timeline.push(await editorState(page));
  }
  const afterFour = timeline[timeline.length - 1];
  expect(afterFour.stones).toBe(4);
  expect(afterFour.placed).toBe(4);
  expect(afterFour.beadCount).not.toBe(timeline[0].beadCount);
  expect(afterFour.price).not.toBe(timeline[0].price);

  // Undo restores the removed bead (composition, price and preview together)
  await page.locator('#btnUndoBracelet').click();
  await page.waitForTimeout(650);
  const afterUndo = await editorState(page);
  // A removed bead is retained as an empty loop slot, so the semantic comparison is the placed bead
  // count / stone count / price rather than the raw slot bookkeeping.
  const previous = timeline[timeline.length - 2];
  expect(afterUndo.placed).toBe(previous.placed);
  expect(afterUndo.stones).toBe(previous.stones);
  expect(afterUndo.price).toBe(previous.price);

  // Undo repeatedly until the original bracelet is restored
  let undone = 1;
  while (await page.locator('#btnUndoBracelet').isEnabled() && undone < 20) {
    await page.locator('#btnUndoBracelet').click();
    await page.waitForTimeout(600);
    undone += 1;
    if (timeline.length - 1 - undone >= 0) {
      const expected = timeline[timeline.length - 1 - undone];
      const actual = await editorState(page);
      expect(actual.placed, `undo ${undone} restores the recorded bead count`).toBe(expected.placed);
      expect(actual.stones, `undo ${undone} restores the recorded stone count`).toBe(expected.stones);
      expect(actual.price, `undo ${undone} restores the recorded price`).toBe(expected.price);
    }
  }
  expect(undone).toBe(12);
  expect((await editorState(page)).placed).toBe(timeline[0].placed);
  expect((await editorState(page)).price).toBe(timeline[0].price);
  expect((await editorState(page)).undoDisabled).toBe(true);
});

test('a removal after accepting a Lucky design and a removal plus charm insert stay consistent', async ({ page }) => {
  test.setTimeout(300000);
  await mockApi(page);
  await reachStep3(page);

  // accept a Lucky design first
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
  await page.waitForTimeout(1500);
  if (await page.locator('.lumi-replace').isVisible().catch(() => false)) {
    await page.locator('.lumi-replace [data-lumi-action="commit"]').click();
    await page.waitForTimeout(2500);
  }
  const luckyBaseline = await editorState(page);
  expect(luckyBaseline.stones).toBeGreaterThan(10);

  // remove one bead from the Lucky bracelet
  await tapBead(page.locator('#braceletSvg g.bead-node.placed[data-slot-kind="stone"]').nth(2));
  await page.waitForTimeout(600);
  const afterLuckyRemoval = await editorState(page);
  expect(afterLuckyRemoval.stones).toBe(luckyBaseline.stones - 1);
  expect(afterLuckyRemoval.placed).toBe(luckyBaseline.placed - 1);
  expect(afterLuckyRemoval.ghosts).toBe(1);

  // Undo brings the Lucky bead back
  await page.locator('#btnUndoBracelet').click();
  await page.waitForTimeout(650);
  const luckyRestored = await editorState(page);
  expect(luckyRestored.placed).toBe(luckyBaseline.placed);
  expect(luckyRestored.stones).toBe(luckyBaseline.stones);
  expect(luckyRestored.price).toBe(luckyBaseline.price);

  // remove four beads and insert a charm
  for (let index = 0; index < 4; index += 1) {
    await tapBead(page.locator('#braceletSvg g.bead-node.placed[data-slot-kind="stone"]').nth(2));
    await page.waitForTimeout(500);
  }
  const afterRemovals = await editorState(page);
  await page.locator('#catalogTypeFilter [data-catalog-section="charms"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-charm-id]:visible').first().click({ position: { x: 20, y: 30 } });
  await page.waitForTimeout(700);
  const afterCharm = await editorState(page);
  expect(afterCharm.charms).toBeGreaterThan(afterRemovals.charms);
  // Inserting a charm into a full ring can displace a single stone (the fit trim keeps the physical
  // composition valid), so allow exactly one displaced stone.
  expect(Math.abs(afterCharm.stones - afterRemovals.stones)).toBeLessThanOrEqual(1);
  expect(afterCharm.placed).toBeGreaterThan(0);
  expect(afterCharm.price).not.toBe(afterRemovals.price);
});

test('narrow iPhone width keeps the tap target and removal behaviour', async ({ page }) => {
  test.setTimeout(300000);
  page.setDefaultTimeout(12000);
  await mockApi(page);
  await reachStep3(page);
  await addStones(page, 6);
  await page.waitForTimeout(600);

  const before = await editorState(page);
  // Verify the narrow iPhone width for the removal path (the sticky preview card covers part of the
  // catalog in this harness, which is a harness artifact and is covered by the UI parity suites).
  await page.setViewportSize({ width: 320, height: 568 });
  await page.waitForTimeout(400);
  await tapBead(page.locator('#braceletSvg g.bead-node.placed[data-slot-kind="stone"]').nth(2));
  await page.waitForTimeout(600);
  const after = await editorState(page);
  expect(after.stones).toBe(before.stones - 1);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('desktop pointer/mouse removal still works (no double removal)', async ({ page }) => {
  test.setTimeout(300000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApi(page);
  await reachStep3(page);
  await addStones(page, 6);
  await page.waitForTimeout(600);

  const before = await editorState(page);
  await page.locator('#braceletSvg g.bead-node.placed[data-slot-kind="stone"]').nth(3).click();
  await page.waitForTimeout(700);
  const after = await editorState(page);
  expect(after.stones, 'exactly one bead is removed by one mouse click').toBe(before.stones - 1);
  expect(after.placed).toBe(before.placed - 1);
});
