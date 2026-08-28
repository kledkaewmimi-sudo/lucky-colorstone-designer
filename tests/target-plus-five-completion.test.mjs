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

test('RED B: fixed 10mm reaches completion at 18 beads, not 17', () => {
  const targetLengthMm = 175;
  assert.equal(getDiscreteBraceletCompletionEligibility({ mode: 'fixed', usedLengthMm: 170, targetLengthMm, fixedComponentLengthMm: 10 }).eligible, false);
  assert.equal(getDiscreteBraceletCompletionEligibility({ mode: 'fixed', usedLengthMm: 180, targetLengthMm, fixedComponentLengthMm: 10 }).eligible, true);
});

test('RED C: fixed 6mm reaches completion at 30 beads, not 29', () => {
  const targetLengthMm = 175;
  assert.equal(getDiscreteBraceletCompletionEligibility({ mode: 'fixed', usedLengthMm: 174, targetLengthMm, fixedComponentLengthMm: 6 }).eligible, false);
  assert.equal(getDiscreteBraceletCompletionEligibility({ mode: 'fixed', usedLengthMm: 180, targetLengthMm, fixedComponentLengthMm: 6 }).eligible, true);
});

test('RED D: fixed 4mm reaches completion at 44 beads, not 43', () => {
  const targetLengthMm = 175;
  assert.equal(getDiscreteBraceletCompletionEligibility({ mode: 'fixed', usedLengthMm: 172, targetLengthMm, fixedComponentLengthMm: 4 }).eligible, false);
  assert.equal(getDiscreteBraceletCompletionEligibility({ mode: 'fixed', usedLengthMm: 176, targetLengthMm, fixedComponentLengthMm: 4 }).eligible, true);
});
