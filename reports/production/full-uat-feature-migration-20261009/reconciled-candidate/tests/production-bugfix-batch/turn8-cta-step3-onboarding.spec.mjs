// TURN 8 acceptance: Lucky CTA phases (B), Step 3 CTA area (D), onboarding image 1 + image 4 alignment
// (C/E), and the Lucky page-1 style labels (F). Runs against the release candidate with a mocked
// catalog API; only presentational and interaction behaviour is asserted (no writes anywhere).
import { test, expect } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import crypto from 'node:crypto';
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
const mockApi = async (page) => {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const map = { '/api/stones': 'stones.json', '/api/charms': 'charms.json', '/api/spacers': 'spacers.json', '/api/settings': 'settings.json' };
    const file = map[url.pathname];
    await route.fulfill({ status: 200, contentType: 'application/json', body: file ? JSON.stringify(data(file)) : '{}' });
  });
};
const reachStep3 = async (page, { wrist = 16, bead = '6', skipOnboarding = true } = {}) => {
  await mockApi(page);
  await page.goto(`${baseUrl}/index.html?mock=1`);
  await page.locator('#landingView button').first().click();
  await page.locator('#stepView1.active').waitFor({ state: 'visible' });
  if (wrist !== 16) {
    // Step 1 owns the wrist size: use the next/prev controls until the requested value is shown.
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const current = await page.evaluate(() => {
        const node = document.querySelector('#wristWheelDisplay .wrist-wheel-value.is-center, #wristWheelDisplay');
        return (node?.textContent || '').match(/[0-9]+\.[0-9]/)?.[0] || '';
      });
      if (Number(current) === Number(wrist)) break;
      const direction = Number(current) > Number(wrist) ? '#wristSizePrev' : '#wristSizeNext';
      await page.locator(direction).click();
      await page.waitForTimeout(120);
    }
  }
  await page.locator('#btnNext').click();
  await page.locator('#stepView2.active').waitFor({ state: 'visible' });
  await page.locator(`[data-bead-size="${bead}"]`).click();
  await page.locator('#btnNext').click();
  await page.locator('#stepView3.active').waitFor({ state: 'visible' });
  await expect(page.locator('#stepView3 .lumi-entry')).toBeVisible({ timeout: 45000 });
  if (skipOnboarding) {
    for (let index = 0; index < 16 && await page.locator('.step3-onboarding').count() > 0; index += 1) {
      await page.mouse.click(195, 780).catch(() => {});
      await page.waitForTimeout(400);
    }
  }
};

test.describe('Task D + F: Step 3 CTA area and Lucky page 1 labels', () => {
  test('the preview-bracelet button is gone and the area shows the Step 1 wrist size', async ({ page }) => {
    test.setTimeout(180000);
    await reachStep3(page, { wrist: 16 });
    expect(await page.locator('#btnInspirationGallery').count(), 'the ดูตัวอย่างกำไล button must be removed').toBe(0);
    expect(await page.getByText('ดูตัวอย่างกำไล').count()).toBe(0);
    const label = page.locator('#canvasWristContext');
    await expect(label).toBeVisible();
    await expect(label).toHaveText('16.0 cm');
    // a different Step 1 wrist size must be reflected in the same area
    await page.locator('#btnBack').click();
    await page.locator('#stepView2.active').waitFor({ state: 'visible' });
    await page.locator('#btnBack').click();
    await page.locator('#stepView1.active').waitFor({ state: 'visible' });
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await page.locator('#wristSizeNext').click();
      await page.waitForTimeout(120);
    }
    // The persisted Step 1 state is authoritative (the wheel also renders neighbouring values).
    const chosen = await page.evaluate(() => Number(JSON.parse(window.localStorage.getItem('lucky_colorstone_state') || '{}').wristSize) || 0);
    expect(chosen).toBeGreaterThan(16);
    await page.locator('#btnNext').click();
    await page.locator('#stepView2.active').waitFor({ state: 'visible' });
    await page.locator('#btnNext').click();
    await page.locator('#stepView3.active').waitFor({ state: 'visible' });
    await expect(page.locator('#canvasWristContext')).toHaveText(`${chosen.toFixed(1)} cm`);
  });

  test('Lucky page 1 shows the two new bold labels without the descriptive line', async ({ page }) => {
    test.setTimeout(120000);
    await reachStep3(page);
    await page.locator('#stepView3 .lumi-entry').click();
    await page.locator('.lucky-page1').waitFor({ state: 'visible', timeout: 30000 });
    const stone = page.locator('[data-lumi-style="stone"]');
    const charm = page.locator('[data-lumi-style="charm"]');
    await expect(stone.locator('strong')).toHaveText('หินล้วนพลังดี');
    await expect(charm.locator('strong')).toHaveText('มีเครื่องรางคู่ใจ');
    expect(await stone.locator('span:not(.lucky-page1-style-check)').count(), 'the descriptive line must be removed').toBe(0);
    expect(await charm.locator('span:not(.lucky-page1-style-check)').count()).toBe(0);
    expect(await stone.innerText()).not.toContain('เน้นหินสวย');
    expect(await charm.innerText()).not.toContain('เพิ่มชาร์ม');
  });
});

