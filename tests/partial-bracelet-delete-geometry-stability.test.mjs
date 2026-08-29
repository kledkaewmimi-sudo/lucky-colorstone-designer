import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');

function createVisualLoop({ targetLengthMm, placingSizeMm, sequence, complete = false }) {
  const visualUsedLengthMm = sequence.reduce((sum, item) => sum + item.sizeMm, 0);
  const trailingCount = complete ? 0 : Math.max(0, Math.floor((targetLengthMm - visualUsedLengthMm) / placingSizeMm));
  const sizes = [...sequence.map((item) => item.sizeMm), ...Array(trailingCount).fill(placingSizeMm)];
  const circumferenceMm = sizes.reduce((sum, sizeMm) => sum + sizeMm, 0);
  let accumulatedAngle = -Math.PI / 2;
  const nodes = sizes.map((sizeMm, index) => {
    const angleWidth = (sizeMm / circumferenceMm) * 2 * Math.PI;
    const angle = accumulatedAngle + angleWidth / 2;
    accumulatedAngle += angleWidth;
    return { index, sizeMm, angleWidth, angle };
  });
  return { visualUsedLengthMm, trailingCount, circumferenceMm, nodes };
}

function deleteAt(sequence, index) {
  const deleted = sequence[index];
  return sequence.toSpliced(index, 1, { type: 'empty', sizeMm: deleted.sizeMm, uniqueId: deleted.uniqueId });
}

function assertPartialDeleteStable({ name, placingSizeMm, sequence, deletedIndex }) {
  const before = createVisualLoop({ targetLengthMm: 175, placingSizeMm, sequence });
  const afterSequence = deleteAt(sequence, deletedIndex);
  const after = createVisualLoop({ targetLengthMm: 175, placingSizeMm, sequence: afterSequence });

  assert.equal(afterSequence.filter((item) => item.type === 'empty').length, 1, `${name}: exactly one retained slot`);
  assert.equal(after.visualUsedLengthMm, before.visualUsedLengthMm, `${name}: retained slot keeps visual footprint`);
  assert.equal(after.circumferenceMm, before.circumferenceMm, `${name}: wrist design-loop circumference is stable`);
  assert.equal(after.trailingCount, before.trailingCount, `${name}: available capacity does not change after deletion`);

  sequence.forEach((item, index) => {
    if (index === deletedIndex) return;
    assert.equal(afterSequence[index].uniqueId, item.uniqueId, `${name}: source identity ${index} is stable`);
    assert.equal(after.nodes[index].sizeMm, before.nodes[index].sizeMm, `${name}: visual size ${index} is stable`);
    assert.ok(Math.abs(after.nodes[index].angle - before.nodes[index].angle) < 1e-12, `${name}: angle ${index} is stable`);
    assert.ok(Math.abs(after.nodes[index].angleWidth - before.nodes[index].angleWidth) < 1e-12, `${name}: angular width ${index} is stable`);
  });

  const readded = afterSequence.toSpliced(deletedIndex, 1, sequence[deletedIndex]);
  const readdedLayout = createVisualLoop({ targetLengthMm: 175, placingSizeMm, sequence: readded });
  assert.deepEqual(readded.map((item) => item.uniqueId), sequence.map((item) => item.uniqueId), `${name}: re-add consumes retained identity`);
  assert.equal(readdedLayout.circumferenceMm, before.circumferenceMm, `${name}: re-add does not reflow the loop`);
}

test('partial delete keeps wrist-derived visual capacity separate from physical completion length', () => {
  assert.match(app, /Physical completion deliberately excludes retained empty slots/);
  assert.match(app, /const visualUsedLengthMm = loopComponents\.reduce/);
  assert.match(app, /Math\.floor\(visualSpaceLeftMm \/ braceletConfig\.placingSizeMm\)/);
  assert.match(app, /usedLengthMm: capacityMetrics\.totalUsedLengthMm/);
});

test('partial Fixed 10mm, 6mm, and 4mm deletes preserve every unaffected placement', () => {
  assertPartialDeleteStable({
    name: '10mm', placingSizeMm: 10,
    sequence: Array.from({ length: 8 }, (_, index) => ({ type: 'stone', sizeMm: 10, uniqueId: index + 1 })), deletedIndex: 4
  });
  assertPartialDeleteStable({
    name: '6mm', placingSizeMm: 6,
    sequence: Array.from({ length: 12 }, (_, index) => ({ type: 'stone', sizeMm: 6, uniqueId: index + 1 })), deletedIndex: 6
  });
  assertPartialDeleteStable({
    name: '4mm', placingSizeMm: 4,
    sequence: Array.from({ length: 15 }, (_, index) => ({ type: 'stone', sizeMm: 4, uniqueId: index + 1 })), deletedIndex: 7
  });
});

test('partial Mixed deletes preserve 10mm, 6mm, and 4mm positions and re-add consumes each retained slot', () => {
  const sequence = [4, 10, 6, 4, 10, 6, 4, 10].map((sizeMm, index) => ({ type: 'stone', sizeMm, uniqueId: index + 1 }));
  for (const deletedIndex of [1, 2, 3]) {
    assertPartialDeleteStable({ name: `mixed-${sequence[deletedIndex].sizeMm}mm`, placingSizeMm: 6, sequence, deletedIndex });
  }
});

test('a completed 17x10mm delete retains one slot with no trailing capacity placeholder', () => {
  const sequence = Array.from({ length: 17 }, (_, index) => ({ type: 'stone', sizeMm: 10, uniqueId: index + 1 }));
  const after = createVisualLoop({ targetLengthMm: 175, placingSizeMm: 10, sequence: deleteAt(sequence, 8), complete: false });
  assert.equal(after.circumferenceMm, 170);
  assert.equal(after.trailingCount, 0);
});
