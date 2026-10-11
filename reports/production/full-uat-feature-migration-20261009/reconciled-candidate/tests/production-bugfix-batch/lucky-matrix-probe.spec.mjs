import { test, expect } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

// Matrix probe: drive the real Lucky engine with every bead mode / style / goal combination and record
// what the result page and the following Step 3 render produced, looking for "undefined" leakage.
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
const data = (name) => JSON.parse(fs.readFileSync(path.resolve(root, 'data', name), 'utf8'));

const scan = (page) => page.evaluate(() => {
  const html = document.body.innerHTML;
  const hits = [];
  for (const token of ['undefined', '[object Object]', '>NaN<']) {
    let index = html.indexOf(token);
    while (index >= 0 && hits.length < 20) { hits.push({ token, context: html.slice(Math.max(0, index - 120), index + 60).replace(/\s+/g, ' ') }); index = html.indexOf(token, index + 1); }
  }
  const preview = document.querySelector('.lucky-result-bracelet');
  const svg = preview?.querySelector('svg');
  const braceletSvg = document.querySelector('#braceletSvg');
  const persisted = (() => { try { return JSON.parse(window.localStorage.getItem('lucky_colorstone_state') || '{}'); } catch (error) { return {}; } })();
  return {
    page3: Boolean(document.querySelector('.lucky-page3')),
    messageScreen: (document.querySelector('.lumi-state-card h1')?.textContent || '').slice(0, 40),
    previewSvgNodes: svg ? svg.querySelectorAll('*').length : 0,
    materialCardText: [...document.querySelectorAll('.lumi-material-card')].map((card) => card.dataset.materialId + ':' + card.dataset.materialType),
    step3Active: Boolean(document.querySelector('#stepView3.active')),
    step4Active: Boolean(document.querySelector('#stepView4.active')),
    braceletSvgNodes: braceletSvg ? braceletSvg.querySelectorAll('*').length : 0,
    stones: (persisted.selectedStones || []).length,
    stoneKinds: [...new Set((persisted.selectedStones || []).map((item) => item.componentType || 'stone'))],
    charmIds: persisted.selectedCharmIds || [],
    hits
  };
});

const combos = [
  { bead: '6', style: 'charm', goal: 'love' },
  { bead: '6', style: 'charm', goal: 'money' },
  { bead: '6', style: 'charm', goal: 'career' },
  { bead: '10', style: 'charm', goal: 'love' },
  { bead: 'mixed', style: 'charm', goal: 'love' },
  { bead: 'mixed', style: 'charm', goal: 'money' },
  { bead: '4', style: 'charm', goal: 'protection' },
  { bead: '6', style: 'stone', goal: 'luck' }
];

test('Lucky matrix: bead mode x style x goal', async ({ page }) => {
  test.setTimeout(900000);
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const map = { '/api/stones': 'stones.json', '/api/charms': 'charms.json', '/api/spacers': 'spacers.json', '/api/settings': 'settings.json' };
    const file = map[url.pathname];
    await route.fulfill({ status: 200, contentType: 'application/json', body: file ? JSON.stringify(data(file)) : '{}' });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const results = [];
  for (const combo of combos) {
    const entry = { combo, notes: [] };
    try {
      await page.goto(baseUrl + '/index.html?mock=1');
      await page.evaluate(() => window.localStorage.clear());
      await page.goto(baseUrl + '/index.html?mock=1');
      await page.locator('#landingView button').first().click();
      await page.locator('#btnNext').click();
      const bead = page.locator(`[data-bead-size="${combo.bead}"]`);
      await bead.click();
      await page.locator('#btnNext').click();
      await expect(page.locator('#stepView3.active')).toBeVisible();
      await expect(page.locator('#stepView3 .lumi-entry')).toBeVisible({ timeout: 45000 });
      for (let i = 0; i < 14 && await page.locator('.step3-onboarding').count() > 0; i += 1) { await page.mouse.click(195, 760).catch(() => {}); await page.waitForTimeout(400); }
      await page.locator('#stepView3 .lumi-entry').click();
      await page.locator('[data-lumi-weekday="monday"]').click();
      await page.locator('[data-lumi-birth-date]').selectOption('1');
      await page.locator('[data-lumi-birth-month]').selectOption('1');
      await page.locator('[data-lumi-birth-year]').selectOption('1990');
      const styleButton = page.locator(`[data-lumi-style="${combo.style === 'charm' ? 'charm' : 'stone'}"]`);
      if (await styleButton.getAttribute('aria-pressed') !== 'true') await styleButton.click();
      await page.locator('.lucky-page1-actions [data-lumi-action="goals"]').click();
      const goal = page.locator(`[data-lumi-goal="${combo.goal}"]`);
      await goal.click({ position: { x: 6, y: 6 } });
      if (await goal.getAttribute('aria-pressed') !== 'true') await goal.evaluate((node) => node.click());
      await page.locator('.lucky-page2-actions [data-lumi-action="generate"]').click();
      await page.waitForTimeout(14000);
      entry.recommendation = await scan(page);
      if (entry.recommendation.page3) {
        await page.locator('.lucky-page3-actions [data-lumi-action="use"]').click();
        await page.waitForTimeout(2000);
        entry.afterAccept = await scan(page);
      }
    } catch (error) {
      entry.notes.push('error: ' + String(error.message || error).slice(0, 200));
    }
    results.push(entry);
  }
  console.log('MATRIX ' + JSON.stringify(results, null, 1).slice(0, 20000));
});
