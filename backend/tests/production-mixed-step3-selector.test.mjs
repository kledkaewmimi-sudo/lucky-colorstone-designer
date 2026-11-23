import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  MIXED_BEAD_SIZE_MODE,
  getMixedPlacementSizeForStone,
  normalizeBraceletSizeMode,
  normalizeMixedPlacingSize,
  setMixedPlacingSize,
  stoneSupportsSize
} from '../mixed-size-state.js';

const root = new URL('..', import.meta.url);
const appSource = await readFile(new URL('app.js', root), 'utf8');
const htmlSource = await readFile(new URL('index.html', root), 'utf8');
const cssSource = await readFile(new URL('index.css', root), 'utf8');
const selectorMarkup = htmlSource.match(/<div class="mixed-size-selector-bar"[\s\S]*?<\/div>\s*\n\s*<!-- Stone Catalog Section -->/)?.[0] || '';

test('mixed selector has exactly the three approved physical sizes and no extra mixed controls', () => {
  assert.equal((selectorMarkup.match(/class="mixed-toggle-btn(?:\s+[^"]*)?"/g) || []).length, 3);
  for (const size of ['4', '6', '10']) {
    assert.match(selectorMarkup, new RegExp(`data-size="${size}"`));
  }
  assert.doesNotMatch(selectorMarkup, /data-size="(?:all|auto|mixed)"/);
  assert.doesNotMatch(selectorMarkup, /ทั้งหมด|space remain|mixedSpaceText/i);
});

test('selector is visible only for mixed mode and keeps zero layout space in fixed modes', () => {
  assert.match(appSource, /DOM\.mixedSizeSelectorBar\.hidden = State\.beadSize !== MIXED_BEAD_SIZE_MODE/);
  assert.match(cssSource, /\.mixed-size-selector-bar\[hidden\]\s*\{\s*display:\s*none !important;/);
  assert.doesNotMatch(appSource, /DOM\.mixedSizeSelectorBar\.hidden = safeActiveSection !== 'stones'/);
});

test('selector state uses only physical values and is preserved when catalog tabs change', () => {
  assert.match(appSource, /function setMixedStoneSizeFilter\(size\)\s*\{\s*const nextFilter = normalizeMixedSizeFilter\(size, State\.mixedSizeFilter\);\s*State\.mixedSizeFilter = nextFilter;\s*if \(nextFilter !== 'all'\) setCurrentMixedPlacingSize\(nextFilter\);\s*\}/);
  assert.match(appSource, /DOM\.mixedToggleBtns\.forEach\(btn => \{\s*btn\.addEventListener\('click', \(\) => \{\s*if \(State\.beadSize !== MIXED_BEAD_SIZE_MODE\) return;\s*setMixedStoneSizeFilter\(btn\.getAttribute\('data-size'\)\);\s*renderStep3\(\);\s*saveState\(\);/);
});

test('mixed catalog filtering uses selected physical placement size and fixed modes retain their own size', () => {
  const stone = { id: 'variant', sizes: [4, 10] };
  assert.equal(getMixedPlacementSizeForStone(stone, 4), 4);
  assert.equal(getMixedPlacementSizeForStone(stone, 6), null);
  assert.equal(stoneSupportsSize(stone, Number(normalizeBraceletSizeMode('10'))), true);
  assert.match(appSource, /return stoneSupportsSize\(stone, getCurrentBeadSizeMm\(\)\)/);
  assert.match(appSource, /function getCurrentBeadSizeMm\(\)\s*\{\s*const mode = normalizeBeadSizeOption\(State\.beadSize\);\s*return mode === MIXED_BEAD_SIZE_MODE\s*\? normalizeMixedPlacingSize\(State\.mixedPlacingSize\)\s*: Number\(mode\);\s*\}/);
  assert.match(appSource, /STONES\.filter\(\(stone\) => isCustomerCatalogItemAvailable\(stone\) && isStoneVisibleForCurrentSizeFilter\(stone\)\)/);
});

test('changing selector state cannot mutate an existing placed component', () => {
  const placedStone = { type: 'stone', stoneId: 'a', size: 4, uniqueId: 'a-1' };
  const source = { beadSize: MIXED_BEAD_SIZE_MODE, mixedPlacingSize: 4, selectedStones: [placedStone] };
  const next = setMixedPlacingSize(source, 10);
  assert.equal(next.mixedPlacingSize, 10);
  assert.deepEqual(next.selectedStones, [placedStone]);
  assert.equal(normalizeMixedPlacingSize(source.mixedPlacingSize), 4);
  assert.equal(normalizeMixedPlacingSize(next.mixedPlacingSize), 10);
});

test('placement uses the current physical size selected by fixed or mixed mode', () => {
  const stone = { id: 'variant', sizes: [4, 6, 10] };
  assert.equal(getMixedPlacementSizeForStone(stone, 4), 4);
  assert.equal(getMixedPlacementSizeForStone(stone, 10), 10);
  assert.equal(Number(normalizeBraceletSizeMode('6')), 6);
  assert.match(appSource, /const placedSize = State\.beadSize === 'mixed' \? State\.mixedPlacingSize : parseInt\(State\.beadSize\);/);
  assert.match(appSource, /createStoneSelectionItem\(stoneId, placedSize, State\.uniqueCounter\)/);
});
