import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const PRODUCTION_URL = process.env.PRODUCTION_HEALTH_URL || 'https://customize.luckycolorstone.com/';
const REPORT_PATH = process.env.HEALTH_REPORT_PATH || 'artifacts/production-health-report.json';
const FAILURE_THRESHOLD_MS = 2000;
const API_FAILURE_THRESHOLD_MS = 10_000;
const HANDLED_FALLBACK_PATHS = new Set(['/api/liff-config']);
const TRACKING_HOSTS = [
  'connect.facebook.net',
  'www.facebook.com',
  'analytics.tiktok.com',
  'business-api.tiktok.com'
];

function timingStatus(durationMs) {
  if (durationMs < 500) return 'GOOD';
  if (durationMs <= 1000) return 'WARN';
  if (durationMs <= FAILURE_THRESHOLD_MS) return 'WARN_ELEVATED';
  return 'FAIL';
}

function isProductionResource(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.hostname === 'customize.luckycolorstone.com'
      || url.hostname === 'lucky-colorstone-designer.onrender.com';
  } catch {
    return false;
  }
}

async function measureTripleNext(page, targetSelector) {
  return await page.evaluate(async ({ targetSelector }) => {
    const target = document.querySelector(targetSelector);
    const button = document.querySelector('#btnNext');
    const toast = document.querySelector('#toastMessage');
    if (!target || !button) throw new Error(`Missing navigation target: ${targetSelector}`);

    let activations = 0;
    let firstVisibleMs = null;
    let wasActive = target.classList.contains('active');
    const toastMessages = [];
    const started = performance.now();
    const stepObserver = new MutationObserver(() => {
      const isActive = target.classList.contains('active');
      if (isActive && !wasActive) {
        activations += 1;
        if (firstVisibleMs === null) firstVisibleMs = performance.now() - started;
      }
      wasActive = isActive;
    });
    const toastObserver = new MutationObserver(() => {
      if (toast?.classList.contains('show')) {
        const message = String(toast.textContent || '').trim();
        if (message && toastMessages.at(-1) !== message) toastMessages.push(message);
      }
    });
    stepObserver.observe(target, { attributes: true, attributeFilter: ['class'] });
    if (toast) toastObserver.observe(toast, { attributes: true, childList: true, subtree: true });

    button.click();
    button.click();
    button.click();

    const deadline = performance.now() + 5000;
    while (!target.classList.contains('active') && performance.now() < deadline) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
    stepObserver.disconnect();
    toastObserver.disconnect();
    if (!target.classList.contains('active')) throw new Error(`${targetSelector} did not become visible`);
    return {
      visibleMs: firstVisibleMs ?? performance.now() - started,
      activations,
      toastMessages,
      targetActive: target.classList.contains('active')
    };
  }, { targetSelector });
}

async function inspectCatalogImages(page, section, cardSelector, brokenAssets) {
  const tab = page.locator(`[data-catalog-section="${section}"]`);
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  const cards = page.locator(cardSelector);
  const count = await cards.count();
  const images = cards.locator('img');
  const imageCount = Math.min(await images.count(), 12);
  for (let index = 0; index < imageCount; index += 1) {
    await page.evaluate(({ cardSelector, index }) => {
      document.querySelectorAll(`${cardSelector} img`)[index]?.scrollIntoView({ block: 'center' });
    }, { cardSelector, index });
    await page.waitForTimeout(75);
  }
  let states = [];
  const deadline = Date.now() + 5000;
  do {
    states = await images.evaluateAll((elements, limit) => elements.slice(0, limit).map((element) => ({
      url: element.currentSrc || element.src,
      complete: element.complete,
      naturalWidth: element.naturalWidth
    })), imageCount);
    if (states.length === imageCount && states.every((state) => state.complete && state.naturalWidth > 0)) break;
    await page.waitForTimeout(200);
  } while (Date.now() < deadline);
  for (const state of states) {
    if (!state.complete || state.naturalWidth === 0) brokenAssets.push(state.url);
  }
  return { section, cards: count, imagesChecked: imageCount };
}

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36',
  trace: 'retain-on-failure',
  screenshot: 'only-on-failure',
  video: 'off',
  actionTimeout: 12_000,
  navigationTimeout: 30_000
});

