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
const mixedDescription = String.fromCodePoint(0x0e2a, 0x0e19, 0x0e01, 0x0020, 0x0e21, 0x0e21, 0x0e15);
const malformedMixedDescriptions = [
  String.fromCodePoint(0x0e2a, 0x0e19, 0x0e38, 0x0e01, 0x0020, 0x0e21, 0x0e21, 0x0e15),
  String.fromCodePoint(0x0e2a, 0x0e19, 0x0e38, 0x0e01, 0x0020, 0x0e21, 0x0e35, 0x0e21, 0x0e34, 0x0e15, 0x0e34)
];
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
  assert.match(html, /bead-size-mixed-recommendation[\s\S]*?★/);
  assert.match(css, /#stepView2 \.bead-size-card-mixed \{[\s\S]*?box-shadow:/);
  assert.match(css, /#stepView2 \.bead-size-preview-mixed \{[\s\S]*?justify-content: flex-start;/);
  assert.match(html, new RegExp(`data-bead-size="mixed"[\\s\\S]*?<h4>${mixedDescription}<\\/h4>`, 'u'));
  assert.deepEqual([...mixedDescription].map((char) => char.codePointAt(0)), [0x0e2a, 0x0e19, 0x0e01, 0x0020, 0x0e21, 0x0e21, 0x0e15]);
  malformedMixedDescriptions.forEach((value) => assert.doesNotMatch(html, new RegExp(`<h4>${value}<\\/h4>`, 'u')));
});

test('fresh Step 2 has no default selection and keeps an explicit selection on return', () => {
  assert.match(app, /beadSize: null,/);
  assert.match(app, /function hasExplicitBeadSizeSelection\(value = State\.beadSize\)/);
  assert.match(app, /State\.beadSize = null;/);
  assert.match(app, /const active = hasExplicitBeadSizeSelection\(\)[\s\S]*?c\.getAttribute\('data-bead-size'\) === State\.beadSize;/);
  assert.match(app, /State\.beadSize = hasExplicitBeadSizeSelection\(parsed\.beadSize\)[\s\S]*?: null;/);
  const backNavigation = app.slice(app.indexOf('async function goToStep(step)'), app.indexOf('function configureFooterNavigation()'));
  assert.match(backNavigation, /if \(State\.currentStep === 3 && step < 3\) \{[\s\S]*?resetStep3DesignState/);
  assert.doesNotMatch(backNavigation, /State\.beadSize\s*=/);
});

test('Step 2 blocks Next without an explicit selection and leaves every size selectable', () => {
  assert.match(app, /State\.currentStep === 2 && !hasExplicitBeadSizeSelection\(\)/);
  assert.match(app, /showToast\('กรุณาเลือกขนาดหินก่อน', 3000\);/);
  assert.match(app, /const targetBeadSize = normalizeBeadSizeOption\(card\.getAttribute\('data-bead-size'\)\);/);
  for (const size of ['mixed', '10', '6', '4']) {
    assert.match(html, new RegExp(`data-bead-size="${size}"`));
  }
});

for (const size of ['mixed', '10', '6', '4']) {
  test(`a fresh Step 2 selection of ${size} becomes an explicit size choice`, () => {
    const selected = transitionBraceletSizeMode({ beadSize: null, mixedPlacingSize: 6, selectedStones: [] }, size, catalog);
    assert.equal(selected.ok, true);
    assert.equal(selected.state.beadSize, size);
  });
}

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
  assert.match(css, /#stepView3 \.canvas-card \{\s*position: sticky;\s*top: 0;\s*z-index: 20;[\s\S]*?pointer-events: auto;/);
  assert.match(css, /\.app-content \{[\s\S]*?padding: 0 16px var\(--step-content-bottom-clearance\) 16px;/);
  assert.match(css, /#stepView3\.step-view\.active \{\s*height: auto;\s*min-height: 100%;/);
  assert.match(css, /\.app-header \{[\s\S]*?z-index: 10;/);
  assert.match(css, /\.app-container\.step3-preview-covered \.app-header \{\s*pointer-events: none;/);
  assert.match(css, /\.app-container\.step3-preview-covered #step3PreviewCard \{[\s\S]*?background: rgb\(252, 251, 255\) !important;[\s\S]*?background-clip: border-box;[\s\S]*?opacity: 1 !important;[\s\S]*?mix-blend-mode: normal;[\s\S]*?backdrop-filter: none;[\s\S]*?filter: none;[\s\S]*?mask: none;[\s\S]*?clip-path: none;[\s\S]*?border-radius: 0;/);
  assert.match(css, /#stepView3\.step-view \{[\s\S]*?animation: none;[\s\S]*?opacity: 1;[\s\S]*?transform: none;[\s\S]*?filter: none;[\s\S]*?isolation: auto;/);
  assert.doesNotMatch(css, /step3FadeIn/);
  assert.doesNotMatch(css, /step3-preview-pinned/);
  assert.match(app, /function syncStep3StickyLayer\(\)/);
  assert.match(app, /previewTop <= scrollportTop \+ 1/);
  assert.match(app, /classList\.remove\('step3-preview-covered'\)/);
  assert.doesNotMatch(css, /is-compact-sticky|step3-preview-sentinel/);
  assert.doesNotMatch(app, /setupStep3StickyPreview|is-compact-sticky|step3PreviewSentinel|scale\(/);
  assert.match(app, /renderBraceletCanvas\(resolvedLayout\)/);
  assert.match(css, /\.app-header \{[\s\S]*?z-index: 100;/);
  for (const mode of ['4', '6', '10', 'mixed']) {
    assert.ok(['4', '6', '10', MIXED_BEAD_SIZE_MODE].includes(normalizeBraceletSizeMode(mode)));
  }
});

test('final UAT candidate ships without a sticky debug overlay', () => {
  assert.match(app, /const STICKY_DEBUG_ENABLED = false;/);
  assert.doesNotMatch(app, /urlParams\.get\('debugSticky'\)/);
  assert.match(app, /if \(!STICKY_DEBUG_ENABLED \|\| step3StickyDebugOverlay\) return;/);
});

test('Step 3 uses a shorter mobile tab row and a tighter mixed strip gap', () => {
  assert.match(css, /#stepView3 \.catalog-type-filter \{\s*min-height: 53px;/);
  assert.match(css, /#stepView3 \.catalog-type-tab \{\s*gap: 2px;\s*min-height: 45px;/);
  assert.match(css, /#stepView3 \.catalog-type-filter \+ \.mixed-size-selector-bar \{\s*margin-top: -5px;/);
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
