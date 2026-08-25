import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createBraceletGeometry,
  getComponentPhysicalLengthMm,
  getFitStatus,
  getTotalUsedLengthMm
} from '../bracelet-geometry.js';
import { transitionBraceletSizeMode } from '../mixed-size-state.js';

const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const stone = (sizeMm, id = `stone-${sizeMm}`) => ({ type: 'stone', id, sizeMm });
const mixedSequence = [stone(4, 'four'), stone(6, 'six'), stone(10, 'ten')];
const catalog = [{ id: 'four', sizes: [4, 6, 10] }, { id: 'six', sizes: [4, 6, 10] }];

for (const sizeMm of [4, 6, 10]) {
  test(`fixed ${sizeMm}mm geometry remains physical`, () => {
    assert.equal(getTotalUsedLengthMm([stone(sizeMm), stone(sizeMm)]), sizeMm * 2);
  });
}

test('mixed 4/6/10 used length is the physical sum', () => {
  assert.equal(getTotalUsedLengthMm(mixedSequence), 20);
});

test('mixed repeated stone sizes calculate independently', () => {
  assert.equal(getTotalUsedLengthMm([stone(4), stone(10), stone(4), stone(6)]), 24);
});

test('a mixed stone uses its own component size rather than placing size', () => {
  const placedAtFour = { type: 'stone', sizeMm: 4, mixedPlacingSize: 10 };
  assert.equal(getComponentPhysicalLengthMm(placedAtFour), 4);
});

test('catalog filter changes cannot affect placed component geometry', () => {
  const before = structuredClone(mixedSequence);
  const initialLength = getTotalUsedLengthMm(mixedSequence);
  const afterFilterChange = { filter: '10', components: mixedSequence };
  assert.equal(getTotalUsedLengthMm(afterFilterChange.components), initialLength);
  assert.deepEqual(mixedSequence, before);
});

test('spacer effective length and charm footprint are included', () => {
  const components = [stone(4), { type: 'spacer', effectiveLengthMm: 1 }, { type: 'charm', footprintMm: 9 }];
  assert.equal(getTotalUsedLengthMm(components), 14);
});

test('add and remove recalculate component length without reordering survivors', () => {
  const components = [stone(4, 'a'), stone(6, 'b')];
  components.push(stone(10, 'c'));
  assert.equal(getTotalUsedLengthMm(components), 20);
  components.splice(1, 1);
  assert.equal(getTotalUsedLengthMm(components), 14);
  assert.deepEqual(components.map((component) => component.id), ['a', 'c']);
});

test('fixed to mixed preserves geometry and valid mixed to fixed recalculates target sizes', () => {
  const state = {
    beadSize: '6',
    mixedPlacingSize: 6,
    selectedStones: [
      { componentType: 'stone', stoneId: 'four', size: 6 },
      { componentType: 'stone', stoneId: 'six', size: 6 }
    ]
  };
  const initialLength = getTotalUsedLengthMm(state.selectedStones.map((item) => ({ type: 'stone', sizeMm: item.size })));
  const mixed = transitionBraceletSizeMode(state, 'mixed', catalog);
  assert.equal(mixed.ok, true);
  assert.equal(getTotalUsedLengthMm(mixed.state.selectedStones.map((item) => ({ type: 'stone', sizeMm: item.size }))), initialLength);
  const fixed = transitionBraceletSizeMode(mixed.state, '10', catalog);
  assert.equal(fixed.ok, true);
  assert.equal(getTotalUsedLengthMm(fixed.state.selectedStones.map((item) => ({ type: 'stone', sizeMm: item.size }))), 20);
});

test('difference and 1mm fit tolerance boundaries are exact', () => {
  assert.deepEqual(createBraceletGeometry({ components: mixedSequence, targetLengthMm: 20 }), {
    usedLengthMm: 20, targetLengthMm: 20, differenceMm: 0, fitStatus: 'within_tolerance', isWithinTolerance: true
  });
  assert.equal(getFitStatus(-1), 'within_tolerance');
  assert.equal(getFitStatus(1), 'within_tolerance');
  assert.equal(getFitStatus(-1.01), 'underfill');
  assert.equal(getFitStatus(1.01), 'overflow');
});

test('geometry is derived-only and renderer nodes use per-component physical sizes', () => {
  const derived = createBraceletGeometry({ components: mixedSequence, targetLengthMm: 20 });
  assert.equal(Object.hasOwn(derived, 'nodes'), false);
  assert.match(app, /sizeMm: item\.size,/);
  assert.match(app, /const itemAngleWidth = \(item\.sizeMm \/ loopCircumferenceMm\)/);
  assert.match(app, /const radiusPx = \(visualSizeMm \/ 2\) \* scaleMmToPx/);
  assert.match(app, /differenceMm: capacityMetrics\.differenceMm/);
});
