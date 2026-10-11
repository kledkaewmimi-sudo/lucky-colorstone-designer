// Captures what the live customer app actually sent to the Lucky engine and what it concluded, by
// reading the app's own analytics payloads (status, bead mode, style, goal count) for the recorded
// video configuration and for a simple love-goal charm design.
import { chromium } from '@playwright/test';

const BASE = (process.argv[2] || 'https://customize.luckycolorstone.com').replace(/\/$/, '');
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'th-TH' });
const page = await context.newPage();
const events = [];
page.on('request', (request) => {
  if (!request.url().includes('/api/analytics/event')) return;
  const body = request.postData() || '';
  if (!body.includes('lumi')) return;
  try {
    const parsed = JSON.parse(body);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    for (const entry of list) events.push({ name: entry.event_name || entry.name, properties: entry.properties || entry.metadata || null });
  } catch (error) { events.push({ raw: body.slice(0, 200) }); }
});

const report = { base: BASE, runs: [] };

const reachStep3 = async () => {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3500);
  await page.locator('#btnLandingLogin').first().click({ timeout: 25000 }).catch(async () => { await page.locator('#landingView button').first().click(); });
  await page.locator('#stepView1.active').waitFor({ state: 'visible', timeout: 40000 });
  await page.locator('#btnNext').first().click();
  await page.locator('#stepView2.active').waitFor({ state: 'visible', timeout: 40000 });
  await page.locator('[data-bead-size="6"]').first().click();
  await page.locator('#btnNext').first().click();
  await page.locator('#stepView3.active').waitFor({ state: 'visible', timeout: 45000 });
  for (let i = 0; i < 16 && await page.locator('.step3-onboarding').count() > 0; i += 1) { await page.mouse.click(195, 780).catch(() => {}); await page.waitForTimeout(400); }
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

const runOnce = async (label, { weekday, date, month, year, goal }) => {
  const marker = events.length;
  await reachStep3();
  await page.locator('#stepView3 .lumi-entry').click();
  await page.locator('.lucky-page1').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator(`[data-lumi-weekday="${weekday}"]`).click();
  await page.locator('[data-lumi-birth-date]').selectOption(String(date));
  await page.locator('[data-lumi-birth-month]').selectOption(String(month));
  await page.locator('[data-lumi-birth-year]').selectOption(String(year));
  const stylePressed = await page.locator('[data-lumi-style="charm"]').getAttribute('aria-pressed');
  if (stylePressed !== 'true') await page.locator('[data-lumi-style="charm"]').click();
  await page.locator('.lucky-page1-actions [data-lumi-action="goals"]').click();
  const goalSelected = await selectGoal(goal);
  await page.locator('.lucky-page2-actions [data-lumi-action="generate"]').click();
  let outcome = null;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    outcome = await page.evaluate(() => ({
      page3: Boolean(document.querySelector('.lucky-page3')),
      message: (document.querySelector('.lumi-state-card h1')?.textContent || '').trim(),
      designing: Boolean(document.querySelector('[data-lumi-designing]'))
    }));
    if (outcome.page3 || outcome.message) break;
    await page.waitForTimeout(1000);
  }
  report.runs.push({ label, inputs: { weekday, date, month, year, goal, stylePressed, goalSelected }, outcome, events: events.slice(marker) });
};

try {
  await runOnce('love-1990', { weekday: 'monday', date: 1, month: 1, year: 1990, goal: 'love' });
  await runOnce('video-config-love', { weekday: 'monday', date: 7, month: 7, year: 2003, goal: 'love' });
} catch (error) {
  report.error = String(error?.message || error).slice(0, 300);
} finally {
  await browser.close();
}
console.log(JSON.stringify(report, null, 1).slice(0, 6000));
