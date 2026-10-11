import { test, expect } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

// Issue 2 regression: the four Lucky fallback states must never render the literal word "undefined",
// each must show its own copy, and the recorded video scenario (Monday / 07-07-2003 / with charm /
// all six goals) must reach the no-recommendation card with real copy.
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

const HARNESS = '/tests/production-bugfix-batch/lucky-copy-harness.html';
const shellText = (page) => page.evaluate(() => document.querySelector('.lumi-shell')?.innerText || '');
const buttonLabels = (page) => page.evaluate(() => [...document.querySelectorAll('.lumi-shell .lumi-actions [data-lumi-action]')].map((node) => ({ action: node.dataset.lumiAction, label: node.textContent.trim() })));

const EXPECTED = {
  NO_RECOMMENDATION: { heading: 'ยังหาแบบที่พอดีกับตัวเลือกนี้ไม่ได้', primary: 'กลับไปออกแบบเอง', action: 'close' },
  STALE_CONTEXT: { heading: 'ตัวเลือกของคุณเปลี่ยนไปแล้ว', primary: 'ให้ Lucky แนะนำใหม่', action: 'generate' },
  STALE_CATALOG: { heading: 'มีบางชิ้นในแบบนี้เปลี่ยนแปลงแล้ว', primary: 'ให้ Lucky เลือกแบบใหม่ให้คุณ', action: 'generate' },
  ERROR: { heading: 'Lucky ยังทำงานไม่สำเร็จ', primary: 'ลองอีกครั้ง', action: 'generate', secondary: 'กลับไปออกแบบเอง' }
};

for (const [state, expected] of Object.entries(EXPECTED)) {
  test(`${state}: approved Thai copy, no "undefined", and a working action`, async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseUrl}${HARNESS}?state=${state}`);
    await expect(page.locator('.lumi-shell .lumi-state-card h1')).toHaveText(expected.heading);

    const text = await shellText(page);
    expect(text.includes('undefined'), `"undefined" must never be shown in state ${state}`).toBe(false);
    await expect(page.locator('.lumi-shell')).not.toContainText('undefined');
    await expect(page.locator('.lumi-shell')).not.toContainText('[object Object]');

    const buttons = await buttonLabels(page);
    const primary = buttons.find((entry) => entry.action === expected.action);
    expect(primary, `${state} must expose the ${expected.action} action`).toBeTruthy();
    expect(primary.label).toBe(expected.primary);
    if (expected.secondary) {
      const secondary = buttons.find((entry) => entry.action === 'close');
      expect(secondary?.label).toBe(expected.secondary);
    }

    // The primary action must actually do something: retry regenerates, close returns to the editor.
    if (expected.action === 'generate') {
      await page.locator(`.lumi-shell [data-lumi-action="generate"]`).click();
      await page.waitForTimeout(600);
      const calls = await page.evaluate(() => window.__luckyQa.ledger.generateCalls);
      expect(calls, 'retry must re-run the recommendation').toBe(1);
    } else {
      await page.locator(`.lumi-shell [data-lumi-action="close"]`).first().click();
      await expect(page.locator('.lumi-shell')).toHaveCount(0);
    }
    await page.screenshot({ path: `tests/production-bugfix-batch/evidence/lucky-copy-${state}.png` });
  });
}

test('video scenario (Monday 07-07-2003, with charm, all six goals) shows real copy instead of "undefined"', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}${HARNESS}?engine=video`);
  await expect(page.locator('.lucky-page1')).toBeVisible({ timeout: 15000 });

  await page.locator('[data-lumi-weekday="monday"]').click();
  await page.locator('[data-lumi-birth-date]').selectOption('7');
  await page.locator('[data-lumi-birth-month]').selectOption('7');
  await page.locator('[data-lumi-birth-year]').selectOption('2003');
  const charmStyle = page.locator('[data-lumi-style="charm"]');
  if (await charmStyle.getAttribute('aria-pressed') !== 'true') await charmStyle.click();
  expect(await charmStyle.getAttribute('aria-pressed'), 'the recorded flow used the charm/talisman style').toBe('true');
  await page.locator('.lucky-page1-actions [data-lumi-action="goals"]').click();
  await page.locator('[data-lumi-action="select-all-goals"]').click();
  const selectedGoals = await page.locator('[data-lumi-goal][aria-pressed="true"]').count();
  expect(selectedGoals, 'the recorded flow selected all six goals').toBe(6);
  await page.locator('.lucky-page2-actions [data-lumi-action="generate"]').click();

  // The designing transition runs for at least DESIGNING_MIN_MS (8s) before the result state renders.
  await expect(page.locator('.lumi-shell .lumi-state-card h1')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.lumi-shell .lumi-state-card h1')).toHaveText(EXPECTED.NO_RECOMMENDATION.heading, { timeout: 60000 });
  const text = await shellText(page);
  expect(text.includes('undefined'), 'the recorded flow must not show "undefined"').toBe(false);
  const buttons = await buttonLabels(page);
  expect(buttons.find((entry) => entry.action === 'close')?.label).toBe(EXPECTED.NO_RECOMMENDATION.primary);
  await page.screenshot({ path: 'tests/production-bugfix-batch/evidence/lucky-copy-video-scenario.png' });
});
