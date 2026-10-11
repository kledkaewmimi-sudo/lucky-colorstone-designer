// Live probe: TWO consecutive Lucky designs in one session (Lucky bracelet -> second Lucky design).
// Records the replacement-confirmation behaviour and scans for "undefined" leakage. Read-only.
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
  for (const token of ['undefined', 'NaN']) {
    let index = html.indexOf(token);
    while (index >= 0 && hits.length < 12) {
      const context = html.slice(Math.max(0, index - 120), index + 60).replace(/\s+/g, ' ');
      if (!/^[A-Za-z0-9+/=\s]{60,}$/.test(html.slice(index, index + 80))) hits.push(token + ' :: ' + context);
      index = html.indexOf(token, index + 1);
    }
  }
  const svg = document.querySelector('#braceletSvg');
  const persisted = (() => { try { return JSON.parse(window.localStorage.getItem('lucky_colorstone_state') || '{}'); } catch (error) { return {}; } })();
  return {
    shellOpen: Boolean(document.querySelector('.lumi-shell')),
    page3Visible: Boolean(document.querySelector('.lucky-page3')),
    replaceCardVisible: Boolean(document.querySelector('.lumi-replace')),
    step3Active: Boolean(document.querySelector('#stepView3.active')),
    step4Active: Boolean(document.querySelector('#stepView4.active')),
    braceletSvgNodes: svg ? svg.querySelectorAll('*').length : 0,
    charmNodes: svg ? svg.querySelectorAll('[class*="charm"]').length : 0,
    stones: (persisted.selectedStones || []).length,
    charmIds: persisted.selectedCharmIds || [],
    price: document.querySelector('#canvasPriceText')?.textContent || null,
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
const runLucky = async (goal) => {
  await page.locator('#stepView3 .lumi-entry').click();
  await page.locator('.lucky-page1').waitFor({ state: 'visible', timeout: 25000 });
  await page.locator('[data-lumi-weekday="monday"]').click();
  await page.locator('[data-lumi-birth-date]').selectOption('1');
  await page.locator('[data-lumi-birth-month]').selectOption('1');
  await page.locator('[data-lumi-birth-year]').selectOption('1990');
  const styleButton = page.locator('[data-lumi-style="charm"]');
  if (await styleButton.getAttribute('aria-pressed') !== 'true') await styleButton.click();
  await page.locator('.lucky-page1-actions [data-lumi-action="goals"]').click();
  const goalButton = page.locator(`[data-lumi-goal="${goal}"]`);
  await goalButton.click({ position: { x: 6, y: 6 } });
  if (await goalButton.getAttribute('aria-pressed') !== 'true') await goalButton.evaluate((node) => node.click());
  await page.locator('.lucky-page2-actions [data-lumi-action="generate"]').click();
  await page.locator('.lucky-page3').waitFor({ state: 'visible', timeout: 90000 });
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
  await dismissOnboarding();

  // Round 1 - Lucky design into an empty editor.
  await runLucky('love');
  await page.locator('.lucky-page3-actions [data-lumi-action="use"]').click();
  await page.waitForTimeout(2500);
  report.stages.round1Confirm = await scan(page);
  if (report.stages.round1Confirm.replaceCardVisible) { await page.locator('.lumi-replace [data-lumi-action="commit"]').click(); await page.waitForTimeout(2500); }
  report.stages.round1Applied = await scan(page);

  // Return to Step 3 the way a customer does.
  if (!report.stages.round1Applied.step3Active) {
    await page.locator('#btnBack').first().click({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await dismissOnboarding();
  }
  report.stages.beforeRound2 = await scan(page);

  // Round 2 - second Lucky design replacing the Lucky-generated bracelet.
  await runLucky('money');
  await page.locator('.lucky-page3-actions [data-lumi-action="use"]').click();
  await page.waitForTimeout(3000);
  report.stages.round2AfterUse = await scan(page);
  await page.screenshot({ path: path.join(OUT, 'live-second-pass-after-use.png'), fullPage: true });
  if (report.stages.round2AfterUse.replaceCardVisible) {
    await page.locator('.lumi-replace [data-lumi-action="commit"]').click();
    await page.waitForTimeout(3000);
    report.stages.round2Applied = await scan(page);
    await page.screenshot({ path: path.join(OUT, 'live-second-pass-applied.png'), fullPage: true });
    if (!report.stages.round2Applied.step3Active) {
      await page.locator('#btnBack').first().click({ timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(2000);
      await dismissOnboarding();
      report.stages.round2BackOnStep3 = await scan(page);
    }
  }
} catch (error) {
  report.error = String(error?.message || error).slice(0, 400);
} finally {
  await browser.close();
}

fs.writeFileSync(path.join(OUT, 'live-lucky-second-pass-probe.json'), JSON.stringify(report, null, 1) + '\n', 'utf8');
console.log(JSON.stringify(report, null, 1).slice(0, 6000));
