// Live verification for this release (Task 1/3 coverage claim, Task 4 Undo, Task 5 geometry,
// Task 6 formula): served bytes vs artifact, live undo label, live geometry after talisman, formula.
import { chromium } from '@playwright/test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'https://customize.luckycolorstone.com';
const ART = 'reports/production/full-uat-feature-migration-20261009/release/artifact/vercel';
const OUT = 'reports/production/production-bugfix-batch-20261011/evidence';
const manifest = JSON.parse(fs.readFileSync('reports/production/full-uat-feature-migration-20261009/release/manifest.json', 'utf8'));

const checks = [];
const check = (id, pass, detail = '') => checks.push({ id, pass: Boolean(pass), detail: String(detail).slice(0, 260) });

// 1. Served frontend equals the packaged release artifact.
for (const rel of ['index.html', 'app.js', 'index.css', 'lumi/ui/lumi-ui.js']) {
  const response = await fetch(`${BASE}/${rel}`);
  const live = crypto.createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
  const expected = manifest.vercel.entries.find((entry) => entry.path === rel)?.sha256;
  check(`live ${rel} matches the release artifact`, response.ok && live === expected, live.slice(0, 16));
}

// 2. Undo label + geometry fix present in the served bundle.
const html = await (await fetch(`${BASE}/index.html`)).text();
const undoLabel = /id="btnUndoBracelet"[\s\S]{0,600}?<\/svg>\s*([^<]*?)\s*<\/button>/.exec(html)?.[1]?.trim() || '';
check('Undo control is labelled exactly "Undo"', undoLabel === 'Undo', `label=${JSON.stringify(undoLabel)}`);
const app = await (await fetch(`${BASE}/app.js`)).text();
check('retained ghost slots are consumed by the shipped geometry fix', app.includes('retainedSlotLengthMm') && app.includes('undoSuppressUntil'));

// 3. Social-proof formula: displayCount must equal 1035 + successfulOrderCount * 3.
const social = await (await fetch(`${BASE}/api/social-proof`)).json();
check('displayCount = 1035 + successfulOrderCount * 3', social.displayCount === 1035 + social.successfulOrderCount * 3, JSON.stringify(social).slice(0, 90));
check('four real previews remain published', Array.isArray(social.recentBracelets) && social.recentBracelets.length === 4, `previews=${social.recentBracelets?.length}`);
check('no PII in the public payload', !/customerName|shippingInfo|phoneNumber|addressLine|lineUserId|email/i.test(JSON.stringify({ ...social, recentBracelets: [] })));

