// Live probe: manual bracelet -> Lucky charm design -> replacement confirmation -> commit.
// Read-only: it never checks out and never creates an order.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '..', 'evidence');
fs.mkdirSync(OUT, { recursive: true });
const BASE = (process.argv[2] || 'https://customize.luckycolorstone.com').replace(/\/$/, '');

const scan = (page) => page.evaluate(() => {
  const html = document.body.innerHTML;
  const hits = [];
  let index = html.indexOf('undefined');
  while (index >= 0 && hits.length < 20) { hits.push(html.slice(Math.max(0, index - 120), index + 60).replace(/\s+/g, ' ')); index = html.indexOf('undefined', index + 1); }
  const svg = document.querySelector('#braceletSvg');
  const persisted = (() => { try { return JSON.parse(window.localStorage.getItem('lucky_colorstone_state') || '{}'); } catch (error) { return {}; } })();
  return {
    step3Active: Boolean(document.querySelector('#stepView3.active')),
    step4Active: Boolean(document.querySelector('#stepView4.active')),
    braceletSvgNodes: svg ? svg.querySelectorAll('*').length : 0,
    charmNodes: svg ? svg.querySelectorAll('[class*="charm"]').length : 0,
    stones: (persisted.selectedStones || []).length,
    charmIds: persisted.selectedCharmIds || [],
    price: document.querySelector('#canvasPriceText')?.textContent || null,
    replaceCardVisible: Boolean(document.querySelector('.lumi-replace')),
    hits
  };
});

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'th-TH' });
const page = await context.newPage();
const problems = [];
page.on('pageerror', (error) => problems.push('pageerror: ' + error.message));
page.on('console', (message) => { if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) problems.push('console: ' + message.text()); });
const report = { base: BASE, ranAt: new Date().toISOString(), problems, stages: {} };
const dismissOnboarding = async () => {
  for (let i = 0; i < 16 && await page.locator('.step3-onboarding').count() > 0; i += 1) { await page.mouse.click(195, 780).catch(() => {}); await page.waitForTimeout(450); }
};

try {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);
  await page.locator('#btnLandingLogin').first().click({ timeout: 25000 }).catch(async () => { await page.locator('#landingView button').first().click(); });
  await page.locator('#stepView1.active').waitFor({ state: 'visible', timeout: 40000 });
  await page.locator('#btnNext').first().click();
  await page.locator('#stepView2.active').waitFor({ state: 'visible', timeout: 40000 });
  await page.locator('[data-bead-size="6"]').first().click();
  await page.locator('#btnNext').first().click();
  await page.locator('#stepView3.active').waitFor({ state: 'visible', timeout: 45000 });
  await expect0();
  await dismissOnboarding();

  // Build a manual bracelet first so the editor holds a real "current bracelet".
  const card = page.locator('#stepView3 .stone-card').first();
  for (let i = 0; i < 4; i += 1) { await card.click({ position: { x: 20, y: 30 } }).catch(() => {}); await page.waitForTimeout(350); }
  report.stages.manualDesign = await scan(page);

  await page.locator('#stepView3 .lumi-entry').click();
  await page.locator('.lucky-page1').waitFor({ state: 'visible', timeout: 20000 });
  await page.locator('[data-lumi-weekday="monday"]').click();
  await page.locator('[data-lumi-birth-date]').selectOption('1');
  await page.locator('[data-lumi-birth-month]').selectOption('1');
  await page.locator('[data-lumi-birth-year]').selectOption('1990');
  const styleButton = page.locator('[data-lumi-style="charm"]');
  if (await styleButton.getAttribute('aria-pressed') !== 'true') await styleButton.click();
  await page.locator('.lucky-page1-actions [data-lumi-action="goals"]').click();
  const goal = page.locator('[data-lumi-goal="love"]');
  await goal.click({ position: { x: 6, y: 6 } });
  if (await goal.getAttribute('aria-pressed') !== 'true') await goal.evaluate((node) => node.click());
  await page.locator('.lucky-page2-actions [data-lumi-action="generate"]').click();
  await page.locator('.lucky-page3').waitFor({ state: 'visible', timeout: 90000 });
  await page.locator('.lucky-page3-actions [data-lumi-action="use"]').click();
  await page.waitForTimeout(2500);
  report.stages.replaceConfirmation = await scan(page);
  await page.screenshot({ path: path.join(OUT, 'live-replace-confirmation.png'), fullPage: true });
  const confirmed = await page.locator('.lumi-replace [data-lumi-action="commit"]').isVisible().catch(() => false);
  if (confirmed) {
    await page.locator('.lumi-replace [data-lumi-action="commit"]').click();
    await page.waitForTimeout(2500);
  }
  report.stages.afterCommit = await scan(page);
  await page.screenshot({ path: path.join(OUT, 'live-replace-after-commit.png'), fullPage: true });
  if (!report.stages.afterCommit.step3Active) {
    await page.locator('#btnBack').first().click({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await dismissOnboarding();
    report.stages.backOnStep3 = await scan(page);
    await page.screenshot({ path: path.join(OUT, 'live-replace-back-step3.png'), fullPage: true });
  }
  // Open each Step 3 catalog tab with the charm design applied and scan for undefined leakage.
  for (const [tab, label] of [['charms', 'charm-tab'], ['spacer', 'spacer-tab'], ['stones', 'stone-tab']]) {
    const button = page.locator(`[data-catalog-section="${tab}"]`).first();
    if (await button.count()) {
      await button.click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(1200);
      report.stages[label] = await scan(page);
      await page.screenshot({ path: path.join(OUT, `live-replace-${label}.png`), fullPage: true });
    }
  }
  // Remove the anchored charm from the hanging control, then scan again.
  const removeCharm = page.locator('#stepView3 [data-remove-charm], #stepView3 .anchored-charm-remove').first();
  if (await removeCharm.count()) {
    await removeCharm.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1200);
    report.stages.afterCharmRemoval = await scan(page);
    await page.screenshot({ path: path.join(OUT, 'live-replace-after-charm-removal.png'), fullPage: true });
  }
} catch (error) {
  report.error = String(error?.message || error).slice(0, 400);
} finally {
  await browser.close();
}
async function expect0() {}

fs.writeFileSync(path.join(OUT, 'live-lucky-replace-probe.json'), JSON.stringify(report, null, 1) + '\n', 'utf8');
console.log(JSON.stringify(report, null, 1).slice(0, 5000));
