import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appUrl = new URL('../app.js', import.meta.url);

function countMatches(source, expression) {
  return [...source.matchAll(expression)].length;
}

test('TikTok ViewContent augments rather than duplicates existing Meta dispatches', async () => {
  const app = await readFile(appUrl, 'utf8');
  const guardedPair = /if \(State\.currentStep < 4\) \{\s*trackMetaViewContent\(\);\s*void trackTikTokViewContent\(\);\s*\}/g;

  assert.equal(countMatches(app, guardedPair), 2, 'both guarded restoration call sites contain one Meta and one TikTok ViewContent dispatch');
  assert.equal(countMatches(app, /trackMetaViewContent\(\);/g), 3, 'the two guarded call sites and the Step 1 entry path each dispatch Meta once');
  assert.equal(countMatches(app, /void trackTikTokViewContent\(\);/g), 3, 'TikTok ViewContent remains present at every intended Meta ViewContent call site');
});

test('Meta Purchase and InitiateCheckout call sites remain unchanged by TikTok ViewContent', async () => {
  const app = await readFile(appUrl, 'utf8');

  assert.equal(countMatches(app, /void verifyAndTrackMetaPurchase\(sessionId\);/g), 2);
  assert.equal(countMatches(app, /trackMetaInitiateCheckout\(payload\.id, payload\.amountTotal, payload\.currency\);/g), 1);
});
