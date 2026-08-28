import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getBraceletCompletionEligibility, getNextComponentPlacementEligibility } from '../bracelet-geometry.js';

const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const WRIST_SIZES_CM = Array.from({ length: 13 }, (_, index) => 14 + index * 0.5);

test('every configured Mixed wrist uses manufacturing target minus five through target', () => {
  assert.match(app, /const WRIST_SIZES = Array\.from\(\{ length: 13 \}, \(_, i\) => 14\.0 \+ i \* 0\.5\)/);

  for (const wristSizeCm of WRIST_SIZES_CM) {
    const targetLengthMm = (wristSizeCm + 1.5) * 10;
    const lowerBoundMm = targetLengthMm - 5;
    for (const [offset, status] of [[-1, 'UNDER_TARGET_MINUS_5'], [0, 'COMPLETE_WITHIN_TARGET_RANGE'], [1, 'COMPLETE_WITHIN_TARGET_RANGE'], [2, 'COMPLETE_WITHIN_TARGET_RANGE'], [3, 'COMPLETE_WITHIN_TARGET_RANGE'], [4, 'COMPLETE_WITHIN_TARGET_RANGE'], [5, 'COMPLETE_WITHIN_TARGET_RANGE'], [6, 'OVERFLOW_INVALID']]) {
      const result = getBraceletCompletionEligibility({
        mode: 'mixed',
        targetLengthMm,
        usedLengthMm: lowerBoundMm + offset
      });
      assert.equal(result.status, status, `${wristSizeCm}cm / ${offset}mm`);
    }
  }
});

test('Mixed placement evaluates supported sizes against manufacturing target', () => {
  const result = getBraceletCompletionEligibility({
    mode: 'mixed',
    targetLengthMm: 175,
    usedLengthMm: 168
  });
  assert.deepEqual(result.placeableSizes, [4, 6]);
  assert.equal(getNextComponentPlacementEligibility({
    mode: 'mixed',
    targetLengthMm: 175,
    usedLengthMm: 168,
    componentLengthMm: 10
  }).eligible, false);
});

test('16cm Mixed accepts 17x10mm at the lower completion boundary', () => {
  const result = getBraceletCompletionEligibility({
    mode: 'mixed',
    targetLengthMm: 175,
    usedLengthMm: 170
  });
  assert.equal(result.status, 'COMPLETE_WITHIN_TARGET_RANGE');
  assert.equal(result.complete, true);
});

test('Fixed eligibility remains independent of the Mixed completion range', () => {
  assert.equal(getBraceletCompletionEligibility({
    mode: 'fixed',
    targetLengthMm: 175,
    usedLengthMm: 170,
    fixedComponentLengthMm: 10
  }).complete, true);
});
