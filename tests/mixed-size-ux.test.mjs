import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  MIXED_BEAD_SIZE_MODE,
  getMixedPlacementSizeForStone,
  normalizeBraceletSizeMode,
  setMixedPlacingSize,
  stoneMatchesMixedSizeFilter,
  transitionBraceletSizeMode
} from '../mixed-size-state.js';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../index.css', import.meta.url), 'utf8');
const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const mixedLabel = String.fromCodePoint(0x0e04, 0x0e25, 0x0e30, 0x0e44, 0x0e0b, 0x0e2a, 0x0e4c);
const allSizesLabel = String.fromCodePoint(0x0e17, 0x0e31, 0x0e49, 0x0e07, 0x0e2b, 0x0e21, 0x0e14);
const catalog = [
  { id: 'four', sizes: [4] },
  { id: 'six', sizes: [6] },
  { id: 'ten', sizes: [10] },
  { id: 'all', sizes: [4, 6, 10] }
];

test('Step 2 keeps four compact vertical cards in the requested mixed-to-4mm order with right-side wrist images', () => {
  ['data-bead-size="4"', 'data-bead-size="6"', 'data-bead-size="10"', 'data-bead-size="mixed"', mixedLabel].forEach((token) => assert.ok(html.includes(token)));
  assert.match(css, /#stepView2 \.bead-size-options \{\s*display: flex;\s*flex-direction: column;/);
  assert.match(css, /#stepView2 \.bead-size-card,[\s\S]*?min-height: 84px/);
  assert.match(css, /data-bead-size="mixed"\] \{ order: 1; \}[\s\S]*?data-bead-size="10"\] \{ order: 2; \}[\s\S]*?data-bead-size="6"\] \{ order: 3; \}[\s\S]*?data-bead-size="4"\] \{ order: 4;/);
  assert.match(css, /#stepView2 \.bead-size-hand-panel,[\s\S]*?display: flex;/);
  assert.match(html, /data-bead-size="mixed"[\s\S]*?src="\/assets\/hand\/hand_06\.png"/);
  assert.match(css, /#stepView2 \.bead-size-card-recommended \{[\s\S]*?background: var\(--color-white\)/);
});

test('mixed selector is a compact three-button strip below the tab row', () => {
  const tabRowIndex = html.indexOf('id="catalogTypeFilter"');
  const mixedBarIndex = html.indexOf('id="mixedSizeSelectorBar"');
  const catalogIndex = html.indexOf('<!-- Stone Catalog Section -->');
  assert.ok(tabRowIndex >= 0 && mixedBarIndex > tabRowIndex && catalogIndex > mixedBarIndex);
  assert.match(html, /id="mixedSizeSelectorBar" hidden[\s\S]*?data-size="4"[\s\S]*?data-size="6"[\s\S]*?data-size="10"/);
  assert.doesNotMatch(html, /data-size="all"/);
  assert.doesNotMatch(html, /mixedSpaceText|mixed-space-container|Remaining Space/);
  assert.doesNotMatch(html, new RegExp(allSizesLabel, 'u'));
  assert.match(css, /#stepView3 \.mixed-size-selector-bar \{[\s\S]*?min-height: 34px[\s\S]*?margin: 0 0 3px/);
  assert.match(css, /#stepView3 \.mixed-toggle-btn \{[\s\S]*?border: 0;/);
  assert.match(css, /#stepView3 \.mixed-toggles \{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /#stepView3 \.mixed-size-selector-bar\[hidden\] \{\s*display: none !important;/);
});

test('Step 3 uses one shared full-size sticky preview with the canonical renderer for every size mode', () => {
  assert.match(html, /id="step3PreviewCard"[\s\S]*?id="braceletSvg"/);
  assert.equal((html.match(/id="braceletSvg"/g) || []).length, 1);
  assert.match(css, /#stepView3 \.canvas-card \{\s*position: sticky;\s*top: env\(safe-area-inset-top, 0px\);\s*z-index: 110;/);
  assert.doesNotMatch(css, /is-compact-sticky|step3-preview-sentinel/);
  assert.doesNotMatch(app, /setupStep3StickyPreview|is-compact-sticky|step3PreviewSentinel/);
  assert.match(app, /renderBraceletCanvas\(resolvedLayout\)/);
  for (const mode of ['4', '6', '10', 'mixed']) {
    assert.ok(['4', '6', '10', MIXED_BEAD_SIZE_MODE].includes(normalizeBraceletSizeMode(mode)));
  }
});

test('full-size sticky preview does not reset catalog scroll on renderer updates', () => {
  assert.doesNotMatch(app, /scrollTo\(/);
  assert.match(app, /function renderStep3\(\) \{[\s\S]*?renderBraceletCanvas\(resolvedLayout\)/);
});

for (const size of ['4', '6', '10']) {
  test(`selecting mixed from fixed ${size} uses canonical mixed mode and matching initial placement size`, () => {
    const state = { beadSize: size, mixedPlacingSize: Number(size), selectedStones: [{ componentType: 'stone', stoneId: 'all', size: Number(size) }] };
    const result = transitionBraceletSizeMode(state, 'mixed', catalog);
    assert.equal(result.ok, true);
    assert.equal(result.state.beadSize, 'mixed');
    assert.equal(result.state.mixedPlacingSize, Number(size));
  });
}

test('fixed modes hide the selector without layout space and mixed mode keeps it visible across Step 3 tabs', () => {
  assert.match(app, /DOM\.mixedSizeSelectorBar\.hidden = State\.beadSize !== MIXED_BEAD_SIZE_MODE/);
  assert.match(app, /if \(!\['4', '6', '10'\]\.includes\(String\(State\.mixedSizeFilter\)\)\)/);
  assert.match(app, /State\.mixedSizeFilter = String\(normalizeMixedPlacingSize\(State\.mixedPlacingSize\)\)/);
  for (const fixedSize of ['4', '6', '10']) {
    assert.notEqual(normalizeBraceletSizeMode(fixedSize), MIXED_BEAD_SIZE_MODE);
  }
  assert.equal(normalizeBraceletSizeMode('mixed'), MIXED_BEAD_SIZE_MODE);
});

test('fixed-to-mixed and mixed-to-fixed visibility follows the canonical transition mode', () => {
  const fixedState = { beadSize: '6', mixedPlacingSize: 6, selectedStones: [{ componentType: 'stone', stoneId: 'all', size: 6 }] };
  const intoMixed = transitionBraceletSizeMode(fixedState, 'mixed', catalog);
  assert.equal(intoMixed.ok, true);
  assert.equal(intoMixed.state.beadSize, MIXED_BEAD_SIZE_MODE);

  const intoFixed = transitionBraceletSizeMode(intoMixed.state, '10', catalog);
  assert.equal(intoFixed.ok, true);
  assert.equal(intoFixed.state.beadSize, '10');
});

test('restored fixed and mixed modes normalize to the expected selector visibility state', () => {
  const restoredFixed = normalizeBraceletSizeMode('4');
  const restoredMixed = normalizeBraceletSizeMode('mixed');
  assert.notEqual(restoredFixed, MIXED_BEAD_SIZE_MODE);
  assert.equal(restoredMixed, MIXED_BEAD_SIZE_MODE);
});

for (const size of [4, 6, 10]) {
  test(`${size}mm filter shows only catalog stones supporting ${size}mm`, () => {
    assert.deepEqual(catalog.filter((stone) => stoneMatchesMixedSizeFilter(stone, String(size))).map((stone) => stone.id), [String(['four', 'six', 'ten'][[4, 6, 10].indexOf(size)]), 'all']);
  });
}

test('switching explicit mixed placement sizes does not mutate existing components', () => {
  const state = { beadSize: 'mixed', mixedPlacingSize: 6, selectedStones: [{ stoneId: 'all', size: 4 }, { stoneId: 'all', size: 10 }] };
  const before = structuredClone(state.selectedStones);
  const switched = setMixedPlacingSize(state, 10);
  assert.deepEqual(state.selectedStones, before);
  assert.deepEqual(switched.selectedStones, before);
});

test('mixed placement has an explicit compatible size and never falls back to 6mm', () => {
  assert.equal(getMixedPlacementSizeForStone(catalog[0], 4), 4);
  assert.equal(getMixedPlacementSizeForStone(catalog[0], 6), null);
  assert.match(app, /getMixedPlacementSizeForStone\(stoneData, State\.mixedPlacingSize\) === null/);
});

test('mixed to fixed UX validates before confirmation and cancellation leaves state unchanged', () => {
  assert.match(app, /const preview = transitionBraceletSizeMode\(State, targetBeadSize, STONES\)/);
  assert.match(app, /if \(!preview\.ok\) \{/);
  assert.match(app, /if \(!confirmed\) return;/);
});

test('fixed UI, catalog tabs, and the UAT Step 4 block remain present', () => {
  assert.match(app, /DOM\.catalogTypeTabs\.forEach/);
  assert.match(app, /if \(IS_UAT_MODE && step === 4\)/);
  assert.match(app, /async function handleStripeCheckout\(\) \{\s*if \(IS_UAT_MODE\)/);
});
