import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createBraceletGeometry, getBraceletCompletionEligibility, getComponentPhysicalLengthMm } from '../bracelet-geometry.js';

const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');

test('RED: pre-Mixed fixed capacity completes at the last whole fixed bead below target', () => {
  for (const [sizeMm, usedLengthMm] of [[10, 170], [6, 174], [4, 172]]) {
    const eligibility = getBraceletCompletionEligibility({
      mode: 'fixed',
      fixedComponentLengthMm: sizeMm,
      usedLengthMm,
      targetLengthMm: 175
    });
    assert.equal(eligibility.complete, true, `${sizeMm}mm / ${usedLengthMm}mm`);
  }
});

test('RED: a retained empty slot keeps its position but contributes no deleted physical footprint', () => {
  const original = [
    { type: 'stone', sizeMm: 10 },
    { type: 'stone', sizeMm: 10 },
    { type: 'stone', sizeMm: 6 }
  ];
  const afterDelete = [original[0], { type: 'empty', sizeMm: 10 }, original[2]];
  const afterReplacement = [original[0], { type: 'stone', sizeMm: 4 }, original[2]];

  assert.equal(createBraceletGeometry({ components: afterDelete, targetLengthMm: 175 }).usedLengthMm, 16);
  assert.equal(createBraceletGeometry({ components: afterReplacement, targetLengthMm: 175 }).usedLengthMm, 20);
  assert.equal(getComponentPhysicalLengthMm(afterDelete[1]), 0);
  assert.match(app, /State\.selectedStones\[State\.activeSlotIndex\] = newBead/);
  assert.match(app, /sourceIndex: component\.sourceIndex,[\s\S]*?isRetainedSlot: true/);
});

test('Mixed retained-slot replacements use the new component footprint without sequence reflow', () => {
  const replaceAt = (sizes, removedIndex, replacementSizeMm) => {
    const sequence = sizes.map((sizeMm, index) => ({ type: 'stone', sizeMm, sourceIndex: index }));
    const retained = { type: 'empty', sizeMm: sequence[removedIndex].sizeMm, sourceIndex: removedIndex };
    const afterDelete = sequence.toSpliced(removedIndex, 1, retained);
    const afterReplacement = afterDelete.toSpliced(removedIndex, 1, {
      type: 'stone', sizeMm: replacementSizeMm, sourceIndex: removedIndex
    });
    return { afterDelete, afterReplacement };
  };

  for (const { sizes, removedIndex, replacementSizeMm, expectedUsedLengthMm } of [
    { sizes: [10, 10, 6], removedIndex: 1, replacementSizeMm: 4, expectedUsedLengthMm: 20 },
    { sizes: [10, 10, 6], removedIndex: 1, replacementSizeMm: 6, expectedUsedLengthMm: 22 },
    { sizes: [10, 10, 6], removedIndex: 1, replacementSizeMm: 10, expectedUsedLengthMm: 26 },
    { sizes: [10, 6, 10], removedIndex: 1, replacementSizeMm: 4, expectedUsedLengthMm: 24 },
    { sizes: [10, 4, 6], removedIndex: 1, replacementSizeMm: 10, expectedUsedLengthMm: 26 }
  ]) {
    const { afterDelete, afterReplacement } = replaceAt(sizes, removedIndex, replacementSizeMm);
    assert.equal(getComponentPhysicalLengthMm(afterDelete[removedIndex]), 0, `${sizes.join(',')} delete ${removedIndex}`);
    assert.equal(createBraceletGeometry({ components: afterReplacement, targetLengthMm: 175 }).usedLengthMm, expectedUsedLengthMm);
    assert.equal(afterReplacement[removedIndex].sizeMm, replacementSizeMm);
    assert.deepEqual(afterReplacement.map((item) => item.sourceIndex), sizes.map((_, index) => index));
    assert.deepEqual(afterReplacement.filter((_, index) => index !== removedIndex).map((item) => item.sizeMm), sizes.filter((_, index) => index !== removedIndex));
  }
});

test('Mixed target-minus-five through target remains the completion and placement contract', () => {
  const eligibility = getBraceletCompletionEligibility({ mode: 'mixed', usedLengthMm: 172, targetLengthMm: 175 });
  assert.equal(eligibility.complete, true);
  assert.deepEqual(eligibility.placeableSizes, []);
});
