import { test, expect } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
let server;
let baseUrl;
const mime = (p) => p.endsWith('.html') ? 'text/html; charset=utf-8'
  : p.endsWith('.css') ? 'text/css; charset=utf-8'
  : (p.endsWith('.js') || p.endsWith('.mjs')) ? 'application/javascript; charset=utf-8'
  : p.endsWith('.webp') ? 'image/webp' : 'application/octet-stream';

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
const data = (name) => JSON.parse(fs.readFileSync(path.resolve(root, 'data', name), 'utf8'));

test('debug: open the Lucky shell', async ({ page }) => {
  const log = [];
  page.on('pageerror', (error) => log.push('pageerror: ' + error.message));
  page.on('console', (message) => { if (message.type() === 'error') log.push('console: ' + message.text()); });
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const map = { '/api/stones': 'stones.json', '/api/charms': 'charms.json', '/api/spacers': 'spacers.json', '/api/settings': 'settings.json' };
    const file = map[url.pathname];
    await route.fulfill({ status: 200, contentType: 'application/json', body: file ? JSON.stringify(data(file)) : '{}' });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseUrl + '/index.html?mock=1');
  await page.locator('#landingView button').first().click();
  await page.locator('#btnNext').click();
  await page.locator('[data-bead-size="6"]').click();
  await page.locator('#btnNext').click();
  await expect(page.locator('#stepView3.active')).toBeVisible();
  await expect(page.locator('#stepView3 .lumi-entry')).toBeVisible({ timeout: 45000 });
  await page.waitForTimeout(2500);
  const before = await page.evaluate(() => ({
    entry: Boolean(document.querySelector('#stepView3 .lumi-entry')),
    entryState: document.querySelector('#stepView3 .lumi-entry')?.dataset.ctaState || null,
    onboarding: document.querySelectorAll('.step3-onboarding').length,
    shell: document.querySelectorAll('.lumi-shell').length,
    topNode: document.elementFromPoint(200, 400)?.className || null
  }));
  await page.locator('#stepView3 .lumi-entry').click();
  await page.waitForTimeout(2500);
  const after = await page.evaluate(() => ({
    shell: document.querySelectorAll('.lumi-shell').length,
    shellHtml: (document.querySelector('.lumi-shell')?.innerHTML || '').slice(0, 400),
    page1: document.querySelectorAll('.lucky-page1').length,
    onboarding: document.querySelectorAll('.step3-onboarding').length
  }));
  console.log('DEBUG ' + JSON.stringify({ before, after, log }, null, 1));
  const probe = await page.evaluate(() => {
    const entry = document.querySelector('#stepView3 .lumi-entry');
    const listeners = typeof getEventListeners === 'function' ? 'n/a' : 'n/a';
    return { tag: entry?.tagName, cls: entry?.className, disabled: entry?.disabled, listeners };
  });
  console.log('PROBE ' + JSON.stringify(probe));
  await page.evaluate(() => {
    window.__clicks = [];
    document.addEventListener('click', (event) => {
      window.__clicks.push('doc:' + (event.target?.tagName || '?') + '.' + (event.target?.className || ''));
    }, true);
    const entry = document.querySelector('#stepView3 .lumi-entry');
    entry.addEventListener('click', () => window.__clicks.push('entry-handler'));
    window.__timeline = typeof window.__lumiEntryTimeline;
    window.__timelineState = window.__lumiEntryTimeline?.current?.() || null;
    window.__shellBefore = document.querySelectorAll('.lumi-shell').length;
    window.__entryRef = entry;
    entry.dataset.probeId = 'probe-' + Date.now();
    window.__probeId = entry.dataset.probeId;
  });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const entry = document.querySelector('#stepView3 .lumi-entry');
    window.__sameElement = entry === window.__entryRef;
    window.__probeIdAfter = entry?.dataset.probeId || null;
    window.__entryCount = document.querySelectorAll('#stepView3 .lumi-entry').length;
    entry.click();
  });
  await page.waitForTimeout(2000);
  console.log('AFTER-JS-CLICK ' + JSON.stringify(await page.evaluate(() => ({
    shell: document.querySelectorAll('.lumi-shell').length,
    page1: document.querySelectorAll('.lucky-page1').length,
    clicks: window.__clicks,
    sameElement: window.__sameElement,
    probeIdBefore: window.__probeId,
    probeIdAfter: window.__probeIdAfter,
    entryCount: window.__entryCount,
    entryConnected: Boolean(document.querySelector('#stepView3 .lumi-entry')?.isConnected),
    timeline: window.__timeline,
    timelineState: window.__timelineState,
    shellBefore: window.__shellBefore,
    bodyFirstChildren: [...document.body.children].slice(0, 6).map((n) => n.tagName + '.' + n.className)
  }))));
});
