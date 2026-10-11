// Live reproduction probe for the Lucky talisman/charm Page 3 defect (read-only).
//
//   node reports/production/production-bugfix-batch-20261011/tools/live-lucky-charm-probe.mjs [baseUrl]
//
// Walks the real deployed customer flow, generates a Lucky design that contains an anchored
// talisman/charm, and records everything the result page produced: the preview SVG, every literal
// "undefined"/"null" occurrence in the DOM, and the post-acceptance Step 3/Step 4 state.
// It never checks out, never enters a name and never creates an order.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '..', 'evidence');
fs.mkdirSync(OUT, { recursive: true });

const BASE = (process.argv[2] || 'https://customize.luckycolorstone.com').replace(/\/$/, '');
const STYLE = process.argv[3] || 'charm';
const GOAL = process.argv[4] || 'love';
const label = `${STYLE}-${GOAL}`;

const scan = (page) => page.evaluate(() => {
  const html = document.body.innerHTML;
  const hits = [];
  for (const token of ['undefined', '>null<', '[object Object]', 'NaN']) {
    let index = html.indexOf(token);
    while (index >= 0 && hits.length < 40) {
      hits.push({ token, context: html.slice(Math.max(0, index - 110), index + 50).replace(/\s+/g, ' ') });
      index = html.indexOf(token, index + 1);
    }
  }
  const preview = document.querySelector('.lucky-result-bracelet');
  const svg = preview?.querySelector('svg');
  const view = document.querySelector('#stepView3');
  const braceletSvg = document.querySelector('#braceletSvg');
  return {
    page3Visible: Boolean(document.querySelector('.lucky-page3')),
    previewHtml: (preview?.innerHTML || '').slice(0, 400),
    previewSvgPresent: Boolean(svg),
    previewNodeCount: svg ? svg.querySelectorAll('*').length : 0,
    previewGroups: svg ? svg.querySelectorAll('g').length : 0,
    previewAuthority: preview?.dataset?.lumiRendererAuthority || null,
    materialCards: [...document.querySelectorAll('.lumi-material-card')].map((card) => ({
      id: card.dataset.materialId,
      type: card.dataset.materialType,
      text: card.textContent.replace(/\s+/g, ' ').trim().slice(0, 80),
      img: card.querySelector('img')?.getAttribute('src') || null,
      imgLoaded: (card.querySelector('img')?.naturalWidth || 0) > 0
    })),
    step3Active: Boolean(view?.classList.contains('active')),
    step4Active: Boolean(document.querySelector('#stepView4.active')),
    braceletSvgNodes: braceletSvg ? braceletSvg.querySelectorAll('*').length : 0,
    brokenImages: [...document.querySelectorAll('img')].filter((img) => !img.getAttribute('src') || (img.naturalWidth === 0 && img.complete)).map((img) => img.getAttribute('src')),
    hits
  };
});

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'th-TH' });
const page = await context.newPage();
const problems = [];
page.on('pageerror', (error) => problems.push('pageerror: ' + error.message));
page.on('console', (message) => { if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) problems.push('console: ' + message.text()); });

const report = { base: BASE, style: STYLE, goal: GOAL, ranAt: new Date().toISOString(), problems, stages: {} };
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
  await page.locator('#stepView3 .lumi-entry').waitFor({ state: 'visible', timeout: 45000 });
  await dismissOnboarding();
  report.stages.step3 = { reached: true };

  await page.locator('#stepView3 .lumi-entry').click();
  await page.locator('.lucky-page1').waitFor({ state: 'visible', timeout: 20000 });
  await page.locator('[data-lumi-weekday="monday"]').click();
  await page.locator('[data-lumi-birth-date]').selectOption('1');
  await page.locator('[data-lumi-birth-month]').selectOption('1');
  await page.locator('[data-lumi-birth-year]').selectOption('1990');
  const styleButton = page.locator(`[data-lumi-style="${STYLE === 'charm' ? 'charm' : 'stone'}"]`);
  if (await styleButton.getAttribute('aria-pressed') !== 'true') await styleButton.click();
  await page.locator('.lucky-page1-actions [data-lumi-action="goals"]').click();
  const goal = page.locator(`[data-lumi-goal="${GOAL}"]`);
  if (await goal.count()) { await goal.click({ position: { x: 6, y: 6 } }); if (await goal.getAttribute('aria-pressed') !== 'true') await goal.evaluate((node) => node.click()); }
  await page.locator('.lucky-page2-actions [data-lumi-action="generate"]').click();
  await page.locator('.lucky-page3').waitFor({ state: 'visible', timeout: 90000 });
  await page.waitForTimeout(1500);
  report.stages.luckyPage3 = await scan(page);
  await page.screenshot({ path: path.join(OUT, `live-lucky-page3-${label}.png`), fullPage: true });

  await page.locator('.lucky-page3-actions [data-lumi-action="use"]').click();
  await page.waitForTimeout(2500);
  report.stages.afterAccept = await scan(page);
  report.stages.afterAcceptUrl = page.url();
  await page.screenshot({ path: path.join(OUT, `live-after-accept-${label}.png`), fullPage: true });

  if (!report.stages.afterAccept.step3Active) {
    await page.locator('#btnBack').first().click({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await dismissOnboarding();
    report.stages.backOnStep3 = await scan(page);
    await page.screenshot({ path: path.join(OUT, `live-back-step3-${label}.png`), fullPage: true });
  }
} catch (error) {
  report.error = String(error?.message || error).slice(0, 500);
} finally {
  await browser.close();
}

fs.writeFileSync(path.join(OUT, `live-lucky-charm-probe-${label}.json`), JSON.stringify(report, null, 1) + '\n', 'utf8');
console.log(JSON.stringify({
  error: report.error || null,
  problems,
  page3: report.stages.luckyPage3 ? {
    visible: report.stages.luckyPage3.page3Visible,
    previewSvgPresent: report.stages.luckyPage3.previewSvgPresent,
    previewNodeCount: report.stages.luckyPage3.previewNodeCount,
    materialCards: report.stages.luckyPage3.materialCards,
    hits: report.stages.luckyPage3.hits.slice(0, 10)
  } : null,
  afterAccept: report.stages.afterAccept ? {
    step3Active: report.stages.afterAccept.step3Active,
    step4Active: report.stages.afterAccept.step4Active,
    braceletSvgNodes: report.stages.afterAccept.braceletSvgNodes,
    hits: report.stages.afterAccept.hits.slice(0, 10)
  } : null,
  backOnStep3: report.stages.backOnStep3 ? {
    step3Active: report.stages.backOnStep3.step3Active,
    braceletSvgNodes: report.stages.backOnStep3.braceletSvgNodes,
    hits: report.stages.backOnStep3.hits.slice(0, 10)
  } : null
}, null, 1));
