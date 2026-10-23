import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { resolveApplicationRoot, REPO_ROOT } from '../lib/app-root.mjs';
import { browserType, createFixtureBrowserContext } from '../lib/browser-fixtures.mjs';
import { startStaticServer } from '../lib/static-server.mjs';
import { writeEvidence } from '../lib/evidence.mjs';

const require = createRequire(import.meta.url);
const appRoot = resolveApplicationRoot({ requireAdvanced: true });
const backendRoot = path.resolve(
  process.env.QA_BACKEND_ROOT || path.join(REPO_ROOT, '.worktrees', 'phase2-24e-backend')
);
const { validateAuthoritativeOrder } = require(
  path.join(backendRoot, 'server-order-validation.js')
);

const readJson = (name) => JSON.parse(
  fs.readFileSync(path.join(appRoot.root, 'data', name), 'utf8')
);

const settings = structuredClone(readJson('settings.json'));
const stones = structuredClone(readJson('stones.json'));
const spacers = structuredClone(readJson('spacers.json'));
const charms = structuredClone(readJson('charms.json')).map((charm) => ({
  ...charm,
  business: {
    ...(charm.business || {}),
    ...(charm.type === 'pendant'
      ? {}
      : { threadingOccupancyMm: 0 })
  },
  availability: {
    ...(charm.availability || {}),
    isActive: true,
    inStock: true,
    stockQty: Math.max(1, Number(charm.availability?.stockQty ?? charm.stockQty ?? 1)),
    stock_qty: Math.max(1, Number(charm.availability?.stock_qty ?? charm.stock_qty ?? 1))
  },
  isActive: true,
  inStock: true,
  stockQty: Math.max(1, Number(charm.stockQty ?? 1)),
  stock_qty: Math.max(1, Number(charm.stock_qty ?? charm.stockQty ?? 1))
}));

const catalogs = {
  stone: new Map(stones.map((item) => [item.id, item])),
  charm: new Map(charms.map((item) => [item.id, item])),
  spacer: new Map(spacers.map((item) => [item.id, item]))
};

const browser = await browserType().chromium.launch({ headless: true });
const server = await startStaticServer(appRoot.root);
const pageErrors = [];
const consoleErrors = [];
const responseErrors = [];
const results = [];
const capturedOrders = [];

