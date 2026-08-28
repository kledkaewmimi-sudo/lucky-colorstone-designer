import assert from 'node:assert/strict';
import test from 'node:test';
import { getDiscreteBraceletCompletionEligibility, getNextComponentPlacementEligibility } from '../bracelet-geometry.js';

test('RED A: Mixed 172mm of 175mm remains incomplete and allows only 4mm and 6mm within target + 5mm', () => {
  const targetLengthMm = 175;
  const usedLengthMm = 172;
  const placeableSizes = [4, 6, 10].filter((componentLengthMm) =>
    getNextComponentPlacementEligibility({ usedLengthMm, targetLengthMm, componentLengthMm }).eligible
  );
  assert.deepEqual(placeableSizes, [4, 6]);
  assert.equal(getDiscreteBraceletCompletionEligibility({ mode: 'mixed', usedLengthMm, targetLengthMm }).eligible, false);
});

test('fixed 10mm restores pre-Mixed completion at 17 beads', () => {
  const targetLengthMm = 175;
  assert.equal(getDiscreteBraceletCompletionEligibility({ mode: 'fixed', usedLengthMm: 170, targetLengthMm, fixedComponentLengthMm: 10 }).eligible, true);
  assert.equal(getNextComponentPlacementEligibility({ mode: 'fixed', usedLengthMm: 170, targetLengthMm, componentLengthMm: 10 }).eligible, false);
});

test('fixed 6mm restores pre-Mixed completion at 29 beads', () => {
  const targetLengthMm = 175;
  assert.equal(getDiscreteBraceletCompletionEligibility({ mode: 'fixed', usedLengthMm: 174, targetLengthMm, fixedComponentLengthMm: 6 }).eligible, true);
  assert.equal(getNextComponentPlacementEligibility({ mode: 'fixed', usedLengthMm: 174, targetLengthMm, componentLengthMm: 6 }).eligible, false);
});

test('fixed 4mm restores pre-Mixed completion at 43 beads', () => {
  const targetLengthMm = 175;
  assert.equal(getDiscreteBraceletCompletionEligibility({ mode: 'fixed', usedLengthMm: 172, targetLengthMm, fixedComponentLengthMm: 4 }).eligible, true);
  assert.equal(getNextComponentPlacementEligibility({ mode: 'fixed', usedLengthMm: 172, targetLengthMm, componentLengthMm: 4 }).eligible, false);
});
