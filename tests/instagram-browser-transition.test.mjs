import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAndroidChromeIntent,
  buildExternalDestination,
  buildGoogleChromeUrl,
  buildInstagramExternalBrowserUrl,
  detectBrowserContext
} from '../instagram-browser-transition.js';

const ANDROID_INSTAGRAM = 'Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230901.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.0.0 Mobile Safari/537.36 Instagram 320.0.0.0.0';
const IOS_INSTAGRAM = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 320.0.0.0.0';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36';
const IOS_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const LINE_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36 Line/15.0.0';

test('detects Instagram Android and iOS separately', () => {
  assert.deepEqual(
    { isInstagram: detectBrowserContext(ANDROID_INSTAGRAM).isInstagram, platform: detectBrowserContext(ANDROID_INSTAGRAM).platform },
    { isInstagram: true, platform: 'android' }
  );
  assert.deepEqual(
    { isInstagram: detectBrowserContext(IOS_INSTAGRAM).isInstagram, platform: detectBrowserContext(IOS_INSTAGRAM).platform },
    { isInstagram: true, platform: 'ios' }
  );
});

test('does not show the transition for direct Chrome, Safari, or LINE', () => {
  assert.equal(detectBrowserContext(ANDROID_CHROME).isInstagram, false);
  assert.equal(detectBrowserContext(IOS_SAFARI).isInstagram, false);
  assert.equal(detectBrowserContext(LINE_UA).isLine, true);
  assert.equal(detectBrowserContext(LINE_UA).isInstagram, false);
});

test('external destination preserves UTM/campaign keys without auth or LIFF state', () => {
  const destination = buildExternalDestination({
    origin: 'https://uat.customize.luckycolorstone.com',
    pathname: '/',
    search: '?utm_source=instagram&utm_campaign=launch&fbclid=abc&handoff=SECRET&liff.state=SECRET&id_token=SECRET&orderId=SECRET'
  });
  assert.equal(destination, 'https://uat.customize.luckycolorstone.com/?utm_source=instagram&utm_campaign=launch&fbclid=abc');
});

test('Android intent targets Chrome and includes a safe fallback URL', () => {
  const target = 'https://uat.customize.luckycolorstone.com/?utm_source=instagram';
  const intent = buildAndroidChromeIntent(target);
  assert.match(intent, /^intent:\/\/uat\.customize\.luckycolorstone\.com\/\?utm_source=instagram#Intent;/);
  assert.match(intent, /package=com\.android\.chrome/);
  assert.match(intent, /S\.browser_fallback_url=/);
  assert.match(decodeURIComponent(intent), /https:\/\/uat\.customize\.luckycolorstone\.com\//);
});

test('iOS automatic escape uses the Instagram external-browser URL with an encoded destination', () => {
  const target = 'https://uat.customize.luckycolorstone.com/?utm_source=instagram';
  const escapeUrl = buildInstagramExternalBrowserUrl(target);
  assert.equal(escapeUrl, `instagram://extbrowser/?url=${encodeURIComponent(target)}`);
  assert.match(escapeUrl, /^instagram:\/\/extbrowser\/\?url=https%3A%2F%2Fuat\.customize\.luckycolorstone\.com%2F/);
});

test('Google Chrome deep link preserves the encoded UAT destination', () => {
  const target = 'https://uat.customize.luckycolorstone.com/?utm_source=instagram&utm_campaign=experiment';
  const chromeUrl = buildGoogleChromeUrl(target);
  assert.equal(chromeUrl, `googlechrome://navigate?url=${encodeURIComponent(target)}`);
  assert.match(chromeUrl, /^googlechrome:\/\/navigate\?url=https%3A%2F%2Fuat\.customize\.luckycolorstone\.com%2F/);
});
