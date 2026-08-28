import assert from 'node:assert/strict';
import test from 'node:test';
import { getDiscreteBraceletCompletionEligibility, getNextComponentPlacementEligibility } from '../bracelet-geometry.js';

test('RED: 16cm fixed 10mm reaches its discrete terminal capacity even though 17 beads are 5mm under 175mm', () => {
  const targetLengthMm = 175;
  const usedLengthMm = 170;
  const nextTenMm = getNextComponentPlacementEligibility({
    usedLengthMm,
    targetLengthMm,
    componentLengthMm: 10
  });

  assert.equal(nextTenMm.eligible, false, 'an 18th 10mm bead must not exceed fixed capacity');
  assert.equal(
    getDiscreteBraceletCompletionEligibility({
      mode: 'fixed',
      fixedComponentLengthMm: 10,
      usedLengthMm,
      targetLengthMm
    }).eligible,
    true,
    'the discrete fixed terminal layout must be allowed to continue'
  );
});

test('RED: mixed placement and completion must never reach a no-placeable/incomplete dead zone', () => {
  const supportedSizesMm = [4, 6, 10];
  const deadZones = [];

  for (let targetLengthMm = 155; targetLengthMm <= 215; targetLengthMm += 5) {
    for (let usedLengthMm = 0; usedLengthMm <= targetLengthMm; usedLengthMm += 2) {
      const complete = getDiscreteBraceletCompletionEligibility({
        mode: 'mixed',
        usedLengthMm,
        targetLengthMm
      }).eligible;
      const canPlaceAnySupportedStone = supportedSizesMm.some((componentLengthMm) =>
        getNextComponentPlacementEligibility({ usedLengthMm, targetLengthMm, componentLengthMm }).eligible
      );
      if (!complete && !canPlaceAnySupportedStone) deadZones.push({ targetLengthMm, usedLengthMm });
    }
  }

  assert.equal(deadZones.length, 0, `current dead zones include ${JSON.stringify(deadZones.slice(0, 5))}`);
});

test('mixed remaining-space boundaries are always complete or retain a supported placement', () => {
  const targetLengthMm = 175;
  for (const remainingLengthMm of Array.from({ length: 25 }, (_, index) => index * 0.5)) {
    const usedLengthMm = targetLengthMm - remainingLengthMm;
    const completion = getDiscreteBraceletCompletionEligibility({ mode: 'mixed', usedLengthMm, targetLengthMm });
    const canPlaceAnySupportedStone = [4, 6, 10].some((componentLengthMm) =>
      getNextComponentPlacementEligibility({ usedLengthMm, targetLengthMm, componentLengthMm }).eligible
    );
    assert.ok(completion.eligible || canPlaceAnySupportedStone, `remaining ${remainingLengthMm}mm`);
  }
});

test('mixed 4/6/10 sequences preserve the complete-or-placeable invariant', () => {
  const targetLengthMm = 175;
  const sequences = [[4], [6], [10], [4, 6], [4, 10], [6, 10], [4, 6, 10], [10, 10, 6, 4]];
  for (const sequence of sequences) {
    const usedLengthMm = sequence.reduce((sum, sizeMm) => sum + sizeMm, 0);
    const completion = getDiscreteBraceletCompletionEligibility({ mode: 'mixed', usedLengthMm, targetLengthMm });
    const canPlaceAnySupportedStone = [4, 6, 10].some((componentLengthMm) =>
      getNextComponentPlacementEligibility({ usedLengthMm, targetLengthMm, componentLengthMm }).eligible
    );
    assert.ok(completion.eligible || canPlaceAnySupportedStone, sequence.join('+'));
  }
});

test('every selectable wrist and fixed stone size reaches a discrete terminal capacity', () => {
  const wristSizesCm = Array.from({ length: 13 }, (_, index) => 14 + index * 0.5);
  for (const wristSizeCm of wristSizesCm) {
    const targetLengthMm = (wristSizeCm + 1.5) * 10;
    for (const fixedComponentLengthMm of [4, 6, 10]) {
      const usedLengthMm = Math.floor(targetLengthMm / fixedComponentLengthMm) * fixedComponentLengthMm;
      const completion = getDiscreteBraceletCompletionEligibility({
        mode: 'fixed', usedLengthMm, targetLengthMm, fixedComponentLengthMm
      });
      assert.equal(completion.eligible, true, `${wristSizeCm}cm/${fixedComponentLengthMm}mm`);
    }
  }
});

test('fixed delete and re-add return from terminal capacity to a placeable state and back', () => {
  const targetLengthMm = 175;
  const terminalUsedLengthMm = 170;
  const afterDeleteUsedLengthMm = terminalUsedLengthMm - 10;
  assert.equal(getDiscreteBraceletCompletionEligibility({
    mode: 'fixed', usedLengthMm: terminalUsedLengthMm, targetLengthMm, fixedComponentLengthMm: 10
  }).eligible, true);
  assert.equal(getNextComponentPlacementEligibility({
    usedLengthMm: afterDeleteUsedLengthMm, targetLengthMm, componentLengthMm: 10
  }).eligible, true);
  assert.equal(getDiscreteBraceletCompletionEligibility({
    mode: 'fixed', usedLengthMm: afterDeleteUsedLengthMm, targetLengthMm, fixedComponentLengthMm: 10
  }).eligible, false);
});
