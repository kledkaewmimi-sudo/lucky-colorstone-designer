import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  getMixedPlacementSizeForStone,
  setMixedPlacingSize,
  stoneMatchesMixedSizeFilter,
  transitionBraceletSizeMode
} from '../mixed-size-state.js';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const catalog = [
  { id: 'four', sizes: [4] },
  { id: 'six', sizes: [6] },
  { id: 'ten', sizes: [10] },
  { id: 'all', sizes: [4, 6, 10] }
];
const MIXED_LABEL_CODE_POINTS = [0x0e04, 0x0e25, 0x0e30, 0x0e44, 0x0e0b, 0x0e2a, 0x0e4c];
const ALL_SIZES_LABEL_CODE_POINTS = [0x0e17, 0x0e31, 0x0e49, 0x0e07, 0x0e2b, 0x0e21, 0x0e14];
const deprecatedMixedLabel = String.fromCodePoint(0x0e04, 0x0e25, 0x0e30, 0x0e44, 0x0e0b, 0x0e2a);
const deprecatedAllSizesLabel = String.fromCodePoint(0x0e17, 0x0e07, 0x0e2b, 0x0e21, 0x0e14);
const toCodePoints = (value) => Array.from(value, (character) => character.codePointAt(0));

test('Step 2 renders the fixed 4/6/10 controls and the คละไซส์ option', () => {
  ['data-bead-size="4"', 'data-bead-size="6"', 'data-bead-size="10"', 'data-bead-size="mixed"', 'คละไซส์'].forEach((token) => assert.ok(html.includes(token)));
});

test('customer-facing mixed-size labels exactly match the approved Thai copy', () => {
  assert.match(html, /data-bead-size="mixed"[\s\S]*?aria-label="คละไซส์"/);
  assert.match(html, /<span class="bead-size-label">คละไซส์<\/span>/);
  assert.match(
    html,
    /data-size="all" aria-pressed="false">ทั้งหมด<\/button>[\s\S]*?data-size="4"[\s\S]*?data-size="6"[\s\S]*?data-size="10"/
  );
  assert.equal([...html.matchAll(/คละไซส์/g)].length, 2);
  assert.equal([...html.matchAll(/ทั้งหมด/g)].length, 1);
  assert.equal(new RegExp(`${deprecatedMixedLabel}(?!\\u0e4c)`, 'u').test(html), false);
  assert.equal(html.includes(deprecatedAllSizesLabel), false);
  assert.deepEqual(toCodePoints('คละไซส์'), MIXED_LABEL_CODE_POINTS);
  assert.deepEqual(toCodePoints('ทั้งหมด'), ALL_SIZES_LABEL_CODE_POINTS);
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

test('mixed filter is mixed-only and exposes all requested labels', () => {
  assert.match(html, /id="mixedSizeSelectorBar" hidden/);
  assert.match(app, /State\.beadSize !== MIXED_BEAD_SIZE_MODE \|\| safeActiveSection !== 'stones'/);
  ['ทั้งหมด', '4mm', '6mm', '10mm'].forEach((label) => assert.ok(html.includes(label)));
});

for (const size of [4, 6, 10]) {
  test(`${size}mm filter shows only catalog stones supporting ${size}mm`, () => {
    assert.deepEqual(catalog.filter((stone) => stoneMatchesMixedSizeFilter(stone, String(size))).map((stone) => stone.id), [String(['four', 'six', 'ten'][[4, 6, 10].indexOf(size)]), 'all']);
  });
}

test('ทั้งหมด browsing and filter switches do not mutate existing placed stones', () => {
  const state = { beadSize: 'mixed', mixedPlacingSize: 6, selectedStones: [{ stoneId: 'all', size: 4 }, { stoneId: 'all', size: 10 }] };
  const before = structuredClone(state.selectedStones);
  const allMatches = catalog.filter((stone) => stoneMatchesMixedSizeFilter(stone, 'all'));
  const switched = setMixedPlacingSize(state, 10);
  assert.equal(allMatches.length, 4);
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