try {
  for (const width of [390, 1440]) {
    const context = await createFixtureBrowserContext(browser, {
      origin: server.origin,
      width,
      settings: structuredClone(settings),
      stones: structuredClone(stones),
      charms: structuredClone(charms),
      spacers: structuredClone(spacers),
      liff: { loggedIn: true, inClient: width <= 600 }
    });
    const page = await context.newPage();
    let checkoutPayload = null;

    page.on('pageerror', (error) => pageErrors.push({ width, message: error.message }));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push({ width, message: message.text() });
    });
    page.on('response', (response) => {
      if (response.status() >= 400) {
        responseErrors.push({ width, status: response.status(), url: response.url() });
      }
    });
    await page.route('**/api/stripe/checkout-session', async (route) => {
      checkoutPayload = JSON.parse(route.request().postData() || '{}');
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({
          id: 'cs_qa_phase232',
          url: '#phase232-qa-checkout',
          amountTotal: 224000,
          currency: 'thb',
          orderId: 'QA-PHASE232'
        })
      });
    });

    await page.goto(`${server.origin}/?phase232_geometry=1`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    await page.locator('#btnLandingLogin').click();
    await page.locator('#stepView1.active').waitFor({ state: 'visible', timeout: 20000 });

    for (let attempt = 0; attempt < 20; attempt += 1) {
      if ((await page.locator('#displaySizeValue').textContent()) === '18.0') break;
      await page.locator('#wristSizeNext').click();
    }
    assert.equal(await page.locator('#displaySizeValue').textContent(), '18.0');

    await page.locator('#btnNext').click();
    await page.locator('#stepView2.active').waitFor({ state: 'visible', timeout: 20000 });
    await page.locator('[data-bead-size="10"]').click();
    await page.locator('#btnNext').click();
    await page.locator('#stepView3.active').waitFor({ state: 'visible', timeout: 30000 });

    const luckyEntry = page.locator('#stepView3 .lumi-entry');
    await luckyEntry.waitFor({ state: 'visible', timeout: 30000 });
    await luckyEntry.click();
    await page.locator('.lucky-page1').waitFor({ state: 'visible', timeout: 30000 });
    await page.locator('[data-lumi-weekday="monday"]').click();
    await page.locator('[data-lumi-birth-date]').selectOption('1');
    await page.locator('[data-lumi-birth-month]').selectOption('1');
    await page.locator('[data-lumi-birth-year]').selectOption('1990');
    await page.locator('[data-lumi-style="charm"]').click();
    await page.locator('.lucky-page1-actions [data-lumi-action="goals"]').click();
    await page.locator('[data-lumi-goal="love"]').click();
    await page.locator('[data-lumi-goal="luck"]').click();
    await page.locator('.lucky-page2-actions [data-lumi-action="generate"]').click();
    await page.locator('.lucky-page3').waitFor({ state: 'visible', timeout: 60000 });
    await page.locator('.lucky-page3-actions [data-lumi-action="use"]').click();
    await page.waitForTimeout(1500);

    const stateAfterLucky = await page.evaluate(() => (
      JSON.parse(localStorage.getItem('lucky_colorstone_state') || 'null')
    ));
    assert.equal(stateAfterLucky?.wristSize, 18);
    assert.equal(String(stateAfterLucky?.beadSize), '10');

    await page.locator('#btnNext').click();
    await page.locator('#stepView4.active').waitFor({ state: 'visible', timeout: 45000 });
    await page.locator('#exportHeroPreview').waitFor({ state: 'visible', timeout: 30000 });
    await page.screenshot({
      path: path.join(REPO_ROOT, 'reports', 'qa', 'checkout', `phase2-32-lucky-${width}.png`),
      fullPage: true
    });

    await page.locator('#shippingRecipientName').fill('QA Geometry Fixture');
    await page.locator('#shippingPhoneNumber').fill('0800000000');
    await page.locator('#shippingAddressLine').fill('QA address');
    await page.locator('#shippingProvince').fill('Bangkok');
    await page.locator('#shippingPostalCode').fill('10110');
    await page.locator('#btnNext').click();
    for (let attempt = 0; attempt < 50 && !checkoutPayload; attempt += 1) {
      await page.waitForTimeout(100);
    }

    assert.ok(checkoutPayload?.order, `checkout payload missing at ${width}px`);

    const order = checkoutPayload.order;
    const charmIds = order.braceletSequence
      .filter((component) => component.type === 'charm')
      .map((component) => component.charmId);
    const stoneCount = order.braceletSequence
      .filter((component) => component.type === 'stone').length;
    const stoneIds = [...new Set(order.braceletSequence
      .filter((component) => component.type === 'stone')
      .map((component) => component.stoneId))];
    const firstComponent = order.braceletSequence[0];
    const firstCharm = firstComponent?.type === 'charm'
      ? catalogs.charm.get(firstComponent.charmId)
      : null;
    assert.equal(stoneCount, 16);
    assert.deepEqual(new Set(charmIds), new Set(['tg01', 'cl01']));
    assert.equal(firstComponent?.charmId, 'tg01');

    const validation = validateAuthoritativeOrder({
      clientOrder: order,
      catalogs,
      settings
    });
    assert.equal(validation.geometry.targetLengthMm, 195);
    assert.equal(validation.geometry.usedLengthMm, 194.2);
    assert.equal(validation.geometry.fitStatus, 'COMPLETE_DISCRETE_CAPACITY');
    assert.equal(validation.completionEligibility.complete, true);

    results.push({
      width,
      order: {
        wristSize: order.wristSize,
        beadSize: order.beadSize,
        braceletLengthMm: validation.geometry.targetLengthMm,
        stoneCount,
        stoneIds,
        stoneVariants: order.stoneVariants,
        charmIds,
        firstFailingItemBeforeFix: firstComponent?.charmId || null,
        firstFailingItemCatalogGeometryBeforeFix: firstCharm ? {
          type: firstCharm.type,
          footprintMm: firstCharm.business?.footprintMm ?? null,
          threadingOccupancyMm: firstCharm.business?.threadingOccupancyMm ?? null
        } : null,
        sequenceLength: order.braceletSequence.length,
        usedLengthMm: validation.geometry.usedLengthMm,
        fitStatus: validation.geometry.fitStatus
      },
      pass: true
    });
    capturedOrders.push(order);
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}

