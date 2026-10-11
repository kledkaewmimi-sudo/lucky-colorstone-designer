// TASK A measurement: Step 3 rapid add/remove responsiveness (run in the before/after trees).
import { test, expect } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
let server;
let baseUrl;
const mime = (file) => (file.endsWith('.html') ? 'text/html; charset=utf-8'
  : file.endsWith('.css') ? 'text/css; charset=utf-8'
    : (file.endsWith('.js') || file.endsWith('.mjs')) ? 'application/javascript; charset=utf-8'
      : file.endsWith('.webp') ? 'image/webp'
        : file.endsWith('.mp4') ? 'video/mp4'
          : file.endsWith('.png') ? 'image/png'
            : file.endsWith('.json') ? 'application/json; charset=utf-8'
              : 'application/octet-stream');

test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const file = path.resolve(root, relative);
    if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': mime(file) });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(() => server?.close());

const data = (name) => JSON.parse(fs.readFileSync(path.resolve(root, 'data', name), 'utf8').replace(/^\uFEFF/, ''));

const openEditor = async (page) => {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const map = { '/api/stones': 'stones.json', '/api/charms': 'charms.json', '/api/spacers': 'spacers.json', '/api/settings': 'settings.json' };
    const file = map[url.pathname];
    await route.fulfill({ status: 200, contentType: 'application/json', body: file ? JSON.stringify(data(file)) : '{}' });
  });
  await page.goto(`${baseUrl}/index.html?mock=1`);
  await page.locator('#landingView button').first().click();
  await page.locator('#stepView1.active').waitFor({ state: 'visible' });
  await page.locator('#btnNext').click();
  await page.locator('#stepView2.active').waitFor({ state: 'visible' });
  await page.locator('[data-bead-size="6"]').click();
  await page.locator('#btnNext').click();
  await page.locator('#stepView3.active').waitFor({ state: 'visible' });
  await expect(page.locator('#stepView3 .lumi-entry')).toBeVisible({ timeout: 45000 });
  for (let index = 0; index < 16 && await page.locator('.step3-onboarding').count() > 0; index += 1) {
    await page.mouse.click(195, 780).catch(() => {});
    await page.waitForTimeout(400);
  }
};

// Counts full SVG ring rebuilds and catalog-grid rebuilds and records long tasks while the burst runs.
const instrument = (page) => page.evaluate(() => {
  window.__perf = { ringRebuilds: 0, catalogRebuilds: 0, longTasks: 0, longTaskMs: 0 };
  const observe = (selector, key) => {
    const node = document.querySelector(selector);
    if (!node) return;
    new MutationObserver((records) => {
      if (records.some((record) => record.addedNodes.length > 3 || record.removedNodes.length > 3)) window.__perf[key] += 1;
    }).observe(node, { childList: true });
  };
  observe('#braceletSvg', 'ringRebuilds');
  observe('#stoneCatalogGrid', 'catalogRebuilds');
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) { window.__perf.longTasks += 1; window.__perf.longTaskMs += entry.duration; }
    }).observe({ entryTypes: ['longtask'] });
  } catch { /* longtask unsupported in this engine */ }
  return true;
});

// The burst taps faster than the frame budget on purpose: this is the case the owner reported. The
// whole burst runs INSIDE the page so "tap -> visible ring update" carries no automation round-trip.
const runBurst = async (page, { action, count, spacingMs }) => {
  await instrument(page);
  const measured = await page.evaluate(async ({ action: burstAction, count: burstCount, spacingMs: gap }) => {
    const placedCount = () => document.querySelectorAll('#braceletSvg g.bead-node.placed').length;
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const waitForChange = (before, at, deadlineMs) => new Promise((resolve) => {
      const tick = () => {
        const now = performance.now();
        const current = placedCount();
        if (current !== before) { resolve({ ms: Math.round((now - at) * 10) / 10, placed: current }); return; }
        if (now - at > deadlineMs) { resolve({ ms: -1, placed: current }); return; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const timings = [];
    const wallStart = performance.now();
    let lastTapAt = wallStart;
    const startCount = placedCount();
    for (let index = 0; index < burstCount; index += 1) {
      const before = placedCount();
      const at = performance.now();
      if (burstAction === 'add') {
        const cards = [...document.querySelectorAll('#stepView3 .stone-card')];
        if (!cards.length) break;
        cards[index % cards.length].click();
      } else {
        const nodes = [...document.querySelectorAll('#braceletSvg g.bead-node.placed[data-slot-kind="stone"]')];
        if (!nodes.length) break;
        // SVG nodes have no HTMLElement.click(), so the tap is dispatched the way the device delivers
        // it: a pointer release (the click fallback covers engines without Pointer Events).
        const node = nodes[nodes.length - 1];
        const rect = node.getBoundingClientRect();
        const options = { bubbles: true, cancelable: true, composed: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, pointerType: 'touch', pointerId: 1, isPrimary: true, button: 0, buttons: 0 };
        if (typeof PointerEvent === 'function') node.dispatchEvent(new PointerEvent('pointerup', options));
        else node.dispatchEvent(new MouseEvent('click', options));
      }
      timings.push({ tap: index + 1, ...(await waitForChange(before, at, 2000)) });
      if (gap > 0) await wait(gap);
      lastTapAt = performance.now();
    }
    const wallMs = Math.round(performance.now() - wallStart);
    // How long the ring needs, after the LAST tap, to show the complete burst ("does the bracelet
    // catch up when the customer taps fast?"). The burst is clamped by the physical capacity, so the
    // target is the count the loop actually reached.
    const target = placedCount();
    const settleStart = performance.now();
    let settled = target;
    while (performance.now() - settleStart < 3000) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      settled = placedCount();
      if (settled === target) break;
    }
    const visualSettleMs = Math.round((performance.now() - lastTapAt) * 10) / 10;
    await wait(700);
    return { timings, wallMs, visualSettleMs, startCount, finalPlaced: placedCount(), perf: window.__perf };
  }, { action, count, spacingMs });
  const latencies = measured.timings;
  const sorted = [...latencies].map((entry) => entry.ms).sort((a, b) => a - b);
  return {
    action,
    count,
    wallMs: measured.wallMs,
    finalPlaced: measured.finalPlaced,
    visualSettleMs: measured.visualSettleMs,
    startCount: measured.startCount,
    latencyMs: { min: sorted[0], median: sorted[Math.floor(sorted.length / 2)], max: sorted[sorted.length - 1], all: latencies.map((entry) => entry.ms) },
    perf: measured.perf
  };
};

test('rapid additions and removals stay responsive', async ({ page }) => {
  test.setTimeout(420000);
  await openEditor(page);
  const adds = await runBurst(page, { action: 'add', count: 12, spacingMs: 40 });
  const removals = await runBurst(page, { action: 'remove', count: 10, spacingMs: 40 });
  // The owner's worst case: taps faster than a frame (no artificial gap at all).
  const fastAdds = await runBurst(page, { action: 'add', count: 6, spacingMs: 0 });
  const fastRemovals = await runBurst(page, { action: 'remove', count: 6, spacingMs: 0 });
  console.log('PERF-RESULT ' + JSON.stringify({ adds, removals, fastAdds, fastRemovals }));
  expect(adds.finalPlaced).toBeGreaterThan(6);
  expect(removals.finalPlaced).toBeLessThan(adds.finalPlaced);
});
