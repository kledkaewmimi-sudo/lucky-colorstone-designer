// Final live verification of the Production bugfix batch, read-only (no checkout, no order, no PII).
//
//   node reports/production/production-bugfix-batch-20261011/tools/live-bugfix-batch-verify.mjs [baseUrl]
//
// Covers: landing social-proof strip (count present, no customer images), Lucky charm design applied
// with the customer kept on Step 3, second Lucky design showing the replacement confirmation,
// the Step 3 Undo control, and the background-removed stone assets on the Lucky result page.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '..', 'evidence');
fs.mkdirSync(OUT, { recursive: true });
const BASE = (process.argv[2] || 'https://customize.luckycolorstone.com').replace(/\/$/, '');

const checks = [];
const check = (id, pass, detail = '') => { checks.push({ id, pass: Boolean(pass), detail: String(detail).slice(0, 260) }); };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'th-TH' });
const page = await context.newPage();
const problems = [];
page.on('pageerror', (error) => problems.push('pageerror: ' + error.message));
page.on('console', (message) => { if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) problems.push('console: ' + message.text()); });
page.on('response', (response) => { if (response.status() >= 500) problems.push('HTTP ' + response.status() + ' ' + response.url()); });

const dismissOnboarding = async () => {
  for (let i = 0; i < 16 && await page.locator('.step3-onboarding').count() > 0; i += 1) { await page.mouse.click(195, 780).catch(() => {}); await page.waitForTimeout(400); }
};

const runLucky = async (goal) => {
  await page.locator('#stepView3 .lumi-entry').click();
  await page.locator('.lucky-page1').waitFor({ state: 'visible', timeout: 30000 });
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
  await page.locator('.lucky-page3').waitFor({ state: 'visible', timeout: 90000 });
};

