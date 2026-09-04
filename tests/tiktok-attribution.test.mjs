import assert from 'node:assert/strict';
import test from 'node:test';
import { captureTikTokAttribution, normalizeTikTokAttribution, updateTikTokAttribution } from '../tiktok-attribution.js';

test('attribution retains first touch and updates external last touch with genuine identifiers', () => {
  const first = captureTikTokAttribution({ href: 'https://customize.luckycolorstone.com/?utm_source=tiktok&ttclid=click-1', referrer: 'https://www.tiktok.com/', cookieString: '_ttp=ttp-1', now: 100 });
  const second = captureTikTokAttribution({ href: 'https://customize.luckycolorstone.com/?utm_source=google', referrer: 'https://www.google.com/', cookieString: '_ttp=ttp-2', now: 200 });
  const state = updateTikTokAttribution(updateTikTokAttribution({}, first), second);
  assert.equal(state.firstTouch.tiktok.ttclid, 'click-1');
  assert.equal(state.firstTouch.tiktok.ttp, 'ttp-1');
  assert.equal(state.lastTouch.utm.source, 'google');
  assert.equal(state.lastTouch.tiktok.ttp, 'ttp-2');
});

test('normalization rejects malformed identifiers without inventing replacement data', () => {
  const normalized = normalizeTikTokAttribution({
    firstTouch: { tiktok: { ttclid: 'valid' }, utm: {} },
    lastTouch: { tiktok: { ttclid: 'has space' }, utm: {} }
  });
  assert.equal(normalized.firstTouch.tiktok.ttclid, 'valid');
  assert.equal(normalized.lastTouch.tiktok.ttclid, null);
});
