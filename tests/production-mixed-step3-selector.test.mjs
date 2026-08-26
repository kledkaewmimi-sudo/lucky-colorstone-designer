import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  MIXED_BEAD_SIZE_MODE,
  getPhysicalStonePlacementSize,
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
  assert.match(appSource, /const isMixedMode = State\.beadSize === MIXED_BEAD_SIZE_MODE/);
  assert.match(appSource, /DOM\.mixedSizeSelectorBar\.hidden = !isMixedMode/);
  assert.match(cssSource, /\.mixed-size-selector-bar\[hidden\]\s*\{\s*display:\s*none !important;/);
  assert.doesNotMatch(appSource, /DOM\.mixedSizeSelectorBar\.hidden = safeActiveSection !== 'stones'/);
});

test('selector state uses only physical values and is preserved when catalog tabs change', () => {
  assert.match(appSource, /const nextState = withMixedPlacingSize\(State, btn\.getAttribute\('data-size'\)\)/);
  assert.match(appSource, /State\.mixedPlacingSize = nextState\.mixedPlacingSize/);
  assert.match(appSource, /State\.mixedSizeFilter = String\(State\.mixedPlacingSize\)/);
  assert.match(appSource, /syncMixedSizeSelector\(\);\s*\n\s*renderCatalogGrid\(\);\s*\n\s*saveState\(\);/);
});

test('mixed catalog filtering uses selected physical placement size and fixed modes retain their own size', () => {
  const stone = { id: 'variant', sizes: [4, 10] };
  assert.equal(stoneSupportsSize(stone, getPhysicalStonePlacementSize(MIXED_BEAD_SIZE_MODE, 4)), true);
  assert.equal(stoneSupportsSize(stone, getPhysicalStonePlacementSize(MIXED_BEAD_SIZE_MODE, 6)), false);
  assert.equal(stoneSupportsSize(stone, getPhysicalStonePlacementSize('10', 4)), true);
  assert.match(appSource, /return stoneSupportsSize\(stone, getCurrentBeadSizeMm\(\)\)/);
  assert.match(appSource, /STONES\.filter\(\(stone\) => isCustomerCatalogItemAvailable\(stone\) && isStoneAvailableForCurrentBeadSize\(stone\)\)/);
});

test('changing selector state cannot mutate an existing placed component', () => {
  const placedStone = { type: 'stone', stoneId: 'a', size: 4, uniqueId: 'a-1' };
  const source = { beadSize: MIXED_BEAD_SIZE_MODE, mixedPlacingSize: 4, selectedStones: [placedStone] };
  const next = setMixedPlacingSize(source, 10);
  assert.equal(next.mixedPlacingSize, 10);
  assert.deepEqual(next.selectedStones, [placedStone]);
  assert.equal(getPhysicalStonePlacementSize(source.beadSize, source.mixedPlacingSize), 4);
  assert.equal(getPhysicalStonePlacementSize(next.beadSize, next.mixedPlacingSize), 10);
});

test('placement is always a physical size and never a mixed/default fallback', () => {
  assert.equal(getPhysicalStonePlacementSize(MIXED_BEAD_SIZE_MODE, 4), 4);
  assert.equal(getPhysicalStonePlacementSize(MIXED_BEAD_SIZE_MODE, 10), 10);
  assert.equal(getPhysicalStonePlacementSize('6', 10), 6);
  assert.equal(getPhysicalStonePlacementSize(null, 6), null);
  assert.match(appSource, /const placedSize = getCurrentBeadSizeMm\(\);\s*\n\s*if \(!Number\.isFinite\(placedSize\)\) return;/);
  assert.match(appSource, /createStoneSelectionItem\(stoneId, placedSize, State\.uniqueCounter\)/);
});
