'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../frontend/instagram-browser-transition.js'), 'utf8');
const ANDROID_INSTAGRAM = 'Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230901.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.0.0 Mobile Safari/537.36 Instagram 320.0.0.0.0';
const IOS_INSTAGRAM = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 320.0.0.0.0';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36';
const IOS_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const LINE_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36 Line/15.0.0';

async function loadTransitionModule() {
  return import(`data:text/javascript,${encodeURIComponent(source)}`);
}

test('Production Instagram transition detects iOS and Android Instagram contexts', async () => {
  const { detectBrowserContext } = await loadTransitionModule();
  assert.deepEqual(
    { isInstagram: detectBrowserContext(ANDROID_INSTAGRAM).isInstagram, platform: detectBrowserContext(ANDROID_INSTAGRAM).platform },
    { isInstagram: true, platform: 'android' }
  );
  assert.deepEqual(
    { isInstagram: detectBrowserContext(IOS_INSTAGRAM).isInstagram, platform: detectBrowserContext(IOS_INSTAGRAM).platform },
    { isInstagram: true, platform: 'ios' }
  );
  assert.equal(detectBrowserContext(ANDROID_CHROME).isInstagram, false);
  assert.equal(detectBrowserContext(IOS_SAFARI).isInstagram, false);
  assert.equal(detectBrowserContext(LINE_UA).isLine, true);
  assert.equal(detectBrowserContext(LINE_UA).isInstagram, false);
});

test('Production external destination strips auth, LIFF, session and order parameters', async () => {
  const { buildExternalDestination } = await loadTransitionModule();
  const destination = buildExternalDestination({
    origin: 'https://customize.luckycolorstone.com',
    pathname: '/',
    search: '?utm_source=instagram&utm_campaign=launch&fbclid=abc&handoff=SECRET&liff.state=SECRET&id_token=SECRET&orderId=SECRET'
  });
  assert.equal(destination, 'https://customize.luckycolorstone.com/?utm_source=instagram&utm_campaign=launch&fbclid=abc');
});

test('Production Android escape uses Chrome intent with a safe fallback', async () => {
  const { buildAndroidChromeIntent } = await loadTransitionModule();
  const target = 'https://customize.luckycolorstone.com/?utm_source=instagram';
  const intent = buildAndroidChromeIntent(target);
  assert.match(intent, /^intent:\/\/customize\.luckycolorstone\.com\/\?utm_source=instagram#Intent;/);
  assert.match(intent, /package=com\.android\.chrome/);
  assert.match(intent, /S\.browser_fallback_url=/);
  assert.match(decodeURIComponent(intent), /https:\/\/customize\.luckycolorstone\.com\//);
});

test('Production iOS escape uses Instagram extbrowser with an encoded destination', async () => {
  const { buildInstagramExternalBrowserUrl } = await loadTransitionModule();
  const target = 'https://customize.luckycolorstone.com/?utm_source=instagram';
  const escapeUrl = buildInstagramExternalBrowserUrl(target);
  assert.equal(escapeUrl, `instagram://extbrowser/?url=${encodeURIComponent(target)}`);
  assert.match(escapeUrl, /^instagram:\/\/extbrowser\/\?url=https%3A%2F%2Fcustomize\.luckycolorstone\.com%2F/);
});
