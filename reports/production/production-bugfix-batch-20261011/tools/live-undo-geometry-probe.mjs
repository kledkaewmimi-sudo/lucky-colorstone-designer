// Live reproduction for Task 4 (Undo depth) and Task 5 (geometry after removing stones + adding a
// talisman). Read-only: it only edits the customer's own in-browser design state.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const BASE = (process.argv[2] || 'https://customize.luckycolorstone.com').replace(/\/$/, '');
const OUT = 'reports/production/production-bugfix-batch-20261011/evidence';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'th-TH' });
const page = await context.newPage();
const problems = [];
page.on('pageerror', (error) => problems.push('pageerror: ' + error.message));
page.on('console', (message) => { if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) problems.push('console: ' + message.text()); });

const state = () => page.evaluate(() => {
  const persisted = JSON.parse(window.localStorage.getItem('lucky_colorstone_state') || '{}');
  const stones = persisted.selectedStones || [];
  const svg = document.querySelector('#braceletSvg');
  const nodes = svg ? [...svg.querySelectorAll('g.bead-node')] : [];
  return {
    stones: stones.filter((item) => (item.componentType || 'stone') === 'stone').length,
    spacers: stones.filter((item) => item.componentType === 'spacer').length,
    empties: stones.filter((item) => item.componentType === 'empty').length,
    total: stones.length,
    charms: (persisted.selectedCharmIds || []).length,
    placedNodes: nodes.filter((node) => node.classList.contains('placed')).length,
    placeholderNodes: nodes.filter((node) => node.classList.contains('placeholder')).length,
    beadPx: (() => { const image = svg?.querySelector('g.bead-node.placed[data-slot-kind="stone"] image'); if (!image) return null; const width = Number(image.getAttribute('width') || 0); const transform = image.getAttribute('transform') || ''; const scale = /scale\(([-\d.]+)/.exec(transform); return { width: Number(width.toFixed(2)), scale: scale ? Number(Number(scale[1]).toFixed(3)) : 1 }; })(),
    ringDiameterPx: (() => { const placed = svg ? [...svg.querySelectorAll('g.bead-node.placed')] : []; if (placed.length < 3) return null; let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity; for (const node of placed) { const image = node.querySelector('image'); if (!image) continue; const x = Number(image.getAttribute('x') || 0) + Number(image.getAttribute('width') || 0) / 2; const y = Number(image.getAttribute('y') || 0) + Number(image.getAttribute('height') || 0) / 2; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); } return { width: Number((maxX - minX).toFixed(1)), height: Number((maxY - minY).toFixed(1)) }; })(),
    placeholderPx: (() => { const node = svg?.querySelector('g.bead-node.placeholder circle.bead-slot-border'); return node ? Number(Number(node.getAttribute('r') || 0).toFixed(2)) * 2 : null; })(),
    price: document.querySelector('#canvasPriceText')?.textContent || '',
    beadCount: document.querySelector('#canvasBeadCountText')?.textContent || '',
    space: document.querySelector('#canvasSpaceText')?.textContent || '',
    undoDisabled: document.querySelector('#btnUndoBracelet')?.disabled ?? null,
    undoLabel: (document.querySelector('#btnUndoBracelet')?.textContent || '').trim()
  };
});

