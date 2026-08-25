import assert from 'node:assert/strict';
import test from 'node:test';
import { createGuestDesignSnapshot, parseGuestDesignSnapshot } from '../guest-design-state.js';
import {
  getStoneSupportedSizes,
  normalizeMixedPlacingSize,
  setMixedPlacingSize,
  stoneSupportsSize,
  transitionBraceletSizeMode,
  validateMixedSequenceForFixedSize
} from '../mixed-size-state.js';

const catalog = [
  { id: 'all', sizes: [4, 6, 10] },
  { id: 'six-only', sizes: [6] },
  { id: 'ten-only', sizes: [10] }
];

const stones = (sizes) => sizes.map((size, index) => ({ componentType: 'stone', stoneId: 'all', size, uniqueId: index + 1 }));

for (const size of ['4', '6', '10']) {
  test(`fixed ${size} state remains unchanged`, () => {
    const state = { beadSize: size, mixedPlacingSize: Number(size), selectedStones: stones([Number(size)]) };
    const result = transitionBraceletSizeMode(state, size, catalog);
    assert.equal(result.ok, true);
    assert.deepEqual(result.state, state);
  });

  test(`fixed ${size} to mixed preserves placed stones and initializes placing size`, () => {
    const state = { beadSize: size, mixedPlacingSize: Number(size), selectedStones: stones([Number(size)]) };
    const result = transitionBraceletSizeMode(state, 'mixed', catalog);
    assert.equal(result.ok, true);
    assert.equal(result.state.beadSize, 'mixed');
    assert.equal(result.state.mixedPlacingSize, Number(size));
    assert.deepEqual(result.state.selectedStones, state.selectedStones);
  });
}

test('mixed placing size changes do not mutate placed stones and invalid values normalize safely', () => {
  const state = { beadSize: 'mixed', mixedPlacingSize: 4, selectedStones: stones([4, 6, 10]) };
  const changed = setMixedPlacingSize(state, 10);
  assert.equal(changed.mixedPlacingSize, 10);
  assert.deepEqual(changed.selectedStones, state.selectedStones);
  assert.equal(normalizeMixedPlacingSize('mixed', 4), 4);
});

test('mixed sequence accepts 4mm, 6mm, and 10mm stone components together', () => {
  const state = { beadSize: 'mixed', mixedPlacingSize: 10, selectedStones: stones([4, 6, 10]) };
  assert.deepEqual(state.selectedStones.map((item) => item.size), [4, 6, 10]);
});

test('mixed to fixed validates and converts when every stone supports the explicit target', () => {
  const state = { beadSize: 'mixed', mixedPlacingSize: 6, selectedStones: stones([4, 6, 10]) };
  const result = transitionBraceletSizeMode(state, '6', catalog);
  assert.equal(result.ok, true);
  assert.equal(result.state.beadSize, '6');
  assert.deepEqual(result.state.selectedStones.map((item) => item.size), [6, 6, 6]);
  assert.deepEqual(validateMixedSequenceForFixedSize(state.selectedStones, catalog, '6'), { ok: true, targetSize: 6, unsupportedStones: [] });
});

test('mixed to fixed reports unsupported stones without mutating the current state', () => {
  const state = {
    beadSize: 'mixed', mixedPlacingSize: 6,
    selectedStones: [{ componentType: 'stone', stoneId: 'six-only', size: 6, uniqueId: 1 }, { componentType: 'stone', stoneId: 'all', size: 10, uniqueId: 2 }]
  };
  const before = structuredClone(state);
  const result = transitionBraceletSizeMode(state, '10', catalog);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unsupported_stones');
  assert.deepEqual(result.unsupportedStones, [{ stoneId: 'six-only', size: 6 }]);
  assert.deepEqual(state, before);
});

test('mixed guest restore preserves ordered per-component stone sizes and mixed placing size', () => {
  const snapshot = createGuestDesignSnapshot({
    currentStep: 3, wristSize: 16, beadSize: 'mixed', mixedPlacingSize: 10, selectedCharmIds: [],
    selectedStones: [
      { componentType: 'stone', stoneId: 'all', size: 4 },
      { componentType: 'stone', stoneId: 'all', size: 6 },
      { componentType: 'stone', stoneId: 'all', size: 10 }
    ]
  }, { now: 100 });
  const parsed = parseGuestDesignSnapshot(JSON.stringify(snapshot), { now: 101 });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.snapshot.design.mixedPlacingSize, 10);
  assert.deepEqual(parsed.snapshot.design.components.map((component) => component.size), [4, 6, 10]);
});

test('catalog size helpers use catalog sizes only', () => {
  assert.deepEqual(getStoneSupportedSizes(catalog[0]), [4, 6, 10]);
  assert.deepEqual(getStoneSupportedSizes(catalog[1]), [6]);
  assert.equal(stoneSupportsSize(catalog[1], 6), true);
  assert.equal(stoneSupportsSize(catalog[1], 4), false);
});

test('guest snapshots persist no derived ResolvedLayout data', () => {
  const snapshot = createGuestDesignSnapshot({
    currentStep: 3, wristSize: 16, beadSize: 'mixed', mixedPlacingSize: 4, selectedCharmIds: [],
    selectedStones: [{ componentType: 'stone', stoneId: 'all', size: 4 }],
    resolvedLayout: { mustNotPersist: true }
  }, { now: 100 });
  assert.equal(JSON.stringify(snapshot).includes('resolvedLayout'), false);
});
