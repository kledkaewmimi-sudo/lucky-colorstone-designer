// TASK C / TASK E measurement (read-only): natural size of the onboarding artwork and the offset
// between the baked Lucky circle inside the LUCKY_GUIDE art and the REAL Lucky CTA button, measured
// under Android and iPhone emulation against the release candidate.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, webkit } from '@playwright/test';

const CAND = path.resolve('reports/production/full-uat-feature-migration-20261009/reconciled-candidate');
const OUT = 'reports/production/production-bugfix-batch-20261011/evidence';
const mime = (file) => (file.endsWith('.html') ? 'text/html; charset=utf-8'
  : file.endsWith('.css') ? 'text/css; charset=utf-8'
    : (file.endsWith('.js') || file.endsWith('.mjs')) ? 'application/javascript; charset=utf-8'
      : file.endsWith('.webp') ? 'image/webp'
        : file.endsWith('.png') ? 'image/png'
          : file.endsWith('.json') ? 'application/json; charset=utf-8'
            : 'application/octet-stream');

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
  const file = path.resolve(CAND, relative);
  if (!file.startsWith(CAND) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': mime(file) });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const data = (name) => JSON.parse(fs.readFileSync(path.join(CAND, 'data', name), 'utf8').replace(/^\uFEFF/, ''));

const PROFILES = [
  // Viewport + touch emulate the device geometry; the user-agent string is intentionally NOT
  // overridden because the app switches to its LIFF path for an iPhone/Android UA, which changes the
  // landing markup and would make the geometry probe measure a different flow than Production serves.
  { id: 'android-412', browser: chromium, options: { viewport: { width: 412, height: 839 }, hasTouch: true, deviceScaleFactor: 2.625 } },
  { id: 'android-360', browser: chromium, options: { viewport: { width: 360, height: 740 }, hasTouch: true, deviceScaleFactor: 3 } },
  { id: 'iphone-390', browser: webkit, options: { viewport: { width: 390, height: 844 }, hasTouch: true } },
  { id: 'iphone-375', browser: webkit, options: { viewport: { width: 375, height: 667 }, hasTouch: true } }
];

const results = [];
for (const profile of PROFILES) {
  const browser = await profile.browser.launch({ headless: true });
  try {
    const context = await browser.newContext(profile.options);
    const page = await context.newPage();
    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      const map = { '/api/stones': 'stones.json', '/api/charms': 'charms.json', '/api/spacers': 'spacers.json', '/api/settings': 'settings.json' };
      const file = map[url.pathname];
      await route.fulfill({ status: 200, contentType: 'application/json', body: file ? JSON.stringify(data(file)) : '{}' });
    });
    await page.goto(`${baseUrl}/index.html?mock=1`);
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(String(error.message).slice(0, 200)));
    await page.waitForTimeout(1500);
    const landingProbe = await page.evaluate(() => ({
      url: location.href,
      title: document.title,
      landing: Boolean(document.getElementById('landingView')),
      landingButtons: document.querySelectorAll('#landingView button').length,
      bodyStart: (document.body?.innerText || '').slice(0, 120)
    }));
    if (pageErrors.length || !landingProbe.landing) {
      results.push({ profile: profile.id, landingProbe, pageErrors });
      console.log('PROBE-FAIL ' + profile.id + ' ' + JSON.stringify({ landingProbe, pageErrors }));
      await context.close();
      continue;
    }
    const assetSizes = await page.evaluate(async () => {
      const load = (src) => new Promise((resolve) => { const img = new Image(); img.onload = () => resolve({ src, width: img.naturalWidth, height: img.naturalHeight }); img.onerror = () => resolve({ src, error: true }); img.src = src; });
      return Promise.all([
        load('/assets/lucky/onboarding/Kawaii Star Tutorial UI Overlay.webp'),
        load('/assets/lucky/onboarding/Lucky Star Tap Guide.webp')
      ]);
    });
    await page.locator('#landingView button').first().click();
    try {
      await page.locator('#stepView1.active').waitFor({ state: 'visible', timeout: 5000 });
    } catch {
      await page.locator('#landingView button').first().click({ force: true });
      await page.locator('#stepView1.active').waitFor({ state: 'visible', timeout: 15000 });
    }
    await page.locator('#btnNext').click();
    await page.locator('#stepView2.active').waitFor({ state: 'visible' });
    await page.locator('[data-bead-size="6"]').click();
    await page.locator('#btnNext').click();
    await page.locator('#stepView3.active').waitFor({ state: 'visible' });
    // Step through the tour until the Lucky guide stage is on screen (tap-only flow).
    let stageState = null;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      stageState = await page.evaluate(() => document.querySelector('#stepView3')?.dataset?.onboardingStage || document.querySelector('.step3-onboarding-slot.is-current .step3-onboarding-art img')?.getAttribute('src') || null);
      const isLucky = await page.evaluate(() => /Lucky Star Tap Guide/.test(document.querySelector('.step3-onboarding-slot.is-current .step3-onboarding-art img')?.getAttribute('src') || ''));
      if (isLucky) break;
      await page.mouse.click(Math.round(profile.options.viewport.width / 2), Math.round(profile.options.viewport.height * 0.9));
      await page.waitForTimeout(650);
    }
    const measurement = await page.evaluate(() => {
      const slot = document.querySelector('.step3-onboarding-slot.is-current');
      const art = slot?.querySelector('.step3-onboarding-art');
      const img = art?.querySelector('img');
      const target = document.querySelector('#stepView3 .lumi-center-entry');
      if (!art || !img || !target) return { error: 'missing elements', art: Boolean(art), img: Boolean(img), target: Boolean(target) };
      const artRect = art.getBoundingClientRect();
      const imgRect = img.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      // The baked tap circle inside the LUCKY art (owner measurement on the 1536x1024 artwork).
      const anchor = { centerX: 0.5840, centerY: 0.3438, widthRatio: 0.2650 };
      const bakedCenterX = imgRect.left + imgRect.width * anchor.centerX;
      const bakedCenterY = imgRect.top + imgRect.height * anchor.centerY;
      const bakedWidth = imgRect.width * anchor.widthRatio;
      const realCenterX = targetRect.left + targetRect.width / 2;
      const realCenterY = targetRect.top + targetRect.height / 2;
      const transform = getComputedStyle(art).transform;
      return {
        art: { left: artRect.left, top: artRect.top, width: artRect.width, height: artRect.height },
        image: { left: imgRect.left, top: imgRect.top, width: imgRect.width, height: imgRect.height, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, src: img.getAttribute('src') },
        real: { left: targetRect.left, top: targetRect.top, width: targetRect.width, height: targetRect.height },
        baked: { centerX: bakedCenterX, centerY: bakedCenterY, width: bakedWidth, diameter: targetRect.width },
        deltaPx: { x: Math.round((bakedCenterX - realCenterX) * 10) / 10, y: Math.round((bakedCenterY - realCenterY) * 10) / 10 },
        sizeDeltaPx: Math.round((bakedWidth - targetRect.width) * 10) / 10,
        transform
      };
    });
    results.push({ profile: profile.id, viewport: profile.options.viewport, assetSizes, measurement });
    await context.close();
  } finally {
    await browser.close();
  }
}

server.close();
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'onboarding-alignment-probe.json'), JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 1) + '\n', 'utf8');
console.log(JSON.stringify(results, null, 1));
