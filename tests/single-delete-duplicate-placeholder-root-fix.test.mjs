import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getBraceletCompletionEligibility } from '../bracelet-geometry.js';

const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');

function resolvePlaceholderCounts({ mode, placingSizeMm, targetLengthMm, sequence }) {
  const occupied = sequence.filter((item) => item.type !== 'empty');
  const emptySlotCount = sequence.length - occupied.length;
  const usedLengthMm = occupied.reduce((sum, item) => sum + item.sizeMm, 0);
  const completion = getBraceletCompletionEligibility({
    mode,
    usedLengthMm,
    targetLengthMm,
    fixedComponentLengthMm: mode === 'fixed' ? placingSizeMm : 0,
    supportedComponentLengthsMm: [4, 6, 10]
  });
  const trailingPlaceholderCount = emptySlotCount > 0 || completion.complete
    ? 0
    : Math.max(0, Math.floor((targetLengthMm - usedLengthMm) / placingSizeMm));
  return {
    canonicalEmpty: emptySlotCount,
    resolvedPlaceholders: emptySlotCount + trailingPlaceholderCount,
    retainedEmpty: emptySlotCount,
    trailingPlaceholderCount,
    completion
  };
}

function completedFixedSequence() {
  return Array.from({ length: 17 }, (_, index) => ({ type: 'stone', sizeMm: 10, uniqueId: index + 1 }));
}

test('proven root cause: retained deletion slots suppress duplicate trailing capacity placeholders', () => {
  assert.match(app, /const trailingPlaceholderCount = emptySlotCount > 0 \|\| completionEligibility\.complete/);
  assert.match(app, /isRetainedSlot: true/);
  assert.match(app, /isTrailingCapacityPlaceholder: true/);

  const initial = completedFixedSequence();
  const afterDelete = initial.toSpliced(9, 1, { type: 'empty', sizeMm: 10, uniqueId: initial[9].uniqueId });
  const result = resolvePlaceholderCounts({ mode: 'fixed', placingSizeMm: 10, targetLengthMm: 175, sequence: afterDelete });
  assert.deepEqual(result, {
    canonicalEmpty: 1,
    resolvedPlaceholders: 1,
    retainedEmpty: 1,
    trailingPlaceholderCount: 0,
    completion: result.completion
  });
  assert.equal(result.completion.complete, false);
});

test('fixed two deletes fill retained positions before any trailing capacity target exists', () => {
  const initial = completedFixedSequence();
  const deletedTwice = initial
    .toSpliced(3, 1, { type: 'empty', sizeMm: 10, uniqueId: initial[3].uniqueId })
    .toSpliced(12, 1, { type: 'empty', sizeMm: 10, uniqueId: initial[12].uniqueId });
  const afterOneReadd = deletedTwice.toSpliced(3, 1, { type: 'stone', sizeMm: 10, uniqueId: initial[3].uniqueId });
  const afterTwoReadds = afterOneReadd.toSpliced(12, 1, { type: 'stone', sizeMm: 10, uniqueId: initial[12].uniqueId });

  for (const [sequence, expectedEmpty] of [[deletedTwice, 2], [afterOneReadd, 1], [afterTwoReadds, 0]]) {
    const result = resolvePlaceholderCounts({ mode: 'fixed', placingSizeMm: 10, targetLengthMm: 175, sequence });
    assert.equal(result.canonicalEmpty, expectedEmpty);
    assert.equal(result.retainedEmpty, expectedEmpty);
    assert.equal(result.trailingPlaceholderCount, 0);
    assert.equal(result.resolvedPlaceholders, expectedEmpty);
  }
  assert.deepEqual(afterTwoReadds.map((item) => item.uniqueId), initial.map((item) => item.uniqueId));
});

test('Mixed 4/6/10 retained slots suppress capacity placeholders until re-add', () => {
  const sizes = [...Array(13).fill(10), ...Array(6).fill(6), 4];
  const initial = sizes.map((sizeMm, index) => ({ type: 'stone', sizeMm, uniqueId: index + 1 }));
  assert.equal(initial.reduce((sum, item) => sum + item.sizeMm, 0), 170);
  const deleted = initial.toSpliced(8, 1, { type: 'empty', sizeMm: initial[8].sizeMm, uniqueId: initial[8].uniqueId });
  const afterDelete = resolvePlaceholderCounts({ mode: 'mixed', placingSizeMm: 10, targetLengthMm: 175, sequence: deleted });
  assert.equal(afterDelete.canonicalEmpty, 1);
  assert.equal(afterDelete.retainedEmpty, 1);
  assert.equal(afterDelete.trailingPlaceholderCount, 0);
  assert.equal(afterDelete.resolvedPlaceholders, 1);

  const readded = deleted.toSpliced(8, 1, { type: 'stone', sizeMm: 10, uniqueId: initial[8].uniqueId });
  const afterReadd = resolvePlaceholderCounts({ mode: 'mixed', placingSizeMm: 10, targetLengthMm: 175, sequence: readded });
  assert.equal(afterReadd.canonicalEmpty, 0);
  assert.equal(afterReadd.resolvedPlaceholders, 0);
  assert.equal(afterReadd.completion.complete, true);
});
