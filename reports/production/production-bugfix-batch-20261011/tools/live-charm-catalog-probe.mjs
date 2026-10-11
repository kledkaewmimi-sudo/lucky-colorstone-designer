// Diagnoses why the live Lucky charm flow returns no recommendation: checks whether the customer app's
// own charm catalog (the snapshot the engine receives) is populated on the live domain.
import { chromium } from '@playwright/test';

const BASE = (process.argv[2] || 'https://customize.luckycolorstone.com').replace(/\/$/, '');
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'th-TH' });
const page = await context.newPage();
const api = [];
page.on('response', (response) => { const url = response.url(); if (url.includes('/api/')) api.push(response.status() + ' ' + url.replace(BASE, '').slice(0, 60)); });

const steps = {};
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
  for (let i = 0; i < 16 && await page.locator('.step3-onboarding').count() > 0; i += 1) { await page.mouse.click(195, 780).catch(() => {}); await page.waitForTimeout(400); }
  await page.locator('#catalogTypeFilter [data-catalog-section="charms"]').click();
  await page.waitForTimeout(2500);
  steps.charmCards = await page.locator('#charmSectionMount .charm-component-section .stone-card').count();
  steps.charmIds = await page.evaluate(() => [...document.querySelectorAll('#charmSectionMount .charm-component-section .stone-card')].map((node) => node.getAttribute('data-charm-id')));
  steps.stoneCards = await page.locator('#stepView3 .stone-card[data-stone-id]').count();
  steps.braceletSvgNodes = await page.evaluate(() => document.querySelectorAll('#braceletSvg *').length);
  steps.apiCalls = api;
  await page.screenshot({ path: 'reports/production/production-bugfix-batch-20261011/evidence/live-charm-tab.png', fullPage: true });
} catch (error) {
  steps.error = String(error?.message || error).slice(0, 200);
} finally {
  await browser.close();
}
console.log(JSON.stringify(steps, null, 1));
