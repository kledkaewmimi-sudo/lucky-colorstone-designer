import { test, expect } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

// Issue 1 acceptance: the landing strip shows the four published bracelet previews next to the
// aggregate count, on mobile and desktop, and treats the endpoint payload as untrusted input.
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

const solid = async (rgb, size = 120) => 'data:image/webp;base64,' + (await sharp({ create: { width: size, height: size, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } }).webp().toBuffer()).toString('base64');

const mockSocialProof = async (page, payload) => {
  await page.route('**/api/social-proof', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'cache-control': 'public, max-age=300' }, body: JSON.stringify(payload) });
  });
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/social-proof') return route.fallback();
    const map = { '/api/stones': 'stones.json', '/api/charms': 'charms.json', '/api/spacers': 'spacers.json', '/api/settings': 'settings.json' };
    const file = map[url.pathname];
    await route.fulfill({ status: 200, contentType: 'application/json', body: file ? fs.readFileSync(path.resolve(root, 'data', file), 'utf8') : '{}' });
  });
};

const strip = (page) => page.evaluate(() => {
  const section = document.querySelector('#landingSocialProof');
  const thumbs = [...document.querySelectorAll('#landingSocialProofThumbs .sp-thumb')];
  const images = [...document.querySelectorAll('#landingSocialProofThumbs .sp-thumb img')];
  return {
    count: (document.querySelector('#landingSocialProofCount')?.textContent || '').trim(),
    slotCount: thumbs.length,
    imageCount: images.length,
    imageSources: images.map((img) => String(img.getAttribute('src') || '').slice(0, 30)),
    loaded: images.every((img) => img.naturalWidth > 0),
    sourcesAreInlineImages: images.every((img) => String(img.getAttribute('src') || '').startsWith('data:image/')),
    text: (section?.innerText || '').replace(/\s+/g, ' ').trim(),
    hasDangerousMarkup: /onerror\s*=|onload\s*=|javascript:|<script|srcdoc\s*=|<iframe/i.test(section?.innerHTML || ''),
    imageTagShape: [...(section?.querySelectorAll('#landingSocialProofThumbs img') || [])].map((img) => img.outerHTML.slice(0, 60)),
    rects: thumbs.map((node) => { const r = node.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; }),
    stripRect: section ? { x: Math.round(section.getBoundingClientRect().x), w: Math.round(section.getBoundingClientRect().width) } : null
  };
});

for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 1366, height: 768 }]) {
  test(`four published bracelet previews render beside the count at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    test.setTimeout(90000);
    const problems = [];
    page.on('pageerror', (error) => problems.push('pageerror: ' + error.message));
    page.on('console', (message) => { if (message.type() === 'error') problems.push('console: ' + message.text()); });
    const images = [await solid([255, 0, 0]), await solid([0, 200, 0]), await solid([0, 0, 255]), await solid([255, 255, 0])];
    await mockSocialProof(page, { displayCount: 1329, successfulOrderCount: 98, recentBracelets: images });
    await page.setViewportSize(viewport);
    await page.goto(baseUrl + '/index.html?mock=1');
    await expect(page.locator('#landingSocialProof')).toBeVisible();
    await expect(page.locator('#landingSocialProofThumbs .sp-thumb img')).toHaveCount(4, { timeout: 15000 });
    await expect(page.locator('#landingSocialProofCount')).toHaveText('1,329');

    const state = await strip(page);
    console.log('STRIP-RAW ' + viewport.width + ' ' + JSON.stringify({ slotCount: state.slotCount, imageCount: state.imageCount, rects: state.rects, stripRect: state.stripRect, text: state.text }));
    expect(state.count, 'aggregate count is preserved').toBe('1,329');
    expect(state.slotCount).toBe(4);
    expect(state.imageCount).toBe(4);
    expect(state.sourcesAreInlineImages, 'only inline image data URLs are rendered').toBe(true);
    expect(state.loaded, 'all four previews decode').toBe(true);
    expect(state.hasDangerousMarkup, 'no markup is injected from the payload').toBe(false);
    expect(/\d{3}[\s-]?\d{3}[\s-]?\d{4}/.test(state.text), 'no phone-number-shaped text in the strip').toBe(false);
    expect(/TEST-|@|customerName|orderId/i.test(state.text), 'no customer/order tokens in the strip').toBe(false);
    // The thumbs must sit inside the strip, in a row, and not overlap each other.
    for (const rect of state.rects) {
      expect(rect.y).toBe(state.rects[0].y);
      expect(rect.x).toBeGreaterThanOrEqual(state.stripRect.x);
      expect(rect.x + rect.w).toBeLessThanOrEqual(state.stripRect.x + state.stripRect.w);
    }
    for (let index = 1; index < state.rects.length; index += 1) {
      expect(state.rects[index].x).toBeGreaterThanOrEqual(state.rects[index - 1].x + Math.round(state.rects[index - 1].w * 0.4));
    }
    console.log('STRIP ' + viewport.width + ' ' + JSON.stringify(state));
    expect(problems).toEqual([]);
    await page.screenshot({ path: `tests/production-bugfix-batch/evidence/landing-social-proof-${viewport.width}.png`, clip: { x: 0, y: 300, width: viewport.width, height: 260 } });
  });
}

test('untrusted and malformed preview entries are ignored, never rendered', async ({ page }) => {
  test.setTimeout(60000);
  const valid = await solid([10, 20, 30]);
  await mockSocialProof(page, {
    displayCount: 1200,
    successfulOrderCount: 55,
    recentBracelets: ['https://evil.example/tracker.png', 'javascript:alert(1)', '<svg onload=alert(1)></svg>', valid, { image: 'data:image/svg+xml;base64,PHN2Zy8+' }]
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseUrl + '/index.html?mock=1');
  await expect(page.locator('#landingSocialProofCount')).toHaveText('1,200');
  await page.waitForTimeout(1200);
  const state = await strip(page);
  expect(state.imageCount, 'only the one safe inline image is rendered').toBe(1);
  expect(state.imageSources[0].startsWith('data:image/webp')).toBe(true);
  expect(state.hasDangerousMarkup).toBe(false);
  expect(state.slotCount).toBe(4);
});

test('count-only payload keeps the count and leaves the fallback slots empty', async ({ page }) => {
  test.setTimeout(60000);
  const problems = [];
  page.on('pageerror', (error) => problems.push('pageerror: ' + error.message));
  await mockSocialProof(page, { displayCount: 1188, successfulOrderCount: 51 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseUrl + '/index.html?mock=1');
  await expect(page.locator('#landingSocialProofCount')).toHaveText('1,188');
  await page.waitForTimeout(800);
  const state = await strip(page);
  expect(state.imageCount).toBe(0);
  expect(state.slotCount).toBe(4);
  expect(state.count).toBe('1,188');
  expect(problems).toEqual([]);
});