try {
  // ---- 1. landing ----
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4500);
  const landing = await page.evaluate(() => ({
    strip: Boolean(document.querySelector('#landingSocialProof')),
    count: (document.querySelector('#landingSocialProofCount')?.textContent || '').trim(),
    thumbSlots: document.querySelectorAll('.sp-thumb').length,
    imagesInStrip: document.querySelectorAll('#landingSocialProof img').length,
    heart: Boolean(document.querySelector('.sp-heart'))
  }));
  check('landing social-proof strip renders', landing.strip && landing.heart, JSON.stringify(landing));
  check('social-proof count is shown (safe default or live aggregate)', /^[0-9,]+$/.test(landing.count), 'count=' + landing.count);
  check('no customer preview image is published on the landing page', landing.imagesInStrip === 0 && landing.thumbSlots === 0, JSON.stringify(landing));
  const socialProofResponse = await page.request.get(BASE + '/api/social-proof');
  const socialProofBody = await socialProofResponse.text();
  check('public social-proof response stays privacy-safe', socialProofResponse.status() === 200 && !/image|bracelet|customer|email|phone|name|address/i.test(socialProofBody), socialProofResponse.status() + ' ' + socialProofBody.slice(0, 120));
  await page.screenshot({ path: path.join(OUT, 'live-landing-social-proof.png') });

  // ---- 2. Step 3 ----
  await page.locator('#btnLandingLogin').first().click({ timeout: 25000 }).catch(async () => { await page.locator('#landingView button').first().click(); });
  await page.locator('#stepView1.active').waitFor({ state: 'visible', timeout: 40000 });
  await page.locator('#btnNext').first().click();
  await page.locator('#stepView2.active').waitFor({ state: 'visible', timeout: 40000 });
  await page.locator('[data-bead-size="6"]').first().click();
  await page.locator('#btnNext').first().click();
  await page.locator('#stepView3.active').waitFor({ state: 'visible', timeout: 45000 });
  await page.locator('#stepView3 .lumi-entry').waitFor({ state: 'visible', timeout: 45000 });
  await dismissOnboarding();
  const undoVisible = await page.locator('#btnUndoBracelet').isVisible();
  const undoDisabled = await page.locator('#btnUndoBracelet').isDisabled();
  check('Step 3 shows the new Undo control, disabled with no history', undoVisible && undoDisabled, `visible=${undoVisible} disabled=${undoDisabled}`);

  // Undo works for a manual edit.
  await page.locator('#stepView3 .stone-card').first().click({ position: { x: 20, y: 30 } });
  await page.waitForTimeout(1200);
  const afterAdd = await page.evaluate(() => JSON.parse(window.localStorage.getItem('lucky_colorstone_state') || '{}').selectedStones?.length || 0);
  const undoEnabled = await page.locator('#btnUndoBracelet').isEnabled();
  await page.locator('#btnUndoBracelet').click();
  await page.waitForTimeout(1200);
  const afterUndo = await page.evaluate(() => JSON.parse(window.localStorage.getItem('lucky_colorstone_state') || '{}').selectedStones?.length || 0);
  check('Undo restores the previous bracelet state on Production', afterAdd === 1 && afterUndo === 0 && undoEnabled, `add=${afterAdd} undo=${afterUndo} enabled=${undoEnabled}`);

  // ---- 3. Lucky charm design ----
  await runLucky('love');
  // The result page reveals its cards with an entrance animation; let it settle and let the
  // lazy-loaded stone images decode before sampling them.
  await page.waitForTimeout(3200);
  await page.waitForFunction(() => {
    const images = [...document.querySelectorAll('.lumi-material-card img')];
    return images.length > 0 && images.every((img) => img.complete && img.naturalWidth > 0);
  }, null, { timeout: 20000 }).catch(() => {});
  const materialImages = await page.evaluate(() => [...document.querySelectorAll('.lumi-material-card img')].map((img) => ({ src: img.getAttribute('src'), loaded: img.naturalWidth > 0 })));
  await page.screenshot({ path: path.join(OUT, 'live-page3-stones-transparent.png'), fullPage: true });
  await page.locator('.lucky-page3-actions [data-lumi-action="use"]').click();
  await page.waitForTimeout(2500);
  const afterAccept = await page.evaluate(() => {
    const svg = document.querySelector('#braceletSvg');
    const persisted = JSON.parse(window.localStorage.getItem('lucky_colorstone_state') || '{}');
    return {
      step3: Boolean(document.querySelector('#stepView3.active')),
      step4: Boolean(document.querySelector('#stepView4.active')),
      placed: svg ? svg.querySelectorAll('g.bead-node.placed').length : 0,
      charms: (persisted.selectedCharmIds || []).length,
      charmNodes: svg ? svg.querySelectorAll('.charm-preview-hitbox').length : 0,
      undefinedText: document.body.innerHTML.includes('undefined')
    };
  });
  check('accepting a Lucky charm design keeps the customer on Step 3', afterAccept.step3 && !afterAccept.step4, JSON.stringify(afterAccept));
  check('talisman design renders in the Step 3 bracelet', afterAccept.placed > 10 && afterAccept.charms === 1 && afterAccept.charmNodes === 1, JSON.stringify(afterAccept));
  check('no "undefined" text appears anywhere after applying the design', !afterAccept.undefinedText, 'undefined=' + afterAccept.undefinedText);
  check('Lucky result page shows the talisman and stone images', materialImages.length >= 2 && materialImages.every((image) => image.loaded), JSON.stringify(materialImages.slice(0, 6)));
  await page.screenshot({ path: path.join(OUT, 'live-after-lucky-accept.png'), fullPage: true });

  // ---- 4. second Lucky design -> replacement confirmation ----
  await runLucky('money');
  await page.locator('.lucky-page3-actions [data-lumi-action="use"]').click();
  await page.waitForTimeout(2500);
  const confirmState = await page.evaluate(() => ({
    replaceCard: Boolean(document.querySelector('.lumi-replace')),
    heading: (document.querySelector('.lumi-replace-heading')?.textContent || '').trim(),
    buttons: [...document.querySelectorAll('.lumi-replace [data-lumi-action]')].map((node) => node.dataset.lumiAction)
  }));
  check('second Lucky design shows the replacement confirmation', confirmState.replaceCard && confirmState.buttons.includes('commit') && confirmState.buttons.includes('recommendation'), JSON.stringify(confirmState));
  await page.screenshot({ path: path.join(OUT, 'live-replace-confirmation.png'), fullPage: true });
  if (confirmState.replaceCard) {
    await page.locator('.lumi-replace [data-lumi-action="recommendation"]').click();
    await page.waitForTimeout(1200);
    const cancelled = await page.evaluate(() => Boolean(document.querySelector('.lucky-page3')) && !document.querySelector('.lumi-replace'));
    check('cancelling the replacement keeps the current bracelet', cancelled, 'cancelled=' + cancelled);
    await page.locator('.lumi-replace [data-lumi-action="commit"]').click().catch(() => {});
    await page.waitForTimeout(2500);
  }
  const finalState = await page.evaluate(() => {
    const persisted = JSON.parse(window.localStorage.getItem('lucky_colorstone_state') || '{}');
    return { step3: Boolean(document.querySelector('#stepView3.active')), step4: Boolean(document.querySelector('#stepView4.active')), charms: (persisted.selectedCharmIds || []).length, stones: (persisted.selectedStones || []).length };
  });
  check('replacement still lands on Step 3 (no automatic Step 4)', finalState.step3 && !finalState.step4, JSON.stringify(finalState));
  await page.screenshot({ path: path.join(OUT, 'live-after-second-lucky.png'), fullPage: true });
} catch (error) {
  check('live verification completed without an unhandled error', false, String(error?.message || error).slice(0, 300));
} finally {
  await browser.close();
}

const summary = {
  base: BASE,
  ranAt: new Date().toISOString(),
  passed: checks.filter((entry) => entry.pass).length,
  failed: checks.filter((entry) => !entry.pass).length,
  checks,
  problems
};
fs.writeFileSync(path.join(OUT, 'live-bugfix-batch-verification.json'), JSON.stringify(summary, null, 1) + '\n', 'utf8');
console.log(JSON.stringify(summary, null, 1));
process.exit(summary.failed === 0 ? 0 : 1);