async function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

let stagedBackendResponse = null;
let stagedBackendError = null;
let stagedBackendLog = '';
const stageDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucky-phase232-stage-'));
let backendProcess = null;
try {
  fs.writeFileSync(path.join(stageDataDir, 'stones.json'), JSON.stringify(stones), 'utf8');
  fs.writeFileSync(path.join(stageDataDir, 'charms.json'), JSON.stringify(charms), 'utf8');
  fs.writeFileSync(path.join(stageDataDir, 'spacers.json'), JSON.stringify(spacers), 'utf8');
  fs.writeFileSync(path.join(stageDataDir, 'settings.json'), JSON.stringify(settings), 'utf8');
  fs.writeFileSync(path.join(stageDataDir, 'orders.json'), '[]', 'utf8');

  const port = await findAvailablePort();
  backendProcess = spawn(process.execPath, ['server.js'], {
    cwd: backendRoot,
    windowsHide: true,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: stageDataDir,
      SUPABASE_URL: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
      STRIPE_SECRET_KEY: ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  backendProcess.stdout.on('data', (chunk) => {
    stagedBackendLog += chunk.toString();
  });
  backendProcess.stderr.on('data', (chunk) => {
    stagedBackendLog += chunk.toString();
  });

  const origin = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`${origin}/api/settings`);
      if (response.ok) break;
    } catch {}
    if (attempt === 99) throw new Error('Local backend did not become ready.');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const response = await fetch(`${origin}/api/stripe/checkout-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin,
      checkoutAttemptId: 'phase232-qa-checkout-attempt',
      order: capturedOrders[0]
    })
  });
  stagedBackendResponse = {
    status: response.status,
    body: await response.json()
  };
  assert.equal(stagedBackendResponse.status, 500);
  assert.match(stagedBackendResponse.body?.error || '', /STRIPE_SECRET_KEY is not configured/);
  assert.doesNotMatch(stagedBackendResponse.body?.error || '', /threading geometry/i);
} catch (error) {
  stagedBackendError = error.stack || error.message;
} finally {
  if (backendProcess) backendProcess.kill();
  const resolvedStageDir = fs.realpathSync(stageDataDir);
  const resolvedTempDir = fs.realpathSync(os.tmpdir());
  if (
    resolvedStageDir.startsWith(`${resolvedTempDir}${path.sep}`)
    && path.basename(resolvedStageDir).startsWith('lucky-phase232-stage-')
  ) {
    fs.rmSync(resolvedStageDir, { recursive: true, force: true });
  }
}

const result = {
  completedAt: new Date().toISOString(),
  appRoot: appRoot.root,
  backendRoot,
  checks: results,
  pageErrors,
  consoleErrors,
  responseErrors,
  checkoutNetworkInvoked: false,
  stagedBackendResponse,
  stagedBackendError,
  pass: results.length === 2
    && results.every((entry) => entry.pass)
    && stagedBackendResponse?.status === 500
    && /STRIPE_SECRET_KEY is not configured/.test(stagedBackendResponse?.body?.error || '')
    && !stagedBackendError
    && pageErrors.length === 0
    && consoleErrors.length === 0
    && responseErrors.length === 0
};
const outputPath = writeEvidence('reports/qa/checkout/phase2-32-lucky-geometry.json', result);
console.log(JSON.stringify({
  pass: result.pass,
  checks: results.length,
  pageErrors: pageErrors.length,
  consoleErrors: consoleErrors.length,
  responseErrors: responseErrors.length,
  outputPath
}, null, 2));
if (!result.pass) process.exitCode = 1;
