import assert from 'node:assert/strict';
import test from 'node:test';
import { createBraceletGeometry, getBraceletCompletionEligibility, getNextComponentPlacementEligibility } from '../bracelet-geometry.js';

const SUPPORTED_SIZES_MM = [4, 6, 10];

test('Mixed wrist baseline classifies under-wrist, complete interval, and overflow exactly', () => {
  const wristSizeMm = 160;
  const legacyBraceletLengthMm = 175;
  for (const [offset, status] of [[-10, 'UNDER_WRIST'], [-6, 'UNDER_WRIST'], [-4, 'UNDER_WRIST'], [-3, 'UNDER_WRIST'], [-1, 'UNDER_WRIST'], [0, 'COMPLETE_WITHIN_5MM'], [1, 'COMPLETE_WITHIN_5MM'], [3, 'COMPLETE_WITHIN_5MM'], [5, 'COMPLETE_WITHIN_5MM'], [6, 'OVERFLOW_INVALID']]) {
    const result = getBraceletCompletionEligibility({ mode: 'mixed', wristSizeMm, usedLengthMm: wristSizeMm + offset, targetLengthMm: legacyBraceletLengthMm });
    assert.equal(result.status, status, String(offset));
    assert.equal(result.complete, status === 'COMPLETE_WITHIN_5MM', String(offset));
  }
});

test('Mixed evaluates every supported physical size against selected wrist plus five', () => {
  const result = getBraceletCompletionEligibility({ mode: 'mixed', wristSizeMm: 160, usedLengthMm: 158, targetLengthMm: 175 });
  assert.deepEqual(result.placeableSizes, [4, 6]);
  assert.equal(result.complete, false);
  assert.equal(result.maxAllowedLengthMm, 165);
  assert.equal(result.remainingToTargetMm, 2);
  assert.equal(result.remainingToMaxAllowedMm, 7);
});

test('every selectable wrist/fixed-size pair reaches its pre-Mixed discrete terminal capacity', () => {
  const wristSizesCm = Array.from({ length: 13 }, (_, index) => 14 + index * 0.5);
  for (const wristSizeCm of wristSizesCm) {
    const targetLengthMm = (wristSizeCm + 1.5) * 10;
    for (const sizeMm of SUPPORTED_SIZES_MM) {
      const count = Math.floor(targetLengthMm / sizeMm);
      const usedLengthMm = count * sizeMm;
      const completion = getBraceletCompletionEligibility({ mode: 'fixed', usedLengthMm, targetLengthMm, fixedComponentLengthMm: sizeMm });
      assert.equal(completion.complete, true, `${wristSizeCm}/${sizeMm}`);
      assert.ok(usedLengthMm <= targetLengthMm, `${wristSizeCm}/${sizeMm} stays within fixed capacity`);
      assert.equal(getNextComponentPlacementEligibility({ mode: 'fixed', usedLengthMm, targetLengthMm, componentLengthMm: sizeMm }).eligible, false, `${wristSizeCm}/${sizeMm} next bead exceeds fixed capacity`);
    }
  }
});

test('accessory footprint is counted once in target +5 eligibility', () => {
  const geometry = createBraceletGeometry({
    targetLengthMm: 175,
    components: [{ type: 'charm', footprintMm: 24 }, { type: 'spacer', effectiveLengthMm: 9 }, { type: 'stone', size: 10 }, { type: 'stone', size: 10 }, { type: 'stone', size: 10 }, { type: 'stone', size: 10 }, { type: 'stone', size: 10 }, { type: 'stone', size: 10 }, { type: 'stone', size: 10 }, { type: 'stone', size: 10 }, { type: 'stone', size: 10 }, { type: 'stone', size: 10 }, { type: 'stone', size: 10 }, { type: 'stone', size: 10 }, { type: 'stone', size: 10 }, { type: 'stone', size: 10 }, { type: 'stone', size: 10 }]
  });
  assert.equal(geometry.usedLengthMm, 183);
  assert.equal(getBraceletCompletionEligibility({ mode: 'mixed', usedLengthMm: geometry.usedLengthMm, targetLengthMm: 175 }).status, 'OVERFLOW_INVALID');
});

test('delete and re-add cross the shared completion interval without relying on slot order', () => {
  const targetLengthMm = 175;
  assert.equal(getBraceletCompletionEligibility({ mode: 'mixed', usedLengthMm: 176, targetLengthMm }).complete, true);
  assert.equal(getBraceletCompletionEligibility({ mode: 'mixed', usedLengthMm: 172, targetLengthMm }).complete, false);
  assert.equal(getNextComponentPlacementEligibility({ usedLengthMm: 172, targetLengthMm, componentLengthMm: 4 }).eligible, true);
});
