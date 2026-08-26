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
import { trimTrailingOverflowAfterFixedConversion } from '../mixed-size-transition-trim.js';

const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const stone = (size, uniqueId = `stone-${size}`) => ({ componentType: 'stone', stoneId: 'all', size, uniqueId });
const catalog = [{ id: 'all', sizes: [4, 6, 10] }];

test('physical components resolve their exact stored footprints', () => {
  assert.equal(getComponentPhysicalLengthMm(stone(4)), 4);
  assert.equal(getComponentPhysicalLengthMm(stone(6)), 6);
  assert.equal(getComponentPhysicalLengthMm(stone(10)), 10);
  assert.equal(getComponentPhysicalLengthMm({ type: 'charm', footprintMm: 9, size: 2 }), 9);
  assert.equal(getComponentPhysicalLengthMm({ type: 'spacer', effectiveLengthMm: 1, size: 9 }), 1);
});

test('mixed 4/6/10 geometry sums placed physical sizes independently', () => {
  const components = [stone(4, 'a'), stone(10, 'b'), stone(6, 'c'), { type: 'spacer', effectiveLengthMm: 1, uniqueId: 'd' }, stone(4, 'e'), { type: 'charm', footprintMm: 9, uniqueId: 'f' }];
  assert.equal(getTotalUsedLengthMm(components), 34);
  const before = createBraceletGeometry({ components, targetLengthMm: 34 });
  const afterMixedPlacingChange = createBraceletGeometry({ components: structuredClone(components), targetLengthMm: 34 });
  assert.equal(before.usedLengthMm, 34);
  assert.equal(afterMixedPlacingChange.usedLengthMm, before.usedLengthMm);
});

test('fit uses unrounded inclusive 1.0mm boundaries', () => {
  assert.equal(getFitStatus(-1), 'within_tolerance');
  assert.equal(getFitStatus(1), 'within_tolerance');
  assert.equal(getFitStatus(-1.01), 'underfill');
  assert.equal(getFitStatus(1.01), 'overflow');
});

test('invalid dimensions report invalid geometry without a mixed or 6mm fallback', () => {
  const invalidStone = createBraceletGeometry({ components: [{ type: 'stone', size: 'mixed' }], targetLengthMm: 10 });
  const invalidCharm = createBraceletGeometry({ components: [{ type: 'charm', size: 6 }], targetLengthMm: 10 });
  const invalidSpacer = createBraceletGeometry({ components: [{ type: 'spacer', size: 6 }], targetLengthMm: 10 });
  assert.equal(invalidStone.fitStatus, 'invalid');
  assert.equal(invalidCharm.fitStatus, 'invalid');
  assert.equal(invalidSpacer.fitStatus, 'invalid');
  assert.equal(invalidStone.usedLengthMm, null);
});

test('mixed to fixed validates before mutation, converts all stones, then trims only the trailing minimum', () => {
  const mixed = { beadSize: 'mixed', mixedPlacingSize: 6, activeSlotIndex: 1, selectedStones: [stone(4, 'a'), stone(6, 'b'), stone(10, 'c')] };
  const before = structuredClone(mixed);
  const converted = transitionBraceletSizeMode(mixed, '10', catalog);
  assert.equal(converted.ok, true);
  assert.deepEqual(converted.state.selectedStones.map((item) => item.size), [10, 10, 10]);
  const trimmed = trimTrailingOverflowAfterFixedConversion({ state: converted.state, targetLengthMm: 21 });
  assert.deepEqual(trimmed.state.selectedStones.map((item) => item.uniqueId), ['a', 'b']);
  assert.deepEqual(trimmed.removedComponents.map((item) => item.uniqueId), ['c']);
  assert.equal(trimmed.geometry.fitStatus, 'within_tolerance');
  assert.deepEqual(mixed, before);
});

test('unsupported fixed conversion blocks without trimming or mutation', () => {
  const state = { beadSize: 'mixed', selectedStones: [{ componentType: 'stone', stoneId: 'six-only', size: 6, uniqueId: 'a' }] };
  const before = structuredClone(state);
  const blocked = transitionBraceletSizeMode(state, '10', [{ id: 'six-only', sizes: [6] }]);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'unsupported_stones');
  assert.deepEqual(state, before);
});

test('trimming does not auto-add when it starts underfilled and fixed 4/6/10 remain valid', () => {
  const underfill = trimTrailingOverflowAfterFixedConversion({ state: { selectedStones: [stone(6, 'a')] }, targetLengthMm: 20 });
  assert.deepEqual(underfill.state.selectedStones.map((item) => item.uniqueId), ['a']);
  assert.deepEqual(underfill.removedComponents, []);
  for (const size of [4, 6, 10]) {
    assert.equal(createBraceletGeometry({ components: [stone(size), stone(size)], targetLengthMm: size * 2 }).fitStatus, 'within_tolerance');
  }
});

test('production integration uses the established target formula and canonical geometry path', () => {
  assert.match(app, /import \{ createBraceletGeometry, getComponentPhysicalLengthMm \} from '\.\/bracelet-geometry\.js';/);
  assert.match(app, /return \(State\.wristSize \+ TOLERANCE_CM\) \* 10;/);
  assert.match(app, /trimTrailingOverflowAfterFixedConversion\(/);
  assert.match(app, /getComponentGeometry: createGeometryComponentForLoopItem/);
});
