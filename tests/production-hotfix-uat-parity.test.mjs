import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const [html, css, app, boundary] = await Promise.all([
  readFile(new URL('index.html', root), 'utf8'),
  readFile(new URL('index.css', root), 'utf8'),
  readFile(new URL('app.js', root), 'utf8'),
  readFile(new URL('deferred-step3-auth-boundary.js', root), 'utf8')
]);

const step2 = html.slice(html.indexOf('<section class="step-view" id="stepView2">'), html.indexOf('<section class="step-view" id="stepView3">'));

test('Step 2 keeps the approved vertical Mixed/10/6/4 card presentation', () => {
  const order = ['mixed', '10', '6', '4'].map((size) => step2.indexOf(`data-bead-size="${size}"`));
  assert.ok(order.every((index) => index >= 0));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.match(step2, /bead-size-card-mixed/);
  assert.match(step2, /bead-size-preview-mixed[\s\S]*bead-preview-circle-sm[\s\S]*bead-preview-circle-md[\s\S]*bead-preview-circle-lg/);
  assert.match(step2, /คละไซส์/);
  assert.match(step2, /สนุก มีมิติ/);

  for (const [size, image] of [['mixed', 'hand_06.png'], ['10', 'hand_10.png'], ['6', 'hand_06.png'], ['4', 'hand_04.png']]) {
    const start = step2.indexOf(`data-bead-size="${size}"`);
    const next = step2.indexOf('data-bead-size=', start + 1);
    const card = step2.slice(start, next === -1 ? step2.length : next);
    assert.match(card, new RegExp(`bead-size-hand-panel[\\s\\S]*${image.replace('.', '\\.')}`));
  }

  assert.match(css, /#stepView2 \.bead-size-options\s*\{[\s\S]*flex-direction:\s*column[\s\S]*gap:\s*7px/);
  assert.match(css, /#stepView2 \.bead-size-content,[\s\S]*grid-template-columns:\s*18px minmax\(0, 1fr\) 76px/);
  assert.match(css, /#stepView2 \.bead-size-card-mixed\s*\{[\s\S]*#fffdf8[\s\S]*rgba\(184, 145, 51, 0\.11\)/);
  assert.match(css, /#stepView2 \.bead-size-mixed-recommendation\s*\{[\s\S]*border:\s*1px solid rgba\(216, 169, 59, 0\.34\)/);
});

test('Step 3 uses the one full-size opaque preview above the header without a stacking animation', () => {
  assert.match(html, /<div class="canvas-card" id="step3PreviewCard">/);
  assert.match(css, /#stepView3\.step-view\s*\{[\s\S]*animation:\s*none[\s\S]*opacity:\s*1[\s\S]*transform:\s*none[\s\S]*filter:\s*none/);
  assert.match(css, /#stepView3 \.canvas-card\s*\{[\s\S]*position:\s*sticky[\s\S]*top:\s*0[\s\S]*z-index:\s*20/);
  assert.match(css, /#stepView3\.step-view\.active\s*\{[\s\S]*height:\s*auto[\s\S]*min-height:\s*100%/);
  assert.match(css, /step3-preview-covered #step3PreviewCard\s*\{[\s\S]*background:\s*rgb\(252,\s*251,\s*255\) !important[\s\S]*border-radius:\s*0/);
  assert.doesNotMatch(`${html}\n${css}\n${app}`, /debugSticky|step3StickyDebugOverlay/);
  assert.doesNotMatch(`${html}\n${css}`, /compact-preview|compactPreview/);
});

test('the secure deferred boundary avoids LINE login when identity is already available', () => {
  assert.match(boundary, /!requiresLineLogin\(\) \|\| isAuthenticated\(\)/);
  assert.match(boundary, /saveSnapshot\(\)/);
  assert.match(boundary, /createHandoff\(/);
  assert.match(boundary, /startLineLogin\(\)/);
  assert.ok(app.indexOf('const deferredAuth = await beginDeferredStep3AuthBoundary();') < app.indexOf('await goToStep(State.currentStep + 1)'));
});

test('LINE-owned login and native friendship remain separate from the website-controlled transition', () => {
  const start = app.indexOf('async function openLineOaAddFriendExperience()');
  const end = app.indexOf('async function recheckLineOaFriendshipAndResume()', start);
  const flow = app.slice(start, end);
  assert.match(app, /function showLineOaFriendshipTransition\(\)/);
  assert.match(flow, /showLineOaFriendshipTransition\(\)[\s\S]*await liff\.requestFriendship\(\)/);
  assert.match(flow, /window\.location\.assign\(getLiffEntryUrl\(\)\)/);
  assert.match(flow, /window\.location\.assign\(addFriendUrl\)/);
  assert.doesNotMatch(html, /lineOaFriendshipModal|btnLineOaAddFriend|btnLineOaRecheck/);
});