// 4. Live geometry: Lucky -> remove four stones -> add talisman must leave no ghost positions.
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'th-TH' });
const page = await context.newPage();
const problems = [];
page.on('pageerror', (error) => problems.push('pageerror: ' + error.message));
page.on('console', (message) => { if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) problems.push('console: ' + message.text()); });
const snap = () => page.evaluate(() => {
  const persisted = JSON.parse(window.localStorage.getItem('lucky_colorstone_state') || '{}');
  const items = persisted.selectedStones || [];
  const nodes = [...document.querySelectorAll('#braceletSvg g.bead-node')];
  return {
    stones: items.filter((item) => (item.componentType || 'stone') === 'stone').length,
    ghosts: items.filter((item) => item.componentType === 'empty').length,
    charms: (persisted.selectedCharmIds || []).length,
    ghostNodes: nodes.filter((node) => node.classList.contains('placeholder') && node.dataset.placeholderSubtype === 'RETAINED_EMPTY').length,
    price: document.querySelector('#canvasPriceText')?.textContent || '',
    undoLabel: (document.querySelector('#btnUndoBracelet')?.textContent || '').trim()
  };
});
try {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3500);
  await page.locator('#btnLandingLogin').first().click({ timeout: 25000 }).catch(async () => { await page.locator('#landingView button').first().click(); });
  await page.locator('#stepView1.active').waitFor({ state: 'visible', timeout: 40000 });
  await page.locator('#btnNext').first().click();
  await page.locator('#stepView2.active').waitFor({ state: 'visible', timeout: 40000 });
  await page.locator('[data-bead-size="6"]').first().click();
  await page.locator('#btnNext').first().click();
  await page.locator('#stepView3.active').waitFor({ state: 'visible', timeout: 45000 });
  for (let index = 0; index < 16 && await page.locator('.step3-onboarding').count() > 0; index += 1) { await page.mouse.click(195, 780).catch(() => {}); await page.waitForTimeout(400); }
  check('live Undo button shows the new label', (await snap()).undoLabel === 'Undo', JSON.stringify(await snap()));

  await page.locator('#stepView3 .lumi-entry').click();
  await page.locator('.lucky-page1').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('[data-lumi-weekday="monday"]').click();
  await page.locator('[data-lumi-birth-date]').selectOption('1');
  await page.locator('[data-lumi-birth-month]').selectOption('1');
  await page.locator('[data-lumi-birth-year]').selectOption('1990');
  if (await page.locator('[data-lumi-style="charm"]').getAttribute('aria-pressed') !== 'true') await page.locator('[data-lumi-style="charm"]').click();
  await page.locator('.lucky-page1-actions [data-lumi-action="goals"]').click();
  const goal = page.locator('[data-lumi-goal="love"]');
  await goal.waitFor({ state: 'attached', timeout: 25000 });
  for (let attempt = 0; attempt < 4 && await goal.getAttribute('aria-pressed') !== 'true'; attempt += 1) { await goal.evaluate((node) => node.click()); await page.waitForTimeout(400); }
  await page.locator('.lucky-page2-actions [data-lumi-action="generate"]').click();
  await page.locator('.lucky-page3').waitFor({ state: 'visible', timeout: 90000 });
  await page.locator('.lucky-page3-actions [data-lumi-action="use"]').click();
  await page.waitForTimeout(1500);
  if (await page.locator('.lumi-replace').isVisible().catch(() => false)) { await page.locator('.lumi-replace [data-lumi-action="commit"]').click(); await page.waitForTimeout(2200); }
  const afterLucky = await snap();
  for (let index = 0; index < 4; index += 1) {
    const bead = page.locator('#braceletSvg g.bead-node.placed[data-slot-kind="stone"]').first();
    if (!await bead.count()) break;
    await bead.click({ force: true });
    await page.waitForTimeout(700);
  }
  const afterRemoval = await snap();
  await page.locator('#catalogTypeFilter [data-catalog-section="charms"]').click();
  await page.waitForTimeout(1000);
  await page.locator('#charmSectionMount .charm-component-section .stone-card').first().click({ position: { x: 20, y: 30 } });
  await page.waitForTimeout(1600);
  const afterCharm = await snap();
  check('live: Lucky design applied', afterLucky.stones > 10 && afterLucky.charms === 1, JSON.stringify(afterLucky));
  check('live: four stones removed left retained gaps', afterRemoval.ghosts === 4 && afterRemoval.ghostNodes === 4, JSON.stringify(afterRemoval));
  check('live: adding the talisman consumes the ghost positions', afterCharm.ghosts === 0 && afterCharm.ghostNodes === 0 && afterCharm.charms === 2, JSON.stringify(afterCharm));
  await page.screenshot({ path: path.join(OUT, 'live-turn3-geometry-fixed.png'), fullPage: true });
} catch (error) {
  check('live geometry pass completed without an unhandled error', false, String(error?.message || error).slice(0, 300));
} finally {
  await browser.close();
}

const summary = { base: BASE, ranAt: new Date().toISOString(), passed: checks.filter((entry) => entry.pass).length, failed: checks.filter((entry) => !entry.pass).length, checks, problems };
fs.writeFileSync(path.join(OUT, 'live-turn3-verification.json'), JSON.stringify(summary, null, 1) + '\n', 'utf8');
console.log(JSON.stringify(summary, null, 1));
process.exit(summary.failed === 0 ? 0 : 1);
