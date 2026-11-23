import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createBraceletGeometry, getBraceletCompletionEligibility, getComponentPhysicalLengthMm } from '../bracelet-geometry.js';

const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const wrists = Array.from({ length: 13 }, (_, index) => 14 + index * 0.5);

test('Mixed completion is target minus five through target for every configured wrist size', () => {
  assert.match(app, /const WRIST_SIZES = Array\.from\(\{ length: 13 \}, \(_, i\) => 14\.0 \+ i \* 0\.5\)/);
  for (const wrist of wrists) {
    const target = (wrist + 1.5) * 10;
    for (const [used, status] of [[target - 6, 'UNDER_TARGET_MINUS_5'], [target - 5, 'COMPLETE_WITHIN_TARGET_RANGE'], [target, 'COMPLETE_WITHIN_TARGET_RANGE'], [target + 1, 'OVERFLOW_INVALID']]) {
      assert.equal(getBraceletCompletionEligibility({ mode: 'mixed', usedLengthMm: used, targetLengthMm: target }).status, status, `${wrist}cm / ${used}mm`);
    }
  }
});

test('retained deletion slots preserve sequence only; their replacement uses the new physical size', () => {
  const afterDelete = [{ type: 'stone', sizeMm: 10 }, { type: 'empty', sizeMm: 10 }, { type: 'stone', sizeMm: 6 }];
  const afterReplacement = [{ type: 'stone', sizeMm: 10 }, { type: 'stone', sizeMm: 4 }, { type: 'stone', sizeMm: 6 }];
  assert.equal(getComponentPhysicalLengthMm(afterDelete[1]), 0);
  assert.equal(createBraceletGeometry({ components: afterDelete, targetLengthMm: 175 }).usedLengthMm, 16);
  assert.equal(createBraceletGeometry({ components: afterReplacement, targetLengthMm: 175 }).usedLengthMm, 20);
  assert.match(app, /State\.selectedStones\[State\.activeSlotIndex\] = newBead/);
  assert.match(app, /sourceIndex: component\.sourceIndex,[\s\S]*?isRetainedSlot: true/);
});

test('Step 3 and Step 4 consume the same completion result while placeholder geometry remains dotted', () => {
  assert.match(app, /function getResolvedLayoutFitEligibility\(resolvedLayout\)/);
  assert.match(app, /function getCurrentCheckoutFitEligibility\(\)\s*\{\s*return getResolvedLayoutFitEligibility/);
  assert.match(app, /const isFull = fitEligibility\.eligible/);
  assert.match(app, /const fitEligibility = getCurrentCheckoutFitEligibility\(\)/);
  assert.match(app, /slot\.setAttribute\("stroke-dasharray", isFirstPlaceholder \? "4 2" : "3 3"\)/);
  assert.doesNotMatch(app, /isPhysicallyUnderfilled|physicalPreviewSpan|renderedTrailingPlaceholderCount/);
});
