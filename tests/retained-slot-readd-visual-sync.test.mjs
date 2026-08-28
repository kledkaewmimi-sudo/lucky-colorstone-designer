import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createBraceletGeometry } from '../bracelet-geometry.js';

const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');

function replaceRetainedSlot(sequence, index, size) {
  const slot = sequence[index];
  return sequence.toSpliced(index, 1, { componentType: 'stone', stoneId: 'replacement', size, uniqueId: slot.uniqueId });
}

test('delete-middle then re-add consumes the retained slot identity and leaves no empty node', () => {
  const deleted = [
    { componentType: 'stone', stoneId: 'a', size: 10, uniqueId: 1 },
    { componentType: 'empty', size: 10, uniqueId: 2 },
    { componentType: 'stone', stoneId: 'c', size: 6, uniqueId: 3 }
  ];
  for (const size of [4, 6, 10]) {
    const readded = replaceRetainedSlot(deleted, 1, size);
    assert.equal(readded.filter((item) => item.componentType === 'empty').length, 0);
    assert.deepEqual(readded.map((item) => item.uniqueId), [1, 2, 3]);
    assert.equal(createBraceletGeometry({ components: readded.map((item) => ({ type: item.componentType, sizeMm: item.size })), targetLengthMm: 175 }).usedLengthMm, 16 + size);
  }
  assert.match(app, /newBead\.uniqueId = State\.selectedStones\[State\.activeSlotIndex\]\?\.uniqueId \|\| newBead\.uniqueId/);
});

test('multiple retained slots are consumed in first-empty order before append', () => {
  const sequence = [
    { componentType: 'empty', size: 10, uniqueId: 1 },
    { componentType: 'stone', size: 6, uniqueId: 2 },
    { componentType: 'empty', size: 4, uniqueId: 3 }
  ];
  const first = replaceRetainedSlot(sequence, 0, 4);
  const second = replaceRetainedSlot(first, 2, 6);
  assert.deepEqual(first.map((item) => item.componentType), ['stone', 'stone', 'empty']);
  assert.deepEqual(second.map((item) => item.componentType), ['stone', 'stone', 'stone']);
  assert.match(app, /function getFirstEmptyLoopSlotIndex\(\)[\s\S]*?findIndex/);
});
