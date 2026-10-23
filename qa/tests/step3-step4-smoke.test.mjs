import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { resolveApplicationRoot, REPO_ROOT } from '../lib/app-root.mjs';
import { browserType, createFixtureBrowserContext } from '../lib/browser-fixtures.mjs';
import { startStaticServer } from '../lib/static-server.mjs';
import { writeEvidence } from '../lib/evidence.mjs';

let appRoot;
try {
  appRoot = resolveApplicationRoot({ requireAdvanced: true });
} catch (error) {
  const skipped = {
    completedAt: new Date().toISOString(),
    status: 'SKIPPED',
    reason: error.message,
    requiredEnv: ['QA_APP_ROOT or a local production candidate']
  };
  writeEvidence('reports/qa/browser/step3-step4-smoke.json', skipped);
  console.log(JSON.stringify(skipped, null, 2));
  process.exit(0);
}
const data = (name) => JSON.parse(fs.readFileSync(path.join(appRoot.root, 'data', name), 'utf8'));
const fixtures = {
  stones: data('stones.json'),
  charms: data('charms.json'),
  spacers: data('spacers.json'),
  settings: data('settings.json')
};
const server = await startStaticServer(appRoot.root);
const browser = await browserType().chromium.launch({ headless: true });
const checks = [];
const pageErrors = [];
const consoleErrors = [];
fs.mkdirSync(path.join(REPO_ROOT, 'reports', 'qa', 'browser'), { recursive: true });

try {
  for (const width of [390, 1440]) {
    const settings = structuredClone(fixtures.settings);
    const context = await createFixtureBrowserContext(browser, {
      origin: server.origin,
      width,
      settings,
      stones: fixtures.stones,
      charms: fixtures.charms,
      spacers: fixtures.spacers
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => pageErrors.push({ width, message: error.message }));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push({ width, text: message.text() });
    });

    await page.goto(`${server.origin}/?mock=1`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.locator('#btnLandingLogin').click({ timeout: 20000 });
    await page.locator('#stepView1.active').waitFor({ state: 'visible', timeout: 30000 });
    await page.locator('#btnNext').click();
    await page.locator('#stepView2.active').waitFor({ state: 'visible', timeout: 20000 });
    await page.locator('[data-bead-size="6"]').click();
    await page.locator('#btnNext').click();
    await page.locator('#stepView3.active').waitFor({ state: 'visible', timeout: 30000 });
    await page.locator('[data-catalog-section="stones"]').click();
    const stone = page.locator('.stone-card[data-stone-id]').first();
    await stone.waitFor({ state: 'visible', timeout: 20000 });
    const lumiEntry = page.locator('#stepView3 .lumi-entry');
    if (await lumiEntry.isVisible().catch(() => false)) {
      await lumiEntry.click();
      await page.locator('.lucky-page1').waitFor({ state: 'visible', timeout: 45000 });
      await page.locator('[data-lumi-weekday="monday"]').click();
      await page.locator('[data-lumi-birth-date]').selectOption('1');
      await page.locator('[data-lumi-birth-month]').selectOption('1');
      await page.locator('[data-lumi-birth-year]').selectOption('1990');
      await page.locator('.lucky-page1-actions [data-lumi-action="goals"]').click();
      const goal = page.locator('[data-lumi-goal="love"]');
      await goal.click({ position: { x: 6, y: 6 } });
      if (await goal.getAttribute('aria-pressed') !== 'true') {
        await goal.evaluate((button) => button.click());
      }
      await page.locator('.lucky-page2-actions [data-lumi-action="generate"]').click();
      await page.locator('.lucky-page3').waitFor({ state: 'visible', timeout: 60000 });
      await page.locator('.lucky-page3-actions [data-lumi-action="use"]').click();
      await page.waitForTimeout(1000);
    } else {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (!(await page.locator('#btnNext').isDisabled())) break;
        await stone.click();
        await page.waitForTimeout(30);
      }
    }
    assert.equal(await page.locator('#btnNext').isDisabled(), false, `Step 3 did not complete at ${width}px`);
    await page.locator('#btnNext').click();
    await page.locator('#stepView4.active').waitFor({ state: 'visible', timeout: 45000 });
    checks.push({ width, step4Reached: true });
    await page.screenshot({
      path: path.join(REPO_ROOT, 'reports', 'qa', 'browser', `step4-${width}.png`),
      fullPage: true
    });
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}

const result = {
  completedAt: new Date().toISOString(),
  appRoot: appRoot.root,
  appRootSource: appRoot.source,
  checks,
  pageErrors,
  consoleErrors,
  pass: checks.length === 2 && pageErrors.length === 0 && consoleErrors.length === 0
};
writeEvidence('reports/qa/browser/step3-step4-smoke.json', result);
console.log(JSON.stringify(result, null, 2));
if (!result.pass) process.exitCode = 1;
