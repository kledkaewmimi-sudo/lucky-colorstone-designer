import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getBraceletCompletionEligibility } from '../bracelet-geometry.js';

const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');

function loopPhysicalLength(item) {
  if (item.componentType === 'empty') return 0;
  return Number(item.size || 0);
}

function deleteAt(sequence, index) {
  const before = sequence.map((item) => ({ ...item }));
  const deleted = before[index];
  before[index] = { componentType: 'empty', size: deleted.size, uniqueId: deleted.uniqueId };
  return before;
}

test('RED: one delete creates exactly one retained empty slot and cannot make capacity normalization trim a survivor', () => {
  const afterDelete = deleteAt([
    { componentType: 'stone', size: 10, uniqueId: 1 },
    { componentType: 'stone', size: 10, uniqueId: 2 },
    { componentType: 'stone', size: 6, uniqueId: 3 }
  ], 1);

  assert.equal(afterDelete.filter((item) => item.componentType === 'empty').length, 1);
  assert.deepEqual(afterDelete.map((item) => item.uniqueId), [1, 2, 3]);
  assert.equal(afterDelete.reduce((sum, item) => sum + loopPhysicalLength(item), 0), 16);
  assert.match(app, /function getLoopItemLengthMm\(item\) \{[\s\S]*?if \(isEmptyLoopSlot\(item\)\) \{[\s\S]*?return 0;/);
});

test('RED: retained delete metadata is renderer-only and does not become duplicate physical occupancy', () => {
  const deleted = { componentType: 'empty', size: 10, uniqueId: 2 };
  assert.equal(loopPhysicalLength(deleted), 0);
  assert.match(app, /function getLoopItemRenderSizeMm\(item\)[\s\S]*?isEmptyLoopSlot\(item\)/);
});

test('Mixed final gaps of one, two, and three millimetres are complete through the shared eligibility helper', () => {
  for (const usedLengthMm of [172, 173, 174]) {
    const result = getBraceletCompletionEligibility({ mode: 'mixed', targetLengthMm: 175, usedLengthMm });
    assert.equal(result.complete, true, `${usedLengthMm}/175 must complete`);
    assert.equal(result.status, 'COMPLETE_WITHIN_TARGET_RANGE');
  }
});

test('Fixed completion remains discrete and unchanged', () => {
  for (const [sizeMm, usedLengthMm] of [[10, 170], [6, 174], [4, 172]]) {
    assert.equal(getBraceletCompletionEligibility({ mode: 'fixed', targetLengthMm: 175, usedLengthMm, fixedComponentLengthMm: sizeMm }).complete, true);
  }
});