test.describe('Task E: onboarding image 1 (owner replacement)', () => {
  test('the replaced artwork is referenced with a version token and served byte-exact', async ({ page }) => {
    test.setTimeout(120000);
    const assetPath = 'assets/lucky/onboarding/Kawaii Star Tutorial UI Overlay.webp';
    const localFile = path.resolve(root, assetPath);
    const localHash = crypto.createHash('sha256').update(fs.readFileSync(localFile)).digest('hex');
    const response = await page.request.get(`${baseUrl}/${assetPath}?v=20261011`);
    expect(response.status()).toBe(200);
    const served = Buffer.from(await response.body());
    expect(crypto.createHash('sha256').update(served).digest('hex'), 'the served bytes must be the owner-replaced artwork').toBe(localHash);
    expect(served.length).toBeGreaterThan(200000);
    const source = fs.readFileSync(path.resolve(root, 'lumi/onboarding/step3-onboarding-machine.js'), 'utf8');
    expect(source).toContain("Kawaii Star Tutorial UI Overlay.webp?v=' + ONBOARDING_UI_OVERLAY_REVISION");
    expect(source).toContain("const ONBOARDING_UI_OVERLAY_REVISION = '20261011'");
  });
});

test.describe('Task B: Lucky centre CTA phases', () => {
  test('PAIR -> TEXT (icon + two lines) -> MASCOT -> TEXT -> MASCOT with a constant mascot size', async ({ page }) => {
    test.setTimeout(180000);
    await page.clock.install();
    await reachStep3(page);
    const entry = page.locator('#stepView3 .lumi-entry');
    const mascotSize = async () => entry.locator('.lumi-entry-mascot').evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { width: Math.round(rect.width), height: Math.round(rect.height), opacity: getComputedStyle(node).opacity };
    });
    const stateOf = async () => ({
      phase: await entry.getAttribute('data-cta-state'),
      labelVisible: await entry.locator('.lumi-entry-label').isVisible().catch(() => false),
      labelText: (await entry.locator('.lumi-entry-label').innerText().catch(() => '')).replace(/\s+/g, ' ').trim(),
      iconVisible: await entry.locator('.lumi-entry-icon').isVisible().catch(() => false),
      calloutVisible: await page.locator('.lumi-entry-tip').isVisible().catch(() => false),
      calloutText: (await page.locator('.lumi-entry-tip').innerText().catch(() => '')).replace(/\s+/g, ' ').trim(),
      mascot: await mascotSize()
    });
    // CSS transitions are not part of the faked clock, so give the 300ms opacity fade time to finish
    // before sampling the rendered state.
    const settle = () => page.waitForTimeout(400);

    const pair = await stateOf();
    await settle();
    expect(pair.phase).toBe('pair');
    expect(pair.calloutVisible).toBe(true);
    expect(pair.calloutText).toBe('แตะให้ Lucky ช่วยออกแบบ');
    expect(pair.mascot.opacity).toBe('1');

    await page.clock.fastForward(21000);
    await settle();
    const textA = await stateOf();
    expect(textA.phase).toBe('text-only');
    expect(textA.iconVisible, 'the hand-tap icon leads the prompt').toBe(true);
    expect(textA.labelVisible).toBe(true);
    expect(textA.labelText).toBe('แตะเพื่อให้ Lucky ช่วยออกแบบ');
    expect(textA.mascot.opacity, 'the mascot is not shown during the text phase').toBe('0');
    expect(textA.calloutVisible).toBe(false);

    await page.clock.fastForward(10000);
    await settle();
    const mascotA = await stateOf();
    expect(mascotA.phase).toBe('mascot-only');
    expect(mascotA.mascot.opacity).toBe('1');
    expect(mascotA.iconVisible).toBe(false);
    expect(mascotA.labelVisible).toBe(false);

    await page.clock.fastForward(40000);
    await settle();
    const textB = await stateOf();
    expect(textB.phase).toBe('text-only');
    expect(textB.labelText).toBe('แตะเพื่อให้ Lucky ช่วยออกแบบ');
    expect(textB.iconVisible).toBe(true);

    await page.clock.fastForward(10000);
    await settle();
    const permanent = await stateOf();
    expect(permanent.phase).toBe('mascot-only-persist');
    expect(permanent.mascot.opacity).toBe('1');
    expect(permanent.iconVisible).toBe(false);

    // The mascot must keep ONE size in every phase it is visible in.
    const sizes = [pair.mascot, mascotA.mascot, permanent.mascot].map((entrySize) => `${entrySize.width}x${entrySize.height}`);
    expect(new Set(sizes).size, `mascot size must not change between phases (saw ${sizes.join(', ')})`).toBe(1);
    expect(pair.mascot.width).toBeGreaterThan(40);
  });
});

