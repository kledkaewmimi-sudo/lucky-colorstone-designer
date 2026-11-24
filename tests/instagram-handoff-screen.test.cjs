'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('D:/Projects/lucky-colorstone-uat/node_modules/playwright');

const ROOT = path.join(__dirname, '../frontend');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      const file = path.join(ROOT, pathname === '/' ? 'index.html' : pathname.replace(/^\//, ''));
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.statusCode = 404;
        res.end('not found');
        return;
      }
      res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
      res.end(fs.readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const IPHONE_INSTAGRAM = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 320.0.0.0.0';
const ANDROID_INSTAGRAM = 'Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230901.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.0.0 Mobile Safari/537.36 Instagram 320.0.0.0.0';
const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

async function openWithUserAgent(browser, port, userAgent) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    userAgent
  });
  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    let body = {};
    if (pathname === '/api/liff-config') body = { environment: 'production', liffId: '2010525799-qImIuhla' };
    else if (pathname === '/api/settings') body = { globalDiscountPercent: 20, discountEnabled: true, catalogCategories: [], lumiEnabled: false, catalogLayoutOrder: {} };
    else if (pathname === '/api/stones' || pathname === '/api/charms' || pathname === '/api/spacers') body = [];
    else if (pathname === '/api/social-proof') body = { count: 1035, images: [] };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.route('https://static.line-scdn.net/**', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
  return page;
}

function assertHotspotAligned(rect, imageRect) {
  const expected = {
    left: imageRect.left + imageRect.width * 0.0898,
    top: imageRect.top + imageRect.height * 0.5510,
    width: imageRect.width * 0.8081,
    height: imageRect.height * 0.0716
  };
  assert.ok(Math.abs(rect.left - expected.left) < 2, `${rect.left} vs ${expected.left}`);
  assert.ok(Math.abs(rect.top - expected.top) < 2, `${rect.top} vs ${expected.top}`);
  assert.ok(Math.abs(rect.width - expected.width) < 2, `${rect.width} vs ${expected.width}`);
  assert.ok(Math.abs(rect.height - expected.height) < 2, `${rect.height} vs ${expected.height}`);
}

test('Instagram iOS displays the approved Safari image with an aligned transparent CTA', async () => {
  const { server, port } = await serve();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await openWithUserAgent(browser, port, IPHONE_INSTAGRAM);
    await page.waitForSelector('#instagramHandoffScreen:not([hidden])', { timeout: 15000 });
    const result = await page.evaluate(() => {
      const image = document.getElementById('instagramHandoffImage');
      const cta = document.getElementById('instagramHandoffCta');
      const screen = document.getElementById('instagramHandoffScreen');
      const imageRect = image.getBoundingClientRect();
      const ctaRect = cta.getBoundingClientRect();
      return {
        hidden: screen.hidden,
        src: image.getAttribute('src'),
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        imageRatio: imageRect.width / imageRect.height,
        imageRect: { left: imageRect.left, top: imageRect.top, width: imageRect.width, height: imageRect.height },
        ctaRect: { left: ctaRect.left, top: ctaRect.top, width: ctaRect.width, height: ctaRect.height },
        ctaBackground: getComputedStyle(cta).backgroundColor,
        ctaText: cta.textContent,
        screenText: screen.innerText.trim()
      };
    });
    assert.equal(result.hidden, false);
    assert.equal(result.src, '/assets/instagram-handoff/safari.jpg');
    assert.equal(result.naturalWidth, 891);
    assert.equal(result.naturalHeight, 1508);
    assert.ok(Math.abs(result.imageRatio - 891 / 1508) < 0.002);
    assert.equal(result.ctaBackground, 'rgba(0, 0, 0, 0)');
    assert.equal(result.ctaText, '');
    assert.equal(result.screenText, '');
    assertHotspotAligned(result.ctaRect, result.imageRect);
    for (const viewport of [{ width: 360, height: 800 }, { width: 430, height: 932 }]) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(80);
      const resized = await page.evaluate(() => {
        const imageRect = document.getElementById('instagramHandoffImage').getBoundingClientRect();
        const ctaRect = document.getElementById('instagramHandoffCta').getBoundingClientRect();
        return {
          imageRect: { left: imageRect.left, top: imageRect.top, width: imageRect.width, height: imageRect.height },
          ctaRect: { left: ctaRect.left, top: ctaRect.top, width: ctaRect.width, height: ctaRect.height }
        };
      });
      assertHotspotAligned(resized.ctaRect, resized.imageRect);
    }
  } finally {
    await browser.close();
    server.close();
  }
});

test('Instagram Android displays the approved Chrome image with an aligned transparent CTA', async () => {
  const { server, port } = await serve();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await openWithUserAgent(browser, port, ANDROID_INSTAGRAM);
    await page.waitForSelector('#instagramHandoffScreen:not([hidden])', { timeout: 15000 });
    const result = await page.evaluate(() => {
      const image = document.getElementById('instagramHandoffImage');
      const cta = document.getElementById('instagramHandoffCta');
      const imageRect = image.getBoundingClientRect();
      const ctaRect = cta.getBoundingClientRect();
      return {
        src: image.getAttribute('src'),
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        imageRatio: imageRect.width / imageRect.height,
        imageRect: { left: imageRect.left, top: imageRect.top, width: imageRect.width, height: imageRect.height },
        ctaRect: { left: ctaRect.left, top: ctaRect.top, width: ctaRect.width, height: ctaRect.height },
        ariaLabel: cta.getAttribute('aria-label')
      };
    });
    assert.equal(result.src, '/assets/instagram-handoff/chrome.jpg');
    assert.equal(result.naturalWidth, 891);
    assert.equal(result.naturalHeight, 1508);
    assert.ok(Math.abs(result.imageRatio - 891 / 1508) < 0.002);
    assert.equal(result.ariaLabel, 'เปิดผ่าน Chrome');
    assertHotspotAligned(result.ctaRect, result.imageRect);
  } finally {
    await browser.close();
    server.close();
  }
});

test('non-Instagram Safari does not show the redirect image', async () => {
  const { server, port } = await serve();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await openWithUserAgent(browser, port, IPHONE_SAFARI);
    await page.waitForTimeout(800);
    const hidden = await page.evaluate(() => document.getElementById('instagramHandoffScreen')?.hidden);
    assert.equal(hidden, true);
  } finally {
    await browser.close();
    server.close();
  }
});
