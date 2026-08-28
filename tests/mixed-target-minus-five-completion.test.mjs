import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getBraceletCompletionEligibility, getNextComponentPlacementEligibility } from '../bracelet-geometry.js';

const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const WRIST_SIZES_CM = Array.from({ length: 13 }, (_, index) => 14 + index * 0.5);

test('RED: every configured Mixed wrist completes from manufacturing target minus five through target', () => {
  assert.match(app, /const WRIST_SIZES = Array\.from\(\{ length: 13 \}, \(_, i\) => 14\.0 \+ i \* 0\.5\)/);

  for (const wristSizeCm of WRIST_SIZES_CM) {
    const wristSizeMm = wristSizeCm * 10;
    const targetLengthMm = (wristSizeCm + 1.5) * 10;
    const lowerBoundMm = targetLengthMm - 5;
    for (const [usedLengthMm, status] of [
      [lowerBoundMm - 1, 'UNDER_TARGET_MINUS_5'],
      [lowerBoundMm, 'COMPLETE_WITHIN_TARGET_RANGE'],
      [lowerBoundMm + 1, 'COMPLETE_WITHIN_TARGET_RANGE'],
      [lowerBoundMm + 2, 'COMPLETE_WITHIN_TARGET_RANGE'],
      [lowerBoundMm + 3, 'COMPLETE_WITHIN_TARGET_RANGE'],
      [lowerBoundMm + 4, 'COMPLETE_WITHIN_TARGET_RANGE'],
      [targetLengthMm, 'COMPLETE_WITHIN_TARGET_RANGE'],
      [targetLengthMm + 1, 'OVERFLOW_INVALID']
    ]) {
      const result = getBraceletCompletionEligibility({ mode: 'mixed', wristSizeMm, targetLengthMm, usedLengthMm });
      assert.equal(result.status, status, `${wristSizeCm}cm / ${usedLengthMm}mm`);
    }
  }
});

test('RED: 16cm Mixed accepts 17x10mm at 170mm and uses target as the placement ceiling', () => {
  const targetLengthMm = 175;
  const completion = getBraceletCompletionEligibility({ mode: 'mixed', wristSizeMm: 160, targetLengthMm, usedLengthMm: 170 });
  assert.equal(completion.complete, true);
  assert.equal(completion.status, 'COMPLETE_WITHIN_TARGET_RANGE');
  assert.deepEqual(getBraceletCompletionEligibility({ mode: 'mixed', wristSizeMm: 160, targetLengthMm, usedLengthMm: 168 }).placeableSizes, [4, 6]);
  assert.equal(getNextComponentPlacementEligibility({ mode: 'mixed', wristSizeMm: 160, targetLengthMm, usedLengthMm: 170, componentLengthMm: 4 }).eligible, true);
  assert.equal(getNextComponentPlacementEligibility({ mode: 'mixed', wristSizeMm: 160, targetLengthMm, usedLengthMm: 170, componentLengthMm: 6 }).eligible, false);
  assert.equal(getNextComponentPlacementEligibility({ mode: 'mixed', wristSizeMm: 160, targetLengthMm, usedLengthMm: 170, componentLengthMm: 10 }).eligible, false);
});

test('Fixed pre-Mixed terminal capacity remains frozen', () => {
  for (const [sizeMm, usedLengthMm] of [[10, 170], [6, 174], [4, 172]]) {
    assert.equal(getBraceletCompletionEligibility({ mode: 'fixed', targetLengthMm: 175, usedLengthMm, fixedComponentLengthMm: sizeMm }).complete, true);
  }
});
