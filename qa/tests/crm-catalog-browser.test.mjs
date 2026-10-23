import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { resolveApplicationRoot, REPO_ROOT } from '../lib/app-root.mjs';

const require = createRequire(import.meta.url);
const evidenceDir = path.join(REPO_ROOT, 'reports', 'qa', 'browser');
fs.mkdirSync(evidenceDir, { recursive: true });
let resolvedApp;
try {
  resolvedApp = resolveApplicationRoot({ requireAdvanced: true });
} catch (error) {
  const skipped = {
    completedAt: new Date().toISOString(),
    status: 'SKIPPED',
    reason: error.message,
    requiredEnv: ['QA_APP_ROOT or a local production candidate']
  };
  fs.writeFileSync(path.join(evidenceDir, 'browser-acceptance-skipped.json'), `${JSON.stringify(skipped, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(skipped, null, 2));
  process.exit(0);
}
const candidateRoot = resolvedApp.root;
const { chromium } = require(path.join(REPO_ROOT, 'node_modules', 'playwright'));

const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(candidateRoot, relativePath), 'utf8'));
const pendantFixtures = [
  {
    id: 'phase27-gold-heart-pendant',
    sku: 'PH27-GOLD-HEART-PENDANT',
    name: { en: 'Gold Heart Pendant', th: '\u0E08\u0E35\u0E49\u0E2B\u0E31\u0E27\u0E43\u0E08\u0E17\u0E2D\u0E07' },
    slug: 'phase27-gold-heart-pendant',
    type: 'pendant',
    image: { primary: 'assets/charms/heart-gold.webp' },
    inStock: true,
    pricing: { base: 160 },
    business: { sizeCm: 1.9, footprintMm: 7 },
    isActive: true,
    stockQty: 900,
    stock_qty: 900,
    categoryId: 'charms',
    collection: 'charms',
    entityType: 'charm',
    availability: { inStock: true, isActive: true, stockQty: 900, stock_qty: 900 },
    displayOrder: 9320,
    presentation: 'hanging',
    renderTuning: {}
  },
  {
    id: 'phase27-gold-star-pendant',
    sku: 'PH27-GOLD-STAR-PENDANT',
    name: { en: 'Gold Star Pendant', th: '\u0E08\u0E35\u0E49\u0E14\u0E32\u0E27\u0E17\u0E2D\u0E07' },
    slug: 'phase27-gold-star-pendant',
    type: 'pendant',
    image: { primary: 'assets/charms/star-gold.webp' },
    inStock: true,
    pricing: { base: 99 },
    business: { sizeCm: 1.4, footprintMm: 10 },
    isActive: true,
    stockQty: 1010,
    stock_qty: 1010,
    categoryId: 'charms',
    collection: 'charms',
    entityType: 'charm',
    availability: { inStock: true, isActive: true, stockQty: 1010, stock_qty: 1010 },
    displayOrder: 9320,
    presentation: 'hanging',
    renderTuning: {}
  }
];

const stones = readJson('data/stones.json');
const charms = [...pendantFixtures, ...readJson('data/charms.json')];
const spacers = readJson('data/spacers.json');
const baseSettings = readJson('data/settings.json');
const settings = {
  ...baseSettings,
  catalogLayoutOrder: {
    ...(baseSettings.catalogLayoutOrder || {}),
    charms: [
      'phase27-gold-heart-pendant',
      'phase27-gold-star-pendant',
      ...((baseSettings.catalogLayoutOrder || {}).charms || []).filter((id) => !id.startsWith('phase27-gold-'))
    ],
    spacers: [
      'phase27-gold-star-bead',
      'phase27-gold-ball',
      'mallow',
      'pony',
      ...((baseSettings.catalogLayoutOrder || {}).spacers || []).filter((id) => !['phase27-gold-star-bead', 'phase27-gold-ball', 'mallow', 'pony'].includes(id))
    ]
  },
  catalogBadgePresets: [],
  catalogItemBadges: {}
};

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.mp4': 'video/mp4'
};

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
  let relativePath = decodeURIComponent(requestUrl.pathname);
  if (relativePath === '/' || relativePath === '/crm' || relativePath === '/crm/') {
    relativePath = '/index.html';
  }
  if (relativePath === '/crm.html') relativePath = '/crm.html';
  const filePath = path.resolve(candidateRoot, `.${relativePath}`);
  if (!filePath.startsWith(candidateRoot) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  response.writeHead(200, {
    'content-type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
    'cache-control': 'no-store'
  });
  fs.createReadStream(filePath).pipe(response);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const staticOrigin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const pageErrors = [];
const consoleErrors = [];
const responseErrors = [];
const checks = [];
const check = (name, pass, details = {}) => checks.push({ name, pass: Boolean(pass), ...details });

async function installApiRoutes(context, { customer = false } = {}) {
  await context.route('**/*', async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    if (requestUrl.origin !== staticOrigin) {
      if (/google|facebook|tiktok|line-scdn|stripe/i.test(requestUrl.hostname)) {
        await route.fulfill({ status: 204, body: '' });
      } else {
        await route.abort();
      }
      return;
    }
    if (!requestUrl.pathname.startsWith('/api/')) {
      if (requestUrl.pathname === '/assets/charms/_placeholder.png') {
        await route.fulfill({
          status: 200,
          contentType: 'image/webp',
          path: path.join(candidateRoot, 'assets', 'charms', 'heart-gold.webp')
        });
        return;
      }
      await route.continue();
      return;
    }

    const json = async (payload, status = 200) => route.fulfill({
      status,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(payload)
    });

    if (requestUrl.pathname === '/api/admin/session') return json({ authenticated: true });
    if (requestUrl.pathname === '/api/admin/login') return json({ authenticated: true });
    if (requestUrl.pathname === '/api/settings' && request.method() === 'GET') return json(settings);
    if (requestUrl.pathname === '/api/settings/save' && request.method() === 'POST') {
      const body = JSON.parse(request.postData() || '{}');
      Object.keys(settings).forEach((key) => delete settings[key]);
      Object.assign(settings, body);
      return json(settings);
    }
    if (requestUrl.pathname === '/api/stones') return json(stones);
    if (requestUrl.pathname === '/api/charms') return json(charms);
    if (requestUrl.pathname === '/api/spacers') return json(spacers);
    if (requestUrl.pathname === '/api/purchases') return json([]);
    if (requestUrl.pathname === '/api/purchase-costs') return json({ stones: [], charms: [], spacers: [] });
    if (requestUrl.pathname === '/api/crm/overview') {
      return json({ paidOrderCount: 0, revenue: 0, recentOrders: [] });
    }
    if (requestUrl.pathname === '/api/crm/orders') {
      return json({ orders: [], page: 1, limit: 20, total: 0, totalPages: 0, previewTransport: 'url' });
    }
    if (requestUrl.pathname === '/api/liff-config') return json({});
    if (requestUrl.pathname === '/api/tracking/config') return json({ enabled: false });
    if (requestUrl.pathname === '/api/social-proof') return json({ recentBracelets: [] });
    if (requestUrl.pathname.startsWith('/api/analytics/')) return route.fulfill({ status: 204, body: '' });
    return json(customer ? {} : { success: true });
  });
}

function attachDiagnostics(page, label) {
  page.on('pageerror', (error) => pageErrors.push({ label, message: error.message }));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push({ label, text: message.text() });
  });
  page.on('response', (response) => {
    if (response.status() >= 400) responseErrors.push({ label, status: response.status(), url: response.url() });
  });
}

async function newCrmPage(width = 1440) {
  const context = await browser.newContext({
    viewport: { width, height: width <= 600 ? 844 : 1000 },
    serviceWorkers: 'block'
  });
  await context.addInitScript(() => {
    localStorage.setItem('lucky_crm_session', 'true');
  });
  await installApiRoutes(context);
  const page = await context.newPage();
  attachDiagnostics(page, `crm-${width}`);
  await page.goto(`${staticOrigin}/crm.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.locator('#dashboardContainer').waitFor({ state: 'visible', timeout: 30000 });
  return { context, page };
}

async function openInventory(page) {
  await page.locator('#btnTabInventory:visible, #btnMobTabInventory:visible').first().click();
  await page.locator('#tabInventory.active').waitFor({ state: 'visible', timeout: 20000 });
  await page.locator('#inventoryTableBody tr').first().waitFor({ state: 'visible', timeout: 30000 });
}

async function assignBanner(page, itemId, presetValue) {
  await page.locator('#inventorySearch').fill(itemId);
  const button = page.locator(`#inventoryTableBody button.action-btn.banner[data-id="${itemId}"]`);
  await button.waitFor({ state: 'visible', timeout: 20000 });
  await button.click();
  await page.locator('#badgeAssignmentModal.show').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('#badgeAssignmentSelect').selectOption(presetValue);
  const responsePromise = page.waitForResponse((response) => (
    response.url().endsWith('/api/settings/save') && response.request().method() === 'POST'
  ));
  await page.locator('#badgeAssignmentForm button[type="submit"]').click();
  const response = await responsePromise;
  assert.equal(response.status(), 200);
  await page.locator(`#inventoryTableBody button.action-btn.banner[data-id="${itemId}"]`).waitFor({ state: 'visible', timeout: 20000 });
}

async function openLayout(page) {
  await page.locator('#btnTabSimulator').click();
  await page.locator('#tabSimulator.active').waitFor({ state: 'visible', timeout: 20000 });
  await page.locator('#simulatorItemGrid').waitFor({ state: 'visible', timeout: 30000 });
}

try {
  const { context: desktopContext, page: desktopPage } = await newCrmPage(1440);

  await openInventory(desktopPage);
  for (const pendant of pendantFixtures) {
    await desktopPage.locator('#inventorySearch').fill(pendant.id);
    const bannerButton = desktopPage.locator(`#inventoryTableBody button.action-btn.banner[data-id="${pendant.id}"]`);
    await bannerButton.waitFor({ state: 'visible', timeout: 20000 });
    const rowText = await bannerButton.locator('xpath=ancestor::tr').innerText();
    check(`Inventory presents ${pendant.name.en} as spacer`, rowText.includes('\u0E0A\u0E32\u0E23\u0E4C\u0E21'), { rowText });
  }

  await openLayout(desktopPage);
  await desktopPage.locator('[data-simulator-category="charms"]').click();
  for (const pendant of pendantFixtures) {
    const count = await desktopPage.locator(`[data-layout-item-id="${pendant.id}"]`).count();
    check(`${pendant.name.en} is absent from Layout Talisman tab`, count === 0, { count });
  }
  check('Normal talisman remains in Layout Talisman tab',
    await desktopPage.locator('[data-layout-item-id="px01"]').count() === 1
    && await desktopPage.locator('[data-layout-item-id="mallow"]').count() === 0
  );
  await desktopPage.locator('[data-simulator-category="spacers"]').click();
  for (const pendant of pendantFixtures) {
    const count = await desktopPage.locator(`[data-layout-item-id="${pendant.id}"]`).count();
    check(`${pendant.name.en} is present in Layout Charm tab`, count === 1, { count });
  }
  check('Normal spacer remains in Layout Charm tab',
    await desktopPage.locator('[data-layout-item-id="mallow"]').count() === 1
    && await desktopPage.locator('[data-layout-item-id="px01"]').count() === 0
  );

  const beforeOrder = await desktopPage.locator('.catalog-layout-card').evaluateAll((cards) => cards.map((card) => card.dataset.layoutItemId));
  await desktopPage.locator('[data-layout-item-id="phase27-gold-star-pendant"]')
    .dragTo(desktopPage.locator('[data-layout-item-id="mallow"]'));
  const afterDragOrder = await desktopPage.locator('.catalog-layout-card').evaluateAll((cards) => cards.map((card) => card.dataset.layoutItemId));
  check('Charm layout reorder changes the draft order', JSON.stringify(beforeOrder) !== JSON.stringify(afterDragOrder), {
    beforeOrder,
    afterDragOrder
  });
  check('Reordering pendants preserves normal spacer relative order',
    afterDragOrder.filter((id) => !id.startsWith('phase27-gold-')).join('|')
      === beforeOrder.filter((id) => !id.startsWith('phase27-gold-')).join('|')
  );
  const layoutSavePromise = desktopPage.waitForResponse((response) => (
    response.url().endsWith('/api/settings/save') && response.request().method() === 'POST'
  ));
  await desktopPage.locator('#btnSimulatorSaveLayout').click();
  assert.equal((await layoutSavePromise).status(), 200);
  await desktopPage.reload({ waitUntil: 'domcontentloaded' });
  await desktopPage.locator('#dashboardContainer').waitFor({ state: 'visible', timeout: 30000 });
  await openLayout(desktopPage);
  await desktopPage.locator('[data-simulator-category="spacers"]').click();
  const savedOrder = await desktopPage.locator('.catalog-layout-card').evaluateAll((cards) => cards.map((card) => card.dataset.layoutItemId));
  check('Saved Charm layout order survives reload', JSON.stringify(savedOrder) === JSON.stringify(afterDragOrder), {
    savedOrder,
    expected: afterDragOrder
  });

  await desktopPage.locator('#btnTabSettings').click();
  await desktopPage.locator('#tabSettings.active').waitFor({ state: 'visible', timeout: 20000 });
  await desktopPage.locator('#badgePresetList').getByText('No custom banners yet').waitFor({ state: 'visible', timeout: 20000 });
  await desktopPage.locator('#badgePresetLabel').fill('Limited QA');
  await desktopPage.locator('#badgePresetTextColor').evaluate((input) => {
    input.value = '#fde68a';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await desktopPage.locator('#badgePresetBackgroundColor').evaluate((input) => {
    input.value = '#0f172a';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const presetSavePromise = desktopPage.waitForResponse((response) => (
    response.url().endsWith('/api/settings/save') && response.request().method() === 'POST'
  ));
  await desktopPage.locator('#badgePresetForm button[type="submit"]').click();
  assert.equal((await presetSavePromise).status(), 200);
  const customPreset = (settings.catalogBadgePresets || []).find((preset) => preset.label === 'Limited QA');
  check('Custom banner is persisted', Boolean(customPreset), { customPreset });
  assert.ok(customPreset?.id);

  await openInventory(desktopPage);
  await assignBanner(desktopPage, 'amethyst', 'new');
  await assignBanner(desktopPage, 'green_jade', 'bestseller');
  await assignBanner(desktopPage, 'px01', 'bestseller');
  await assignBanner(desktopPage, 'mallow', customPreset.id);
  await assignBanner(desktopPage, 'phase27-gold-heart-pendant', 'new');

  await desktopPage.reload({ waitUntil: 'domcontentloaded' });
  await desktopPage.locator('#dashboardContainer').waitFor({ state: 'visible', timeout: 30000 });
  await openInventory(desktopPage);
  await desktopPage.locator('#inventorySearch').fill('amethyst');
  const persistedButton = desktopPage.locator('#inventoryTableBody button.action-btn.banner[data-id="amethyst"]');
  await persistedButton.click();
  await desktopPage.locator('#badgeAssignmentModal.show').waitFor({ state: 'visible', timeout: 10000 });
  check('Banner assignment persists after CRM reload', await desktopPage.locator('#badgeAssignmentSelect').inputValue() === 'new');
  await desktopPage.locator('#btnCancelBadgeAssignment').click();

  await desktopPage.locator('#btnTabSettings').click();
  await desktopPage.locator('#tabSettings.active').waitFor({ state: 'visible', timeout: 20000 });
  await desktopPage.locator('#badgePresetList').waitFor({ state: 'visible', timeout: 20000 });
  await desktopPage.locator(`[data-badge-preset-edit="${customPreset.id}"]`).click();
  await desktopPage.waitForFunction(
    (presetId) => document.querySelector('#badgePresetEditId')?.value === presetId,
    customPreset.id
  );
  await desktopPage.locator('#badgePresetLabel').fill('Limited Edited');
  await desktopPage.locator('#badgePresetBackgroundColor').evaluate((input) => {
    input.value = '#334155';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const editSavePromise = desktopPage.waitForResponse((response) => (
    response.url().endsWith('/api/settings/save') && response.request().method() === 'POST'
  ));
  await desktopPage.locator('#badgePresetForm button[type="submit"]').click();
  assert.equal((await editSavePromise).status(), 200);
  const editedPreset = (settings.catalogBadgePresets || []).find((preset) => preset.id === customPreset.id);
  check('Custom banner edit persists',
    editedPreset?.label === 'Limited Edited' && editedPreset?.backgroundColor === '#334155',
    { editedPreset }
  );

  await desktopPage.screenshot({
    path: path.join(evidenceDir, 'crm-desktop-settings.png'),
    fullPage: true
  });
  await desktopContext.close();

  const mobileCrm = await newCrmPage(390);
  await openInventory(mobileCrm.page);
  await mobileCrm.page.locator('#inventorySearch').fill('phase27-gold-heart-pendant');
  await mobileCrm.page.locator('#inventoryTableBody button.action-btn.banner[data-id="phase27-gold-heart-pendant"]').waitFor({ state: 'visible', timeout: 20000 });
  await mobileCrm.page.locator('#btnTabSettings:visible, #btnMobTabSettings:visible').first().click();
  await mobileCrm.page.locator('#tabSettings.active').waitFor({ state: 'visible', timeout: 20000 });
  await mobileCrm.page.locator('#badgePresetForm').waitFor({ state: 'visible', timeout: 10000 });
  check('Mobile CRM banner controls remain usable', true);
  await mobileCrm.page.screenshot({
    path: path.join(evidenceDir, 'crm-mobile-settings.png'),
    fullPage: true
  });
  await mobileCrm.context.close();

  for (const width of [390, 1440]) {
    const customerContext = await browser.newContext({
      viewport: { width, height: width === 390 ? 844 : 1000 },
      serviceWorkers: 'block'
    });
    await customerContext.addInitScript(() => {
      localStorage.setItem('lucky_step3_onboarding_v1', 'completed');
      sessionStorage.setItem('lucky_colorstone_landing_dismissed', '1');
      window.liff = {
        init: async () => {},
        isLoggedIn: () => true,
        isInClient: () => true,
        getProfile: async () => ({ userId: 'U_PHASE229_BANNER', displayName: 'Banner QA' }),
        getFriendship: async () => ({ friendFlag: true }),
        getContext: () => ({ viewType: 'full' })
      };
    });
    await installApiRoutes(customerContext, { customer: true });
    const page = await customerContext.newPage();
    attachDiagnostics(page, `customer-${width}`);
    await page.goto(staticOrigin, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.locator('#btnLandingLogin').click({ timeout: 20000 });
    await page.locator('#stepView1.active').waitFor({ state: 'visible', timeout: 30000 });
    await page.locator('#btnNext').click();
    await page.locator('#stepView2.active').waitFor({ state: 'visible', timeout: 20000 });
    await page.locator('[data-bead-size="10"]').click();
    await page.locator('#btnNext').click();
    await page.locator('#stepView3.active').waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForTimeout(800);

    await page.locator('[data-catalog-section="stones"]').click();
    const amethystBadge = page.locator('[data-stone-id="amethyst"] .product-badge');
    await amethystBadge.waitFor({ state: 'visible', timeout: 20000 });
    check(`Customer new preset renders at ${width}px`,
      (await amethystBadge.innerText()).trim() === '\u0E43\u0E2B\u0E21\u0E48'
      && await amethystBadge.evaluate((node) => getComputedStyle(node).backgroundColor) === 'rgb(238, 232, 255)'
    );
    check(`Unassigned legacy stone badge remains unchanged at ${width}px`,
      (await page.locator('[data-stone-id="kyanite"] .product-badge').innerText()).trim() === '\u0E43\u0E2B\u0E21\u0E48'
    );

    await page.locator('[data-catalog-section="charms"]').click();
    const cloverBadge = page.locator('[data-charm-id="px01"] .product-badge');
    await cloverBadge.waitFor({ state: 'visible', timeout: 20000 });
    check(`Customer bestseller preset renders at ${width}px`,
      (await cloverBadge.innerText()).trim() === '\u0E02\u0E32\u0E22\u0E14\u0E35\u2728'
      && await cloverBadge.evaluate((node) => getComputedStyle(node).backgroundColor) === 'rgb(200, 16, 46)'
    );
    await page.locator('[data-catalog-section="spacer"]').click();
    check(`Normal charms and spacers remain in their customer tabs at ${width}px`,
      await page.locator('[data-spacer-id="mallow"]').filter({ visible: true }).count() === 1
      && await page.locator('[data-charm-id="px01"]').filter({ visible: true }).count() === 0
    );
    const pendantBadge = page.locator('[data-charm-id="phase27-gold-heart-pendant"] .product-badge');
    await pendantBadge.waitFor({ state: 'visible', timeout: 20000 });
    check(`Pendant banner renders in customer Charm tab at ${width}px`,
      (await pendantBadge.innerText()).trim() === '\u0E43\u0E2B\u0E21\u0E48'
    );
    const pendantCardOrder = await page.locator('[data-charm-id^="phase27-gold-"][data-charm-id$="-pendant"]')
      .evaluateAll((cards) => cards.map((card) => card.dataset.charmId));
    check(`Customer pendant order follows saved Charm layout at ${width}px`,
      JSON.stringify(pendantCardOrder) === JSON.stringify(['phase27-gold-star-pendant', 'phase27-gold-heart-pendant']),
      { pendantCardOrder }
    );
    const customBadge = page.locator('[data-spacer-id="mallow"] .product-badge');
    await customBadge.waitFor({ state: 'visible', timeout: 20000 });
    const customBadgeText = (await customBadge.innerText()).trim();
    const customBadgeStyle = await customBadge.evaluate((node) => ({
      backgroundColor: getComputedStyle(node).backgroundColor,
      color: getComputedStyle(node).color
    }));
    check(`Customer custom banner edit renders at ${width}px`,
      customBadgeText === 'Limited Edited'
      && customBadgeStyle.backgroundColor === 'rgb(51, 65, 85)'
      && customBadgeStyle.color === 'rgb(253, 230, 138)',
      { customBadgeText, customBadgeStyle }
    );
    await page.screenshot({
      path: path.join(evidenceDir, `customer-step3-banners-${width}.png`),
      fullPage: true
    });
    await customerContext.close();
  }

  const noneCrm = await newCrmPage(1440);
  await openInventory(noneCrm.page);
  await assignBanner(noneCrm.page, 'kyanite', 'none');
  await noneCrm.context.close();
  const noneContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block'
  });
  await noneContext.addInitScript(() => {
    localStorage.setItem('lucky_step3_onboarding_v1', 'completed');
    sessionStorage.setItem('lucky_colorstone_landing_dismissed', '1');
    window.liff = {
      init: async () => {}, isLoggedIn: () => true, isInClient: () => true,
      getProfile: async () => ({ userId: 'U_PHASE229_NONE', displayName: 'Banner QA' }),
      getFriendship: async () => ({ friendFlag: true }), getContext: () => ({ viewType: 'full' })
    };
  });
  await installApiRoutes(noneContext, { customer: true });
  const nonePage = await noneContext.newPage();
  attachDiagnostics(nonePage, 'customer-none');
  await nonePage.goto(staticOrigin, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await nonePage.locator('#btnLandingLogin').click({ timeout: 20000 });
  await nonePage.locator('#stepView1.active').waitFor({ state: 'visible', timeout: 30000 });
  await nonePage.locator('#btnNext').click();
  await nonePage.locator('#stepView2.active').waitFor({ state: 'visible', timeout: 20000 });
  await nonePage.locator('[data-bead-size="10"]').click();
  await nonePage.locator('#btnNext').click();
  await nonePage.locator('#stepView3.active').waitFor({ state: 'visible', timeout: 30000 });
  await nonePage.locator('[data-catalog-section="stones"]').click();
  await nonePage.locator('[data-stone-id="kyanite"]').waitFor({ state: 'visible', timeout: 20000 });
  check('Explicit no-banner assignment suppresses the legacy badge',
    await nonePage.locator('[data-stone-id="kyanite"] .product-badge').count() === 0
  );
  await noneContext.close();
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const result = {
  completedAt: new Date().toISOString(),
  appRoot: candidateRoot,
  appRootSource: resolvedApp.source,
  staticOrigin,
  checks,
  pageErrors,
  consoleErrors,
  responseErrors
};
result.pass = checks.every((entry) => entry.pass)
  && pageErrors.length === 0
  && consoleErrors.length === 0
  && responseErrors.length === 0;
fs.writeFileSync(path.join(evidenceDir, 'browser-acceptance.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  pass: result.pass,
  checks: checks.length,
  failed: checks.filter((entry) => !entry.pass).length,
  pageErrors: pageErrors.length,
  consoleErrors: consoleErrors.length,
  responseErrors: responseErrors.length,
  resultPath: path.join(evidenceDir, 'browser-acceptance.json')
}, null, 2));
if (!result.pass) process.exitCode = 1;
