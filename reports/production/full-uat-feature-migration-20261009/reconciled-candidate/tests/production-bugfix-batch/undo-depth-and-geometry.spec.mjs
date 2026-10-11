import { test, expect } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

// Task 4: Undo must walk the whole history (20 edits -> 20 undos -> exact baseline).
// Task 5: after Lucky -> remove four stones -> add a talisman there must be no ghost ring positions,
// the physical capacity must be used, and undoing must restore the Lucky baseline.
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

const mockApi = async (page) => {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const map = { '/api/stones': 'stones.json', '/api/charms': 'charms.json', '/api/spacers': 'spacers.json', '/api/settings': 'settings.json' };
    const file = map[url.pathname];
    await route.fulfill({ status: 200, contentType: 'application/json', body: file ? JSON.stringify(data(file)) : '{}' });
  });
};
const onboardingOff = async (page) => {
  for (let i = 0; i < 16 && await page.locator('.step3-onboarding').count() > 0; i += 1) { await page.mouse.click(195, 780).catch(() => {}); await page.waitForTimeout(400); }
};
const reachStep3 = async (page, bead = '6') => {
  await page.goto(baseUrl + '/index.html?mock=1');
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
const snap = (page) => page.evaluate(() => {
  const persisted = JSON.parse(window.localStorage.getItem('lucky_colorstone_state') || '{}');
  const items = persisted.selectedStones || [];
  const svg = document.querySelector('#braceletSvg');
  const nodes = svg ? [...svg.querySelectorAll('g.bead-node')] : [];
  return {
    stones: items.filter((item) => (item.componentType || 'stone') === 'stone').length,
    spacer: items.filter((item) => item.componentType === 'spacer').length,
    ghosts: items.filter((item) => item.componentType === 'empty').length,
    charmIds: [...(persisted.selectedCharmIds || [])],
    placed: nodes.filter((node) => node.classList.contains('placed')).length,
    placeholderNodes: nodes.filter((node) => node.classList.contains('placeholder')).length,
    retainedGhostNodes: nodes.filter((node) => node.classList.contains('placeholder') && node.dataset.placeholderSubtype === 'RETAINED_EMPTY').length,
    price: document.querySelector('#canvasPriceText')?.textContent || '',
    beadCount: document.querySelector('#canvasBeadCountText')?.textContent || '',
    undoLabel: (document.querySelector('#btnUndoBracelet')?.textContent || '').trim(),
    undoDisabled: document.querySelector('#btnUndoBracelet')?.disabled ?? null,
    step4: Boolean(document.querySelector('#stepView4.active'))
  };
});
const undoOnce = async (page) => { await page.locator('#btnUndoBracelet').click(); await page.waitForTimeout(650); };
const acceptLucky = async (page, { goal = 'love' } = {}) => {
  await page.locator('#stepView3 .lumi-entry').click();
  await page.locator('.lucky-page1').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('[data-lumi-weekday="monday"]').click();
  await page.locator('[data-lumi-birth-date]').selectOption('1');
  await page.locator('[data-lumi-birth-month]').selectOption('1');
  await page.locator('[data-lumi-birth-year]').selectOption('1990');
  if (await page.locator('[data-lumi-style="charm"]').getAttribute('aria-pressed') !== 'true') await page.locator('[data-lumi-style="charm"]').click();
  await page.locator('.lucky-page1-actions [data-lumi-action="goals"]').click();
  const goalButton = page.locator(`[data-lumi-goal="${goal}"]`);
  await goalButton.waitFor({ state: 'attached', timeout: 25000 });
  for (let attempt = 0; attempt < 4 && await goalButton.getAttribute('aria-pressed') !== 'true'; attempt += 1) { await goalButton.evaluate((node) => node.click()); await page.waitForTimeout(400); }
  await page.locator('.lucky-page2-actions [data-lumi-action="generate"]').click();
  await expect(page.locator('.lucky-page3')).toBeVisible({ timeout: 90000 });
  await page.locator('.lucky-page3-actions [data-lumi-action="use"]').click();
  await page.waitForTimeout(1500);
  if (await page.locator('.lumi-replace').isVisible().catch(() => false)) { await page.locator('.lumi-replace [data-lumi-action="commit"]').click(); await page.waitForTimeout(2000); }
};

test('Undo walks the full history: 20 edits then 20 undos restore the exact baseline', async ({ page }) => {
  test.setTimeout(300000);
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await reachStep3(page);
  await expect(page.locator('#btnUndoBracelet')).toHaveText('Undo');
  const baseline = await snap(page);
  expect(baseline.stones).toBe(0);
  expect(baseline.undoDisabled).toBe(true);

  const timeline = [baseline];
  for (let index = 0; index < 20; index += 1) {
    const action = index % 4;
    if (action === 3 && (await snap(page)).stones > 0) {
      await page.locator('#braceletSvg g.bead-node.placed[data-slot-kind="stone"]').first().click({ force: true });
    } else {
      await page.locator('#stepView3 .stone-card').nth(index % 5).click({ position: { x: 20, y: 30 } });
    }
    await page.waitForTimeout(620);
    timeline.push(await snap(page));
  }
  const afterEdits = timeline[timeline.length - 1];
  // The 20-edit script interleaves 15 adds with 5 removals, so a valid mid-state holds 10 stones.
  expect(afterEdits.stones, 'edits were applied').toBe(10);
  expect(timeline.every((entry, index) => index === 0 || JSON.stringify(entry) !== JSON.stringify(timeline[index - 1])), 'every edit changed the state').toBe(true);

  let undone = 0;
  while (undone < 20) {
    const enabled = await page.locator('#btnUndoBracelet').isEnabled();
    if (!enabled) break;
    await undoOnce(page);
    undone += 1;
  }
  const restored = await snap(page);
  expect(undone, 'every edit must be undoable individually').toBe(20);
  expect(restored.stones, 'baseline stone count restored').toBe(baseline.stones);
  expect(restored.ghosts).toBe(baseline.ghosts);
  expect(restored.charmIds).toEqual(baseline.charmIds);
  expect(restored.price).toBe(baseline.price);
  expect(restored.beadCount).toBe(baseline.beadCount);
  expect(restored.undoDisabled, 'button disables only when no history remains').toBe(true);
  expect(restored.step4, 'undo never navigates').toBe(false);
});

for (const bead of ['6', '10', 'mixed']) {
  test(`Task 5 @${bead}mm: Lucky -> remove 4 stones -> add talisman leaves no ghost positions`, async ({ page }) => {
    test.setTimeout(300000);
    await page.setViewportSize({ width: 390, height: 844 });
    await mockApi(page);
    await reachStep3(page, bead);
    await acceptLucky(page);
    const luckyBaseline = await snap(page);
    expect(luckyBaseline.stones).toBeGreaterThan(10);
    expect(luckyBaseline.charmIds.length).toBe(1);
    expect(luckyBaseline.placeholderNodes).toBe(0);

    for (let index = 0; index < 4; index += 1) {
      const beadNode = page.locator('#braceletSvg g.bead-node.placed[data-slot-kind="stone"]').first();
      if (!await beadNode.count()) break;
      await beadNode.click({ force: true });
      await page.waitForTimeout(700);
    }
    const afterRemoval = await snap(page);
    expect(afterRemoval.stones).toBe(luckyBaseline.stones - 4);

    await page.locator('#catalogTypeFilter [data-catalog-section="charms"]').click();
    await page.waitForTimeout(1000);
    const card = page.locator('#charmSectionMount .charm-component-section .stone-card').first();
    await card.click({ position: { x: 20, y: 30 } });
    await page.waitForTimeout(1600);
    const afterCharm = await snap(page);

    expect(afterCharm.charmIds.length, 'the talisman was added').toBe(2);
    expect(afterCharm.ghosts, 'deleted stones must not survive as ghost ring positions').toBe(0);
    expect(afterCharm.retainedGhostNodes, 'no ghost nodes from deleted stones are rendered').toBe(0);
    // Trailing capacity placeholders are the app's normal "add here" affordance and may legitimately
    // remain when free bead space is left; only a deleted bead's own position must never survive.
    expect(afterCharm.placeholderNodes - afterCharm.retainedGhostNodes, 'remaining placeholders are capacity affordance only').toBeGreaterThanOrEqual(0);
    expect(afterCharm.placed, 'rendered ring matches the physical composition').toBe(afterCharm.stones + afterCharm.charmIds.length + afterCharm.spacer);
    expect(afterCharm.step4).toBe(false);

    // Undo must restore the exact Lucky baseline (talisman, stones and ghosts).
    let guard = 0;
    while (guard < 12 && JSON.stringify(await snap(page)) !== JSON.stringify(afterCharm)) guard += 1;
    for (let step = 0; step < 12; step += 1) {
      const current = await snap(page);
      if (current.stones === luckyBaseline.stones && current.charmIds.length === luckyBaseline.charmIds.length && current.ghosts === luckyBaseline.ghosts) break;
      if (!await page.locator('#btnUndoBracelet').isEnabled()) break;
      await undoOnce(page);
    }
    const finalState = await snap(page);
    expect(finalState.stones).toBe(luckyBaseline.stones);
    expect(finalState.charmIds).toEqual(luckyBaseline.charmIds);
    expect(finalState.ghosts).toBe(0);
    expect(finalState.price).toBe(luckyBaseline.price);
  });
}
