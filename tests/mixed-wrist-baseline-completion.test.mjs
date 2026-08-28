import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getBraceletCompletionEligibility, getNextComponentPlacementEligibility } from '../bracelet-geometry.js';

const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const WRIST_SIZES_CM = Array.from({ length: 13 }, (_, index) => 14 + index * 0.5);

test('RED: every configured Mixed wrist uses selected wrist millimetres rather than wrist plus 1.5cm', () => {
  assert.match(app, /const WRIST_SIZES = Array\.from\(\{ length: 13 \}, \(_, i\) => 14\.0 \+ i \* 0\.5\)/);

  for (const wristSizeCm of WRIST_SIZES_CM) {
    const wristSizeMm = wristSizeCm * 10;
    const legacyBraceletLengthMm = wristSizeMm + 15;
    for (const [offset, status] of [[-1, 'UNDER_WRIST'], [0, 'COMPLETE_WITHIN_5MM'], [1, 'COMPLETE_WITHIN_5MM'], [2, 'COMPLETE_WITHIN_5MM'], [3, 'COMPLETE_WITHIN_5MM'], [4, 'COMPLETE_WITHIN_5MM'], [5, 'COMPLETE_WITHIN_5MM'], [6, 'OVERFLOW_INVALID']]) {
      const result = getBraceletCompletionEligibility({
        mode: 'mixed',
        wristSizeMm,
        targetLengthMm: legacyBraceletLengthMm,
        usedLengthMm: wristSizeMm + offset
      });
      assert.equal(result.status, status, `${wristSizeCm}cm / ${offset}mm`);
    }
  }
});

test('RED: Mixed placement evaluates supported sizes against wrist plus five, not legacy bracelet length', () => {
  const result = getBraceletCompletionEligibility({
    mode: 'mixed',
    wristSizeMm: 160,
    targetLengthMm: 175,
    usedLengthMm: 158
  });
  assert.deepEqual(result.placeableSizes, [4, 6]);
  assert.equal(getNextComponentPlacementEligibility({
    mode: 'mixed',
    wristSizeMm: 160,
    targetLengthMm: 175,
    usedLengthMm: 158,
    componentLengthMm: 10
  }).eligible, false);
});

test('16cm Mixed rejects 17x10mm because 170mm exceeds the 165mm maximum', () => {
  const result = getBraceletCompletionEligibility({
    mode: 'mixed',
    wristSizeMm: 160,
    targetLengthMm: 175,
    usedLengthMm: 170
  });
  assert.equal(result.status, 'OVERFLOW_INVALID');
  assert.equal(result.complete, false);
});

test('Fixed eligibility remains independent of the Mixed wrist baseline', () => {
  assert.equal(getBraceletCompletionEligibility({
    mode: 'fixed',
    wristSizeMm: 160,
    targetLengthMm: 175,
    usedLengthMm: 170,
    fixedComponentLengthMm: 10
  }).complete, true);
});
