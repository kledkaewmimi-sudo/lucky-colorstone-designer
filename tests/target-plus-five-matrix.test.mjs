import assert from 'node:assert/strict';
import test from 'node:test';
import { createBraceletGeometry, getBraceletCompletionEligibility, getNextComponentPlacementEligibility, MAX_OVER_TARGET_MM } from '../bracelet-geometry.js';

const SUPPORTED_SIZES_MM = [4, 6, 10];

test('target +5 boundary classifies under-target, complete interval, and overflow exactly', () => {
  const targetLengthMm = 175;
  for (const [offset, status] of [[-10, 'UNDER_TARGET'], [-6, 'UNDER_TARGET'], [-4, 'UNDER_TARGET'], [-3, 'UNDER_TARGET'], [-1, 'UNDER_TARGET'], [0, 'COMPLETE_WITHIN_OVERRUN'], [1, 'COMPLETE_WITHIN_OVERRUN'], [3, 'COMPLETE_WITHIN_OVERRUN'], [5, 'COMPLETE_WITHIN_OVERRUN'], [6, 'OVERFLOW_INVALID']]) {
    const result = getBraceletCompletionEligibility({ mode: 'mixed', usedLengthMm: targetLengthMm + offset, targetLengthMm });
    assert.equal(result.status, status, String(offset));
    assert.equal(result.complete, status === 'COMPLETE_WITHIN_OVERRUN', String(offset));
  }
});

test('Mixed evaluates every supported physical size against target +5', () => {
  const result = getBraceletCompletionEligibility({ mode: 'mixed', usedLengthMm: 172, targetLengthMm: 175 });
  assert.deepEqual(result.placeableSizes, [4, 6]);
  assert.equal(result.complete, false);
  assert.equal(result.maxAllowedLengthMm, 180);
  assert.equal(result.remainingToTargetMm, 3);
  assert.equal(result.remainingToMaxAllowedMm, 8);
});

test('every selectable wrist/fixed-size pair reaches target through target +5 and rejects the next overrun', () => {
  const wristSizesCm = Array.from({ length: 13 }, (_, index) => 14 + index * 0.5);
  for (const wristSizeCm of wristSizesCm) {
    const targetLengthMm = (wristSizeCm + 1.5) * 10;
    for (const sizeMm of SUPPORTED_SIZES_MM) {
      const count = Math.ceil(targetLengthMm / sizeMm);
      const usedLengthMm = count * sizeMm;
      const terminalUsedLengthMm = Math.floor((targetLengthMm + MAX_OVER_TARGET_MM) / sizeMm) * sizeMm;
      const completion = getBraceletCompletionEligibility({ mode: 'fixed', usedLengthMm, targetLengthMm, fixedComponentLengthMm: sizeMm });
      assert.equal(completion.complete, true, `${wristSizeCm}/${sizeMm}`);
      assert.ok(usedLengthMm <= targetLengthMm + MAX_OVER_TARGET_MM, `${wristSizeCm}/${sizeMm} reaches interval`);
      assert.equal(getNextComponentPlacementEligibility({ usedLengthMm: terminalUsedLengthMm, targetLengthMm, componentLengthMm: sizeMm }).eligible, false, `${wristSizeCm}/${sizeMm} next bead exceeds max`);
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
