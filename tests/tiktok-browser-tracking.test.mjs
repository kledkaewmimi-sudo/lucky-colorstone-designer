import assert from 'node:assert/strict';
import test from 'node:test';
import { initializeTikTokPixel, resetTikTokBrowserTrackingForTests, trackTikTokEvent } from '../tiktok-browser-tracking.js';

test('Pixel fetches public config once, queues PageView once, and carries event_id', async () => {
  resetTikTokBrowserTrackingForTests();
  let requests = 0;
  const scripts = [];
  const windowRef = { fetch: async () => { requests += 1; return { ok: true, json: async () => ({ tiktokPixelId: 'pixel_12345' }) }; } };
  const documentRef = {
    createElement: () => ({}),
    getElementsByTagName: () => [{ parentNode: { insertBefore: (script) => scripts.push(script) } }],
    head: { appendChild: (script) => scripts.push(script) }
  };
  assert.equal(await initializeTikTokPixel({ windowRef, documentRef }), true);
  assert.equal(await initializeTikTokPixel({ windowRef, documentRef }), true);
  assert.equal(requests, 1);
  assert.equal(scripts.length, 1);
  assert.deepEqual(windowRef.ttq[0], ['page']);
  assert.equal(await trackTikTokEvent('ViewContent', { content_id: 'bracelet' }, 'event-1', { windowRef, documentRef }), true);
  assert.deepEqual(windowRef.ttq.at(-1), ['track', 'ViewContent', { content_id: 'bracelet' }, { event_id: 'event-1' }]);
});

test('invalid public configuration prevents browser event dispatch', async () => {
  resetTikTokBrowserTrackingForTests();
  const windowRef = { fetch: async () => ({ ok: true, json: async () => ({ tiktokPixelId: '' }) }) };
  assert.equal(await initializeTikTokPixel({ windowRef, documentRef: {} }), false);
});