test.describe('Lucky Colorstone production health', () => {
  test('customer Steps 1-4 remain healthy without production writes', async ({ page }) => {
    test.setTimeout(120_000);
    const report = {
      timestamp: new Date().toISOString(),
      status: 'RUNNING',
      failedCheck: null,
      target: PRODUCTION_URL,
      viewport: { width: 390, height: 844 },
      thresholdsMs: { good: 500, warnUpper: 1000, fail: FAILURE_THRESHOLD_MS, apiFail: API_FAILURE_THRESHOLD_MS },
      metrics: {
        homepageLoadMs: null,
        step23Ms: null,
        step23Status: null,
        step34Ms: null,
        step34Status: null,
        catalogRenderMs: null,
        slowestApi: null,
        failedRequestCount: 0,
        http5xxCount: 0,
        uncaughtPageErrorCount: 0
      },
      duplicateNext: { step23Activations: null, step34Activations: null, duplicateToasts: 0 },
      catalog: [],
      brokenAssets: [],
      http5xx: [],
      failedRequests: [],
      pageErrors: [],
      handledFallbacks: [],
      blockedWriteRequests: 0,
      productionMutationRequestsForwarded: 0
    };
    const requestStartedAt = new Map();
    const apiTimings = [];

    await page.addInitScript(() => {
      window.liff = {
        init: async () => undefined,
        isInClient: () => true,
        isLoggedIn: () => true,
        getProfile: async () => ({ userId: 'U-health-monitor-synthetic', displayName: 'Health Monitor' }),
        getFriendship: async () => ({ friendFlag: true }),
        requestFriendship: async () => ({ friendFlag: true }),
        login: () => undefined
      };
    });

    page.on('pageerror', (error) => report.pageErrors.push(String(error?.message || error)));
    page.on('request', (request) => requestStartedAt.set(request, performance.now()));
    page.on('requestfailed', (request) => {
      if (!['GET', 'HEAD'].includes(request.method())) return;
      if (isProductionResource(request.url()) || request.resourceType() === 'image') {
        report.failedRequests.push({ url: request.url(), reason: request.failure()?.errorText || 'request failed' });
      }
    });
    page.on('response', (response) => {
      const request = response.request();
      const startedAt = requestStartedAt.get(request);
      const durationMs = startedAt == null ? null : Math.round(performance.now() - startedAt);
      const url = new URL(response.url());
      if (request.method() === 'GET' && url.pathname.startsWith('/api/')) {
        apiTimings.push({ url: `${url.origin}${url.pathname}`, status: response.status(), durationMs });
      }
      if (response.status() >= 500 && isProductionResource(response.url())) {
        report.http5xx.push({ url: response.url(), status: response.status(), durationMs });
      }
      if (response.status() >= 400 && request.resourceType() === 'image') {
        report.brokenAssets.push(response.url());
      }
      if (
        response.status() >= 400
        && response.status() < 500
        && isProductionResource(response.url())
        && ['document', 'script', 'stylesheet', 'font'].includes(request.resourceType())
      ) {
        report.failedRequests.push({ url: response.url(), status: response.status() });
      }
      if (response.status() >= 400 && url.pathname.startsWith('/api/')) {
        if (HANDLED_FALLBACK_PATHS.has(url.pathname)) {
          report.handledFallbacks.push({ url: response.url(), status: response.status() });
        } else if (response.status() < 500) {
          report.failedRequests.push({ url: response.url(), status: response.status() });
        }
      }
    });

    await page.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.hostname === 'static.line-scdn.net' && url.pathname.includes('/liff/')) {
        await route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
        return;
      }
      if (TRACKING_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
        await route.fulfill({ status: 204, body: '' });
        return;
      }
      if (url.hostname === 'api.line.me') {
        await route.fulfill({ status: 204, body: '' });
        return;
      }
      if (!['GET', 'HEAD'].includes(request.method())) {
        report.blockedWriteRequests += 1;
        await route.fulfill({ status: 204, body: '' });
        return;
      }
      await route.continue();
    });

    try {
      const homepageStartedAt = performance.now();
      await page.goto(PRODUCTION_URL, { waitUntil: 'load' });
      report.metrics.homepageLoadMs = Math.round(performance.now() - homepageStartedAt);
      await expect(page.locator('#btnLandingLogin')).toBeVisible();
      await page.waitForFunction(() => !document.querySelector('#btnLandingLogin')?.disabled);
      await page.locator('#btnLandingLogin').click();
      await expect(page.locator('#stepView1')).toHaveClass(/active/);

      await page.locator('#btnNext').click();
      await expect(page.locator('#stepView2')).toHaveClass(/active/);
      await page.locator('[data-bead-size="10"]').click();
      await expect(page.locator('[data-bead-size="10"]')).toHaveAttribute('aria-checked', 'true');

      const step23 = await measureTripleNext(page, '#stepView3');
      report.metrics.step23Ms = Math.round(step23.visibleMs * 10) / 10;
      report.metrics.step23Status = timingStatus(step23.visibleMs);
      report.duplicateNext.step23Activations = step23.activations;
      report.duplicateNext.duplicateToasts += step23.toastMessages.length;
      await expect(page.locator('#stepView3')).toHaveClass(/active/);
      await expect(page.locator('#braceletSvg')).toBeVisible();

      const catalogStartedAt = performance.now();
      await page.waitForFunction(() => document.querySelectorAll('.stone-card[data-stone-id]').length > 0);
      report.metrics.catalogRenderMs = Math.round(performance.now() - catalogStartedAt);
      report.catalog.push(await inspectCatalogImages(page, 'stones', '.stone-card[data-stone-id]', report.brokenAssets));
      report.catalog.push(await inspectCatalogImages(page, 'charms', '.stone-card[data-charm-id]', report.brokenAssets));
      report.catalog.push(await inspectCatalogImages(page, 'spacer', '.stone-card[data-spacer-id]', report.brokenAssets));
      await page.locator('[data-catalog-section="stones"]').click();

      for (let index = 0; index < 120; index += 1) {
        if (await page.locator('#braceletSvg .bead-node.placeholder').count() === 0) break;
        const buttons = page.locator('.stone-card[data-stone-id] .stone-add-btn');
        const count = await buttons.count();
        if (count === 0) throw new Error('Stone catalog has no available add buttons');
        await buttons.nth(index % count).click();
      }
      expect(await page.locator('#braceletSvg .bead-node.placeholder').count(), 'safe test bracelet should be complete').toBe(0);
      expect(await page.locator('#braceletSvg .bead-node.placed').count(), 'bracelet should render placed beads').toBeGreaterThan(0);

      const step34 = await measureTripleNext(page, '#stepView4');
      report.metrics.step34Ms = Math.round(step34.visibleMs * 10) / 10;
      report.metrics.step34Status = timingStatus(step34.visibleMs);
      report.duplicateNext.step34Activations = step34.activations;
      report.duplicateNext.duplicateToasts += step34.toastMessages.length;
      await expect(page.locator('#stepView4')).toHaveClass(/active/);
      await expect(page.locator('.summary-container')).toBeVisible();
      await expect(page.locator('#priceTotal')).toHaveText(/฿[\d,]+/);
      const total = Number((await page.locator('#priceTotal').textContent()).replace(/[^\d.]/g, ''));
      expect(total, 'summary total must be a positive number').toBeGreaterThan(0);
      await page.waitForFunction(() => document.querySelector('#btnNext')?.classList.contains('btn-order'));

      report.brokenAssets = [...new Set(report.brokenAssets.filter(Boolean))];
      report.metrics.failedRequestCount = report.failedRequests.length;
      report.metrics.http5xxCount = report.http5xx.length;
      report.metrics.uncaughtPageErrorCount = report.pageErrors.length;
      report.metrics.slowestApi = apiTimings
        .filter((entry) => Number.isFinite(entry.durationMs))
        .sort((a, b) => b.durationMs - a.durationMs)[0] || null;

      expect(step23.activations, 'rapid Step 2 Next clicks should activate Step 3 once').toBe(1);
      expect(step34.activations, 'rapid Step 3 Next clicks should activate Step 4 once').toBe(1);
      expect(report.duplicateNext.duplicateToasts, 'valid rapid Next clicks should not duplicate toasts').toBe(0);
      expect(report.metrics.step23Ms, 'Step 2 to Step 3 must stay below the fail threshold').toBeLessThanOrEqual(FAILURE_THRESHOLD_MS);
      expect(report.metrics.step34Ms, 'Step 3 to Step 4 must stay below the fail threshold').toBeLessThanOrEqual(FAILURE_THRESHOLD_MS);
      if (report.metrics.slowestApi?.durationMs != null) {
        expect(report.metrics.slowestApi.durationMs, 'customer API latency must stay below the abnormal threshold').toBeLessThanOrEqual(API_FAILURE_THRESHOLD_MS);
      }
      expect(report.http5xx, 'customer-facing production endpoints must not return 5xx').toEqual([]);
      expect(report.failedRequests, 'customer-facing production requests must not fail').toEqual([]);
      expect(report.brokenAssets, 'customer catalog images must load').toEqual([]);
      expect(report.pageErrors, 'production page must not throw').toEqual([]);
      expect(report.productionMutationRequestsForwarded, 'monitor must never forward production writes').toBe(0);
      expect(page.url(), 'monitor must never leave for Stripe').toContain('customize.luckycolorstone.com');

      if (process.env.HEALTH_MONITOR_FORCE_FAILURE === '1') {
        throw new Error('Controlled health-monitor failure');
      }
      report.status = 'PASS';
    } catch (error) {
      report.status = 'FAIL';
      report.failedCheck = String(error?.message || error)
        .replace(/\u001b\[[0-9;]*m/g, '')
        .split(/\r?\n/, 1)[0]
        .slice(0, 300);
      throw error;
    } finally {
      report.metrics.failedRequestCount = report.failedRequests.length;
      report.metrics.http5xxCount = report.http5xx.length;
      report.metrics.uncaughtPageErrorCount = report.pageErrors.length;
      report.metrics.slowestApi ||= apiTimings
        .filter((entry) => Number.isFinite(entry.durationMs))
        .sort((a, b) => b.durationMs - a.durationMs)[0] || null;
      await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
      await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    }
  });
});