test.describe('Task C: onboarding LUCKY_GUIDE alignment', () => {
  test('the baked Lucky circle is centred on the real CTA button', async ({ page }) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width: 390, height: 844 });
    await reachStep3(page, { skipOnboarding: false });
    // tap through the tour until the Lucky guide is current
    let onLuckyGuide = false;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      onLuckyGuide = await page.evaluate(() => /Lucky Star Tap Guide/.test(document.querySelector('.step3-onboarding-slot.is-current .step3-onboarding-art img')?.getAttribute('src') || ''));
      if (onLuckyGuide) break;
      await page.mouse.click(195, 780);
      await page.waitForTimeout(700);
    }
    expect(onLuckyGuide, 'the tour must reach the Lucky guide stage').toBe(true);
    await page.waitForTimeout(1800); // the placement watch settles
    const measurement = await page.evaluate(() => {
      const slot = document.querySelector('.step3-onboarding-slot.is-current');
      const art = slot?.querySelector('.step3-onboarding-art');
      const img = art?.querySelector('img');
      const target = document.querySelector('#stepView3 .lumi-center-entry');
      if (!art || !img || !target) return null;
      const artRect = art.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const anchor = { centerX: 0.5840, centerY: 0.3438, widthRatio: 0.2650 };
      const bakedCenterX = artRect.left + artRect.width * anchor.centerX;
      const bakedCenterY = artRect.top + artRect.height * anchor.centerY;
      const bakedWidth = artRect.width * anchor.widthRatio;
      return {
        deltaX: Math.round((bakedCenterX - (targetRect.left + targetRect.width / 2)) * 10) / 10,
        deltaY: Math.round((bakedCenterY - (targetRect.top + targetRect.height / 2)) * 10) / 10,
        sizeDelta: Math.round((bakedWidth - targetRect.width) * 10) / 10,
        realWidth: Math.round(targetRect.width)
      };
    });
    console.log('ONBOARDING-ALIGNMENT ' + JSON.stringify(measurement));
    expect(measurement).not.toBeNull();
    expect(Math.abs(measurement.deltaX), 'horizontal centring').toBeLessThanOrEqual(2);
    expect(Math.abs(measurement.deltaY), 'vertical centring').toBeLessThanOrEqual(2);
    expect(Math.abs(measurement.sizeDelta), 'the baked circle must match the real button size').toBeLessThanOrEqual(6);
  });
});

test.describe('Task A: designing video delivery', () => {
  test('the clip is faststart with a poster and the preload starts on Step 3', async ({ page }) => {
    test.setTimeout(180000);
    const videoFile = path.resolve(root, 'assets/lucky/videos/lucky-bracelet-designing.mp4');
    const posterFile = path.resolve(root, 'assets/lucky/videos/lucky-bracelet-designing-poster.webp');
    expect(fs.existsSync(posterFile), 'a poster frame must ship with the clip').toBe(true);
    const atoms = [];
    const fd = fs.openSync(videoFile, 'r');
    const size = fs.statSync(videoFile).size;
    let offset = 0;
    while (offset < size - 8 && atoms.length < 6) {
      const buffer = Buffer.alloc(8);
      fs.readSync(fd, buffer, 0, 8, offset);
      const length = buffer.readUInt32BE(0);
      atoms.push({ type: buffer.toString('latin1', 4, 8), offset });
      if (length < 8) break;
      offset += length;
    }
    fs.closeSync(fd);
    const moov = atoms.find((atom) => atom.type === 'moov');
    const mdat = atoms.find((atom) => atom.type === 'mdat');
    expect(moov && mdat && moov.offset < mdat.offset, `moov must precede mdat (atoms: ${JSON.stringify(atoms)})`).toBe(true);
    expect(moov.offset).toBeLessThan(200000);

    await reachStep3(page);
    const source = fs.readFileSync(path.resolve(root, 'lumi/ui/lumi-ui.js'), 'utf8');
    expect(source).toContain("lucky-bracelet-designing.mp4?v=20261011faststart");
    expect(source).toContain("video.setAttribute('poster', DESIGNING_VIDEO_POSTER)");
    const posterResponse = await page.request.get(`${baseUrl}/assets/lucky/videos/lucky-bracelet-designing-poster.webp?v=20261011`);
    expect(posterResponse.status()).toBe(200);
    expect((await posterResponse.body()).length).toBeGreaterThan(5000);
  });
});
