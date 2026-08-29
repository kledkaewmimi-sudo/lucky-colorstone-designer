import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');

function visualLayout(targetLengthMm, placingSizeMm, sequence) {
  const visualUsedLengthMm = sequence.reduce((sum, item) => sum + item.sizeMm, 0);
  const trailingCount = Math.max(0, Math.floor((targetLengthMm - visualUsedLengthMm) / placingSizeMm));
  const sizes = [...sequence.map((item) => item.sizeMm), ...Array(trailingCount).fill(placingSizeMm)];
  const circumferenceMm = sizes.reduce((sum, sizeMm) => sum + sizeMm, 0);
  let cursor = -Math.PI / 2;
  const nodes = sizes.map((sizeMm) => {
    const angleWidth = sizeMm / circumferenceMm * 2 * Math.PI;
    const angle = cursor + angleWidth / 2;
    cursor += angleWidth;
    return { sizeMm, angleWidth, angle };
  });
  return { visualUsedLengthMm, trailingCount, circumferenceMm, nodes };
}

function assertPartialDeleteStable(name, placingSizeMm, sequence, deletedIndex) {
  const before = visualLayout(175, placingSizeMm, sequence);
  const deleted = sequence.toSpliced(deletedIndex, 1, { type: 'empty', sizeMm: sequence[deletedIndex].sizeMm, uniqueId: sequence[deletedIndex].uniqueId });
  const after = visualLayout(175, placingSizeMm, deleted);
  assert.equal(deleted.filter((item) => item.type === 'empty').length, 1, `${name}: one retained slot`);
  assert.equal(after.visualUsedLengthMm, before.visualUsedLengthMm, `${name}: visual footprint`);
  assert.equal(after.circumferenceMm, before.circumferenceMm, `${name}: design loop`);
  assert.equal(after.trailingCount, before.trailingCount, `${name}: capacity placeholders`);
  sequence.forEach((item, index) => {
    if (index === deletedIndex) return;
    assert.equal(deleted[index].uniqueId, item.uniqueId, `${name}: source identity ${index}`);
    assert.equal(after.nodes[index].sizeMm, before.nodes[index].sizeMm, `${name}: visual size ${index}`);
    assert.ok(Math.abs(after.nodes[index].angle - before.nodes[index].angle) < 1e-12, `${name}: angle ${index}`);
  });
  const readded = deleted.toSpliced(deletedIndex, 1, sequence[deletedIndex]);
  assert.deepEqual(readded.map((item) => item.uniqueId), sequence.map((item) => item.uniqueId), `${name}: retained re-add`);
}

test('production uses the UAT-approved visual capacity basis while physical completion remains separate', () => {
  assert.match(app, /Physical completion deliberately excludes retained empty slots/);
  assert.match(app, /const visualUsedLengthMm = loopComponents\.reduce/);
  assert.match(app, /const visualSpaceLeftMm = Math\.max\(0, braceletConfig\.braceletLengthMm - visualUsedLengthMm\)/);
  assert.match(app, /usedLengthMm: capacityMetrics\.totalUsedLengthMm/);
});

test('partial Fixed 10mm, 6mm, and 4mm delete preserve unaffected geometry', () => {
  assertPartialDeleteStable('10mm', 10, Array.from({ length: 8 }, (_, index) => ({ type: 'stone', sizeMm: 10, uniqueId: index + 1 })), 4);
  assertPartialDeleteStable('6mm', 6, Array.from({ length: 12 }, (_, index) => ({ type: 'stone', sizeMm: 6, uniqueId: index + 1 })), 6);
  assertPartialDeleteStable('4mm', 4, Array.from({ length: 15 }, (_, index) => ({ type: 'stone', sizeMm: 4, uniqueId: index + 1 })), 7);
});

test('partial Mixed 10mm, 6mm, and 4mm delete preserve unaffected geometry and re-add identity', () => {
  const sequence = [4, 10, 6, 4, 10, 6, 4, 10].map((sizeMm, index) => ({ type: 'stone', sizeMm, uniqueId: index + 1 }));
  for (const deletedIndex of [1, 2, 3]) assertPartialDeleteStable(`mixed-${sequence[deletedIndex].sizeMm}mm`, 6, sequence, deletedIndex);
});

test('completed 17x10mm delete keeps one retained visual gap with no trailing capacity placeholder', () => {
  const sequence = Array.from({ length: 17 }, (_, index) => ({ type: 'stone', sizeMm: 10, uniqueId: index + 1 }));
  const deleted = sequence.toSpliced(8, 1, { type: 'empty', sizeMm: 10, uniqueId: sequence[8].uniqueId });
  const layout = visualLayout(175, 10, deleted);
  assert.equal(layout.circumferenceMm, 170);
  assert.equal(layout.trailingCount, 0);
});
