import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  MIXED_BEAD_SIZE_MODE,
  transitionBraceletSizeMode
} from '../mixed-size-state.js';

const root = new URL('..', import.meta.url);
const appSource = await readFile(new URL('app.js', root), 'utf8');
const htmlSource = await readFile(new URL('index.html', root), 'utf8');
const cssSource = await readFile(new URL('index.css', root), 'utf8');

const thai = (...points) => String.fromCodePoint(...points);
const mixedTitle = thai(0x0e04, 0x0e25, 0x0e30, 0x0e44, 0x0e0b, 0x0e2a, 0x0e4c);
const mixedDescription = thai(0x0e2a, 0x0e19, 0x0e38, 0x0e01, 0x20, 0x0e21, 0x0e35, 0x0e21, 0x0e34, 0x0e15, 0x0e34);
const selectionToast = thai(0x0e01, 0x0e23, 0x0e38, 0x0e13, 0x0e32, 0x0e40, 0x0e25, 0x0e37, 0x0e2d, 0x0e01, 0x0e02, 0x0e19, 0x0e32, 0x0e14, 0x0e2b, 0x0e34, 0x0e19, 0x0e01, 0x0e48, 0x0e2d, 0x0e19);

test('fresh Step 2 state has no selected bead size or implicit 6mm selection', () => {
  assert.match(appSource, /beadSize:\s*null/);
  assert.match(appSource, /State\.beadSize\s*=\s*null/);
  assert.match(appSource, /function hasExplicitBeadSizeSelection\(value = State\.beadSize\)\s*\{\s*return \['4', '6', '10', MIXED_BEAD_SIZE_MODE\]\.includes\(String\(value \?\? ''\)\);\s*\}/);
});

test('Step 2 cards retain the approved exact order and Thai mixed copy', () => {
  for (const [size, order] of [['mixed', 1], ['10', 2], ['6', 3], ['4', 4]]) {
    assert.match(cssSource, new RegExp(`#stepView2 \\.bead-size-card\\[data-bead-size="${size}"\\]\\s*\\{\\s*order:\\s*${order};`));
  }
  assert.ok(htmlSource.includes(mixedTitle));
  assert.ok(htmlSource.includes(mixedDescription));
});

test('Step 2 blocks Next without explicit selection and uses the Thai selection toast', () => {
  assert.match(appSource, /State\.currentStep === 2 && !hasExplicitBeadSizeSelection\(\)/);
  assert.ok(appSource.includes(selectionToast));
  assert.match(appSource, /await goToStep\(State\.currentStep \+ 1\)/);
});

test('all four canonical selections are valid without a default coercion', () => {
  for (const mode of ['4', '6', '10', MIXED_BEAD_SIZE_MODE]) {
    const result = transitionBraceletSizeMode({ beadSize: null, mixedPlacingSize: 6, selectedStones: [] }, mode, []);
    assert.equal(result.ok, true);
    assert.equal(result.state.beadSize, mode);
  }
});

test('fixed to mixed preserves placed stones and uses the previous fixed size for placement', () => {
  const selectedStones = [
    { type: 'stone', stoneId: 'a', size: 10, uniqueId: 'a-1' },
    { type: 'stone', stoneId: 'b', size: 10, uniqueId: 'b-1' }
  ];
  const result = transitionBraceletSizeMode({ beadSize: '10', mixedPlacingSize: 10, selectedStones }, MIXED_BEAD_SIZE_MODE, []);
  assert.equal(result.ok, true);
  assert.equal(result.state.beadSize, MIXED_BEAD_SIZE_MODE);
  assert.equal(result.state.mixedPlacingSize, 10);
  assert.deepEqual(result.state.selectedStones, selectedStones);
});

test('mixed to fixed blocks unsupported stones and does not mutate the source sequence', () => {
  const source = {
    beadSize: MIXED_BEAD_SIZE_MODE,
    mixedPlacingSize: 6,
    selectedStones: [{ type: 'stone', stoneId: 'only-six', size: 6, uniqueId: 'only-six-1' }]
  };
  const before = structuredClone(source);
  const result = transitionBraceletSizeMode(source, '4', [{ id: 'only-six', sizes: [6] }]);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unsupported_stones');
  assert.deepEqual(source, before);
});

test('Step 2 selection preserves explicit state when returning from Step 3', () => {
  assert.match(appSource, /const active = hasExplicitBeadSizeSelection\(\)\s*&& c\.getAttribute\('data-bead-size'\) === State\.beadSize/);
  assert.match(appSource, /if \(State\.currentStep === 3 && step < 3\)/);
  assert.doesNotMatch(appSource, /State\.beadSize\s*=\s*null;[\s\S]{0,300}step3-back-to/);
});
