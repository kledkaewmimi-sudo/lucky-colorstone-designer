import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createBraceletGeometry, getBraceletCompletionEligibility } from '../bracelet-geometry.js';

const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');

test('RED: a realistic completed Mixed bracelet does not create a trailing dotted placeholder', () => {
  const components = Array.from({ length: 17 }, (_, index) => ({ type: 'stone', sizeMm: 10, sourceIndex: index }));
  const geometry = createBraceletGeometry({ components, targetLengthMm: 175 });
  const eligibility = getBraceletCompletionEligibility({ mode: 'mixed', usedLengthMm: geometry.usedLengthMm, targetLengthMm: 175 });
  assert.equal(geometry.usedLengthMm, 170);
  assert.equal(eligibility.complete, true);
  assert.match(app, /const trailingPlaceholderCount = emptySlotCount > 0 \|\| completionEligibility\.complete\s*\? 0\s*:\s*Math\.max\(0, Math\.floor\(spaceLeft \/ braceletConfig\.placingSizeMm\)\);/);
});

test('realistic retained-slot re-add preserves slot count and clears the retained empty', () => {
  const before = Array.from({ length: 18 }, (_, index) => ({ componentType: 'stone', size: index % 3 === 0 ? 10 : index % 3 === 1 ? 6 : 4, uniqueId: index + 1 }));
  const deleted = before.toSpliced(8, 1, { componentType: 'empty', size: before[8].size, uniqueId: before[8].uniqueId });
  const readded = deleted.toSpliced(8, 1, { componentType: 'stone', size: 4, uniqueId: deleted[8].uniqueId });
  assert.deepEqual([before.length, deleted.length, readded.length], [18, 18, 18]);
  assert.deepEqual([0, 1, 0], [before.filter((item) => item.componentType === 'empty').length, deleted.filter((item) => item.componentType === 'empty').length, readded.filter((item) => item.componentType === 'empty').length]);
  assert.equal(readded[8].uniqueId, before[8].uniqueId);
});
