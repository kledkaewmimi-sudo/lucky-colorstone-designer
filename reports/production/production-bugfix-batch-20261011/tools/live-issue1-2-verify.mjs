// Live verification for the two remaining issues (read-only: no checkout, no order, no PII handling).
//
//   node reports/production/production-bugfix-batch-20261011/tools/live-issue1-2-verify.mjs [baseUrl]
//
// Issue 1: the landing social-proof strip keeps the aggregate count and declares the four preview
//          positions; it shows the published previews when the backend serves them and degrades to the
//          designed fallback circles when it does not (the backend release commit is owner-deployed).
// Issue 2: the recorded Lucky flow (Monday / 07-07-2003 / with charm / all six goals) must reach the
//          no-recommendation card with real Thai copy and must never render the word "undefined".
// It also re-checks the four previously completed fixes so nothing regressed.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '..', 'evidence');
fs.mkdirSync(OUT, { recursive: true });
const BASE = (process.argv[2] || 'https://customize.luckycolorstone.com').replace(/\/$/, '');

const checks = [];
const check = (id, pass, detail = '') => checks.push({ id, pass: Boolean(pass), detail: String(detail).slice(0, 300) });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'th-TH' });
const problems = [];
let page = await context.newPage();
const attach = (target) => {
  target.on('pageerror', (error) => problems.push('pageerror: ' + error.message));
  target.on('console', (message) => { if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) problems.push('console: ' + message.text()); });
  target.on('response', (response) => { if (response.status() >= 500) problems.push('HTTP ' + response.status() + ' ' + response.url()); });
};
attach(page);
// Each Lucky pass gets a fresh document: the assistant keeps its answers inside the controller for the
// lifetime of the page, so reusing a page would carry the previous goals into the next run.
const newPage = async () => { await page.close().catch(() => {}); page = await context.newPage(); attach(page); await page.setViewportSize({ width: 390, height: 844 }); return page; };

const dismissOnboarding = async () => {
  for (let i = 0; i < 16 && await page.locator('.step3-onboarding').count() > 0; i += 1) { await page.mouse.click(195, 780).catch(() => {}); await page.waitForTimeout(400); }
};

const reachStep3 = async () => {
  // A fresh document keeps the deferred LINE auth boundary from engaging before the landing CTA, which
  // is how a first-time visitor reaches Step 1.
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3500);
  await page.locator('#btnLandingLogin').first().click({ timeout: 25000 }).catch(async () => { await page.locator('#landingView button').first().click(); });
  await page.locator('#stepView1.active').waitFor({ state: 'visible', timeout: 40000 });
  await page.locator('#btnNext').first().click();
  await page.locator('#stepView2.active').waitFor({ state: 'visible', timeout: 40000 });
  await page.locator('[data-bead-size="6"]').first().click();
  await page.locator('#btnNext').first().click();
  await page.locator('#stepView3.active').waitFor({ state: 'visible', timeout: 45000 });
  await dismissOnboarding();
};

const openLucky = async () => {
  await page.locator('#stepView3 .lumi-entry').click();
  await page.locator('.lucky-page1').waitFor({ state: 'visible', timeout: 30000 });
};

const answerPage1 = async ({ weekday, date, month, year, style = 'charm' }) => {
  await page.locator(`[data-lumi-weekday="${weekday}"]`).click();
  await page.locator('[data-lumi-birth-date]').selectOption(String(date));
  await page.locator('[data-lumi-birth-month]').selectOption(String(month));
  await page.locator('[data-lumi-birth-year]').selectOption(String(year));
  const styleButton = page.locator(`[data-lumi-style="${style}"]`);
  if (await styleButton.getAttribute('aria-pressed') !== 'true') await styleButton.click();
};

const shellText = () => page.evaluate(() => (document.querySelector('.lumi-shell')?.innerText || ''));

// The goals page is an animated orbit; a coordinate click can land on a decorative layer, so the goal
// is activated through the element itself and the pressed state is verified before generating.
const selectGoal = async (goal) => {
  const button = page.locator(`[data-lumi-goal="${goal}"]`);
  await button.waitFor({ state: 'attached', timeout: 25000 });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (await button.getAttribute('aria-pressed') === 'true') return true;
    await button.evaluate((node) => node.click()).catch(() => {});
    await page.waitForTimeout(450);
  }
  return (await button.getAttribute('aria-pressed')) === 'true';
};