const onboardingOff = async () => {
  for (let i = 0; i < 16 && await page.locator('.step3-onboarding').count() > 0; i += 1) { await page.mouse.click(195, 780).catch(() => {}); await page.waitForTimeout(400); }
};
const reachStep3 = async (bead = '6') => {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3500);
  await page.locator('#btnLandingLogin').first().click({ timeout: 25000 }).catch(async () => { await page.locator('#landingView button').first().click(); });
  await page.locator('#stepView1.active').waitFor({ state: 'visible', timeout: 40000 });
  await page.locator('#btnNext').first().click();
  await page.locator('#stepView2.active').waitFor({ state: 'visible', timeout: 40000 });
  await page.locator(`[data-bead-size="${bead}"]`).first().click();
  await page.locator('#btnNext').first().click();
  await page.locator('#stepView3.active').waitFor({ state: 'visible', timeout: 45000 });
  await onboardingOff();
};
const selectGoal = async (goal) => {
  const button = page.locator(`[data-lumi-goal="${goal}"]`);
  await button.waitFor({ state: 'attached', timeout: 25000 });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (await button.getAttribute('aria-pressed') === 'true') return true;
    await button.evaluate((node) => node.click()).catch(() => {});
    await page.waitForTimeout(400);
  }
  return (await button.getAttribute('aria-pressed')) === 'true';
};
const acceptLucky = async ({ weekday = 'monday', date = 1, month = 1, year = 1990, goal = 'love' } = {}) => {
  await page.locator('#stepView3 .lumi-entry').click();
  await page.locator('.lucky-page1').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator(`[data-lumi-weekday="${weekday}"]`).click();
  await page.locator('[data-lumi-birth-date]').selectOption(String(date));
  await page.locator('[data-lumi-birth-month]').selectOption(String(month));
  await page.locator('[data-lumi-birth-year]').selectOption(String(year));
  if (await page.locator('[data-lumi-style="charm"]').getAttribute('aria-pressed') !== 'true') await page.locator('[data-lumi-style="charm"]').click();
  await page.locator('.lucky-page1-actions [data-lumi-action="goals"]').click();
  await selectGoal(goal);
  await page.locator('.lucky-page2-actions [data-lumi-action="generate"]').click();
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const status = await page.evaluate(() => ({ page3: Boolean(document.querySelector('.lucky-page3')), message: Boolean(document.querySelector('.lumi-state-card h1')) }));
    if (status.page3) break;
    if (status.message) throw new Error('Lucky returned no recommendation in this probe run');
    await page.waitForTimeout(1000);
  }
  await page.locator('.lucky-page3-actions [data-lumi-action="use"]').click();
  await page.waitForTimeout(1800);
  if (await page.locator('.lumi-replace').isVisible().catch(() => false)) { await page.locator('.lumi-replace [data-lumi-action="commit"]').click(); await page.waitForTimeout(2200); }
};

const report = { base: BASE, ranAt: new Date().toISOString(), tests: {}, problems };
try {
  // ---------------------------------------------------------------- Task 4: Undo depth
  await reachStep3('6');
  const undoSteps = [];
  undoSteps.push({ label: 'baseline', ...(await state()) });
  for (let index = 0; index < 5; index += 1) {
    await page.locator('#stepView3 .stone-card').nth(index % 4).click({ position: { x: 20, y: 30 } });
    await page.waitForTimeout(750);
    undoSteps.push({ label: 'add-' + (index + 1), ...(await state()) });
  }
  const afterAdds = undoSteps[undoSteps.length - 1];
  for (let index = 0; index < 7; index += 1) {
    const enabled = await page.locator('#btnUndoBracelet').isEnabled();
    if (!enabled) { undoSteps.push({ label: 'undo-' + (index + 1), skipped: 'button disabled' }); break; }
    await page.locator('#btnUndoBracelet').click();
    await page.waitForTimeout(900);
    undoSteps.push({ label: 'undo-' + (index + 1), ...(await state()) });
  }
  const afterUndos = undoSteps[undoSteps.length - 1];
  report.tests.undo = {
    steps: undoSteps,
    stonesAdded: afterAdds.stones,
    stonesAfterUndos: afterUndos.stones,
    undoClicksAccepted: undoSteps.filter((entry) => entry.label.startsWith('undo-') && !entry.skipped).length,
    restoredBaseline: afterUndos.stones === 0 && afterUndos.empties === 0
  };
  await page.screenshot({ path: path.join(OUT, 'live-undo-after-sequence.png'), fullPage: true });

  // ---------------------------------------------------------------- Task 5: geometry
  await reachStep3('6');
  await acceptLucky();
  const geometry = [];
  geometry.push({ label: 'after-lucky-accept', ...(await state()) });
  for (let index = 0; index < 4; index += 1) {
    const bead = page.locator('#braceletSvg g.bead-node.placed[data-slot-kind="stone"]').first();
    if (!await bead.count()) break;
    await bead.click({ force: true });
    await page.waitForTimeout(700);
  }
  geometry.push({ label: 'after-removing-4-stones', ...(await state()) });
  await page.locator('#catalogTypeFilter [data-catalog-section="charms"]').click();
  await page.waitForTimeout(1200);
  const charmCard = page.locator('#charmSectionMount .charm-component-section .stone-card').first();
  if (await charmCard.count()) { await charmCard.click({ position: { x: 20, y: 30 } }); await page.waitForTimeout(1500); }
  geometry.push({ label: 'after-adding-talisman', ...(await state()) });
  report.tests.geometry = geometry;
  await page.screenshot({ path: path.join(OUT, 'live-geometry-after-talisman.png'), fullPage: true });
} catch (error) {
  report.error = String(error?.message || error).slice(0, 400);
} finally {
  await browser.close();
}

fs.writeFileSync(path.join(OUT, 'live-undo-geometry-probe.json'), JSON.stringify(report, null, 1) + '\n', 'utf8');
console.log(JSON.stringify(report, null, 1).slice(0, 7000));