// Waits for whichever terminal Lucky state the engine produces and reports it, so a failure names the
// state instead of just timing out on one selector.
const waitForLuckyOutcome = async (timeoutMs = 120000) => {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    last = await page.evaluate(() => ({
      page1: Boolean(document.querySelector('.lucky-page1')),
      page2: Boolean(document.querySelector('.lucky-page2')),
      page3: Boolean(document.querySelector('.lucky-page3')),
      message: Boolean(document.querySelector('.lumi-state-card h1')),
      designing: Boolean(document.querySelector('[data-lumi-designing]')),
      generateDisabled: (() => { const button = document.querySelector('.lucky-page2-actions [data-lumi-action="generate"]'); return button ? button.disabled : null; })(),
      goalsSelected: document.querySelectorAll('[data-lumi-goal][aria-pressed="true"]').length,
      text: (document.querySelector('.lumi-shell')?.innerText || '').replace(/\s+/g, ' ').slice(0, 140)
    }));
    if (last.page3 || last.message) return last;
    await page.waitForTimeout(1000);
  }
  return last;
};

try {
  // ---------------------------------------------------------------- Issue 1: landing strip
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4500);
  const landing = await page.evaluate(() => {
    const section = document.querySelector('#landingSocialProof');
    const images = [...section.querySelectorAll('.sp-thumb img')];
    return {
      strip: Boolean(section),
      count: (document.querySelector('#landingSocialProofCount')?.textContent || '').trim(),
      slots: section.querySelectorAll('.sp-thumb').length,
      images: images.length,
      inlineImages: images.every((img) => String(img.getAttribute('src') || '').startsWith('data:image/')),
      loaded: images.every((img) => img.naturalWidth > 0),
      heart: Boolean(section.querySelector('.sp-heart')),
      text: (section.innerText || '').replace(/\s+/g, ' ').trim()
    };
  });
  // Hydration is non-blocking and the origin may be cold, so give the count time to upgrade.
  const initialCount = landing.count;
  await page.waitForFunction((baseline) => {
    const value = (document.querySelector('#landingSocialProofCount')?.textContent || '').trim();
    return value !== baseline;
  }, initialCount, { timeout: 25000 }).catch(() => {});
  landing.count = await page.evaluate(() => (document.querySelector('#landingSocialProofCount')?.textContent || '').trim());
  landing.hydratedFrom = initialCount;
  const socialProofResponse = await page.request.get(BASE + '/api/social-proof');
  const socialProofText = await socialProofResponse.text();
  let socialProofBody = null;
  try { socialProofBody = JSON.parse(socialProofText); } catch (error) { socialProofBody = null; }
  const published = Array.isArray(socialProofBody?.recentBracelets) ? socialProofBody.recentBracelets : [];
  check('landing social-proof strip renders with the count and four positions', landing.strip && /^[0-9,]+$/.test(landing.count) && landing.slots === 4 && landing.heart, JSON.stringify(landing));
  const liveDisplayCount = Number(socialProofBody?.displayCount);
  check('the strip count matches the public endpoint aggregate', Number(landing.count.replace(/,/g, '')) === liveDisplayCount, `displayed ${landing.count} vs endpoint ${liveDisplayCount}`);
  check('no customer/order data in the strip text', !/TEST-|@|\d{3}[\s-]?\d{3}[\s-]?\d{4}/.test(landing.text), landing.text);
  check('public social-proof response exposes only the count and previews', socialProofResponse.status() === 200
    && socialProofBody !== null
    && Object.keys(socialProofBody).every((key) => ['displayCount', 'successfulOrderCount', 'recentBracelets'].includes(key))
    && !/customerName|shippingInfo|phoneNumber|addressLine|lineUserId|email|stripeCheckoutSessionId/i.test(socialProofText), socialProofResponse.status() + ' ' + Object.keys(socialProofBody || {}).join(','));
  if (published.length) {
    check('published previews are bounded inline images and render in the strip', published.length <= 4
      && published.every((entry) => typeof entry === 'string' && /^data:image\/(webp|png|jpeg);base64,/.test(entry) && entry.length < 60000)
      && landing.inlineImages
      && landing.loaded
      && landing.images === published.length, `published=${published.length} rendered=${landing.images}`);
  } else {
    check('backend preview release pending: strip degrades to the designed fallback without breaking', landing.images === 0 && landing.slots === 4 && /^[0-9,]+$/.test(landing.count), `no previews published yet (backend commit awaiting the owner's Render deploy); count=${landing.count}`);
  }
  await page.screenshot({ path: path.join(OUT, 'live-issue1-landing-strip.png') });

  // ---------------------------------------------------------------- Issue 2: recorded Lucky flow
  await newPage();
  await reachStep3();
  await openLucky();
  await answerPage1({ weekday: 'monday', date: 7, month: 7, year: 2003, style: 'charm' });
  await page.locator('.lucky-page1-actions [data-lumi-action="goals"]').click();
  await page.locator('[data-lumi-action="select-all-goals"]').click();
  const goals = await page.locator('[data-lumi-goal][aria-pressed="true"]').count();
  await page.locator('.lucky-page2-actions [data-lumi-action="generate"]').click();
  await page.locator('.lumi-shell .lumi-state-card h1').waitFor({ state: 'visible', timeout: 90000 });
  const fallbackText = await shellText();
  const fallbackButtons = await page.evaluate(() => [...document.querySelectorAll('.lumi-shell .lumi-actions [data-lumi-action]')].map((node) => ({ action: node.dataset.lumiAction, label: node.textContent.trim() })));
  check('recorded Lucky flow (Monday 07-07-2003, charm, all six goals) selected all goals', goals === 6, 'goals=' + goals);
  check('the no-recommendation card shows real copy, never "undefined"', !fallbackText.includes('undefined') && /ยังหาแบบที่พอดีกับตัวเลือกนี้ไม่ได้/.test(fallbackText), JSON.stringify(fallbackText.replace(/\s+/g, ' ').slice(0, 160)));
  check('the no-recommendation card offers a working way back to the editor', fallbackButtons.some((entry) => entry.action === 'close' && entry.label.trim().length > 0 && entry.label !== 'undefined'), JSON.stringify(fallbackButtons));
  await page.screenshot({ path: path.join(OUT, 'live-issue2-fallback-copy.png') });
  await page.locator('.lumi-shell [data-lumi-action="close"]').first().click();
  await page.waitForTimeout(1200);
  check('closing the fallback card returns to the Step 3 editor unchanged', await page.evaluate(() => Boolean(document.querySelector('#stepView3.active')) && !document.querySelector('.lumi-shell')));

  // ---------------------------------------------------------------- preserved fix 1: Undo
  const undoBefore = await page.evaluate(() => JSON.parse(window.localStorage.getItem('lucky_colorstone_state') || '{}').selectedStones?.length || 0);
  await page.locator('#stepView3 .stone-card').first().click({ position: { x: 20, y: 30 } });
  await page.waitForTimeout(1200);
  const undoMid = await page.evaluate(() => JSON.parse(window.localStorage.getItem('lucky_colorstone_state') || '{}').selectedStones?.length || 0);
  await page.locator('#btnUndoBracelet').click();
  await page.waitForTimeout(1200);
  const undoAfter = await page.evaluate(() => JSON.parse(window.localStorage.getItem('lucky_colorstone_state') || '{}').selectedStones?.length || 0);
  check('Undo still restores the previous bracelet state', undoMid === undoBefore + 1 && undoAfter === undoBefore, `${undoBefore} -> ${undoMid} -> ${undoAfter}`);

  // ---------------------------------------------------------------- preserved fixes 2-4
  await newPage();
  await reachStep3();
  await openLucky();
  await answerPage1({ weekday: 'monday', date: 1, month: 1, year: 1990, style: 'charm' });
  await page.locator('.lucky-page1-actions [data-lumi-action="goals"]').click();
  const loveSelected = await selectGoal('love');
  check('the goals page accepted the selected goal', loveSelected, 'love pressed=' + loveSelected);
  await page.locator('.lucky-page2-actions [data-lumi-action="generate"]').click();
  let outcome = await waitForLuckyOutcome();
  if (!outcome?.page3) {
    // A stale/context state can legitimately appear; retry once through its own action before failing.
    console.log('LUCKY-OUTCOME-1 ' + JSON.stringify(outcome));
    await page.locator('.lumi-shell [data-lumi-action="generate"]').first().click().catch(() => {});
    outcome = await waitForLuckyOutcome(60000);
  }
  check('Lucky produced a result page for the preserved-fix pass', Boolean(outcome?.page3), JSON.stringify(outcome));
  if (!outcome?.page3) throw new Error('Lucky did not reach a recommendation page: ' + JSON.stringify(outcome));
  await page.waitForTimeout(2500);
  const materialImages = await page.evaluate(() => [...document.querySelectorAll('.lumi-material-card img')].map((img) => ({ src: img.getAttribute('src'), loaded: img.naturalWidth > 0 })));
  const firstConfirm = await page.locator('.lumi-replace').isVisible().catch(() => false);
  await page.locator('.lucky-page3-actions [data-lumi-action="use"]').click();
  await page.waitForTimeout(1500);
  if (firstConfirm) await page.locator('.lumi-replace [data-lumi-action="commit"]').click();
  await page.waitForTimeout(2200);
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
  check('accepting a Lucky design still keeps the customer on Step 3', afterAccept.step3 && !afterAccept.step4, JSON.stringify(afterAccept));
  check('talisman design still renders in the Step 3 bracelet', afterAccept.placed > 10 && afterAccept.charms === 1 && afterAccept.charmNodes === 1, JSON.stringify(afterAccept));
  check('no "undefined" anywhere after applying a design', !afterAccept.undefinedText, 'undefined=' + afterAccept.undefinedText);
  check('Lucky result page still shows its material images', materialImages.length >= 2 && materialImages.every((image) => image.loaded), JSON.stringify(materialImages.slice(0, 4)));
  await page.screenshot({ path: path.join(OUT, 'live-preserved-lucky-accept.png'), fullPage: true });

  await openLucky();
  await answerPage1({ weekday: 'tuesday', date: 2, month: 2, year: 1991, style: 'charm' });
  await page.locator('.lucky-page1-actions [data-lumi-action="goals"]').click();
  const moneySelected = await selectGoal('money');
  check('the second Lucky design accepted its goal', moneySelected, 'money pressed=' + moneySelected);
  await page.locator('.lucky-page2-actions [data-lumi-action="generate"]').click();
  outcome = await waitForLuckyOutcome();
  check('the second Lucky design produced a result page', Boolean(outcome?.page3), JSON.stringify(outcome));
  if (!outcome?.page3) throw new Error('second Lucky design did not reach a recommendation page: ' + JSON.stringify(outcome));
  await page.locator('.lucky-page3-actions [data-lumi-action="use"]').click();
  await page.waitForTimeout(2500);
  const secondConfirm = await page.locator('.lumi-replace').isVisible().catch(() => false);
  const confirmHeadings = await page.evaluate(() => (document.querySelector('.lumi-replace-heading')?.textContent || '').trim());
  check('the second Lucky design still shows the replacement confirmation', secondConfirm && confirmHeadings.length > 0, `visible=${secondConfirm} heading=${confirmHeadings}`);
  if (secondConfirm) {
    await page.locator('.lumi-replace [data-lumi-action="recommendation"]').click();
    await page.waitForTimeout(1200);
    check('cancelling the replacement still keeps the current bracelet', await page.evaluate(() => Boolean(document.querySelector('.lucky-page3')) && !document.querySelector('.lumi-replace')));
    await page.locator('.lumi-replace [data-lumi-action="commit"]').click().catch(() => {});
    await page.waitForTimeout(2500);
  }
  check('replacement still lands on Step 3 (no automatic Step 4)', await page.evaluate(() => Boolean(document.querySelector('#stepView3.active')) && !document.querySelector('#stepView4.active')));
  await page.screenshot({ path: path.join(OUT, 'live-preserved-replace-confirm.png'), fullPage: true });

  // Transparent stone assets (page 3 / Step 3 imagery).
  const opal = await page.request.get(BASE + '/assets/Opal.webp');
  const opalBuffer = await opal.body();
  const opalMeta = await sharp(opalBuffer).metadata();
  check('stone assets are still served as the transparent cut-outs', opal.status() === 200 && opalMeta.hasAlpha === true && opalMeta.format === 'webp', `HTTP ${opal.status()} ${opalBuffer.length} bytes format=${opalMeta.format} alpha=${opalMeta.hasAlpha} ${opalMeta.width}x${opalMeta.height}`);
  check('no page errors during the whole live pass', problems.length === 0, problems.slice(0, 3).join(' | '));
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
fs.writeFileSync(path.join(OUT, 'live-issue1-2-verification.json'), JSON.stringify(summary, null, 1) + '\n', 'utf8');
console.log(JSON.stringify(summary, null, 1));
process.exit(summary.failed === 0 ? 0 : 1);
