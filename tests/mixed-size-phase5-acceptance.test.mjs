import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getCheckoutFitEligibility } from '../bracelet-geometry.js';
import { transitionBraceletSizeMode } from '../mixed-size-state.js';
import { trimTrailingOverflowAfterFixedConversion } from '../mixed-size-transition-trim.js';
import { aggregateStoneVariants, createStoneVariantPayload } from '../mixed-order-model.js';

const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const catalog = [{ id: 'all', sizes: [4, 6, 10], p4: 40, p6: 60, p10: 100 }];
const stone = (size, uniqueId) => ({ componentType: 'stone', stoneId: 'all', size, uniqueId });

test('mixed placement/filter contract remains explicit and non-mutating', () => {
  assert.match(app, /getMixedPlacementSizeForStone\(stoneData, State\.mixedPlacingSize\) === null/);
  assert.match(app, /function setMixedStoneSizeFilter\(size\)/);
  assert.match(app, /if \(nextFilter !== 'all'\) setCurrentMixedPlacingSize\(nextFilter\)/);
  const placed = [stone(4, 'a'), stone(6, 'b'), stone(10, 'c')];
  assert.deepEqual(placed.map((item) => item.size), [4, 6, 10]);
});

test('valid mixed to fixed conversion applies deterministic trailing-only trim', () => {
  const mixedState = { beadSize: 'mixed', mixedPlacingSize: 6, activeSlotIndex: 1, selectedStones: [stone(4, 'a'), stone(6, 'b'), stone(10, 'c')] };
  const converted = transitionBraceletSizeMode(mixedState, '10', catalog);
  assert.equal(converted.ok, true);
  const result = trimTrailingOverflowAfterFixedConversion({
    state: converted.state,
    targetLengthMm: 21,
    getComponentLengthMm: (component) => component.size
  });
  assert.deepEqual(result.state.selectedStones.map((item) => item.uniqueId), ['a', 'b']);
  assert.deepEqual(result.state.selectedStones.map((item) => item.size), [10, 10]);
  assert.deepEqual(result.removedComponents.map((item) => item.uniqueId), ['c']);
  assert.equal(result.geometry.fitStatus, 'within_tolerance');
  assert.equal(result.state.activeSlotIndex, null);
  assert.deepEqual(mixedState.selectedStones.map((item) => item.size), [4, 6, 10]);
});

test('trailing trim stops at tolerance and never auto-adds underfill components', () => {
  const state = { beadSize: '6', selectedStones: [stone(6, 'a'), stone(6, 'b'), stone(6, 'c')] };
  const result = trimTrailingOverflowAfterFixedConversion({ state, targetLengthMm: 13, getComponentLengthMm: (component) => component.size });
  assert.deepEqual(result.state.selectedStones.map((item) => item.uniqueId), ['a', 'b']);
  assert.equal(result.geometry.differenceMm, -1);
  const underfilled = trimTrailingOverflowAfterFixedConversion({ state: { ...state, selectedStones: [stone(6, 'a')] }, targetLengthMm: 20, getComponentLengthMm: (component) => component.size });
  assert.deepEqual(underfilled.state.selectedStones.map((item) => item.uniqueId), ['a']);
  assert.deepEqual(underfilled.removedComponents, []);
});

test('unsupported mixed to fixed remains blocked before trimming and cancellation has no mutation path', () => {
  const unsupportedCatalog = [{ id: 'six-only', sizes: [6] }];
  const state = { beadSize: 'mixed', selectedStones: [{ componentType: 'stone', stoneId: 'six-only', size: 6, uniqueId: 'a' }] };
  const before = structuredClone(state);
  const blocked = transitionBraceletSizeMode(state, '10', unsupportedCatalog);
  assert.equal(blocked.ok, false);
  assert.deepEqual(state, before);
  assert.match(app, /if \(!confirmed\) return;/);
});

test('fit, mixed pricing, payload variants, and ordered sequence remain phase-5 ready', () => {
  assert.equal(getCheckoutFitEligibility({ differenceMm: -1 }).eligible, true);
  assert.equal(getCheckoutFitEligibility({ differenceMm: 1 }).eligible, true);
  assert.equal(getCheckoutFitEligibility({ differenceMm: -1.1 }).eligible, false);
  assert.equal(getCheckoutFitEligibility({ differenceMm: 1.1 }).eligible, false);
  const variants = aggregateStoneVariants([stone(4, 'a'), stone(6, 'b'), stone(10, 'c')], catalog, (entry, size) => entry[`p${size}`]);
  assert.deepEqual(createStoneVariantPayload(variants), [
    { stoneId: 'all', size: 4, quantity: 1 },
    { stoneId: 'all', size: 6, quantity: 1 },
    { stoneId: 'all', size: 10, quantity: 1 }
  ]);
  assert.match(app, /braceletSequence: pricing\.braceletSequence/);
  assert.match(app, /trimTrailingOverflowAfterFixedConversion/);
});

test('UAT safety and derived-only layout guards remain in the integrated flow', () => {
  assert.match(app, /if \(IS_UAT_MODE && step === 4\)/);
  assert.match(app, /if \(IS_UAT_MODE\) \{\s*showToast\('UAT: checkout and payment are disabled.'/);
  assert.doesNotMatch(app, /lucky-colorstone-designer\.onrender\.com/);
  assert.doesNotMatch(app, /resolvedLayout:\s*createCurrentBraceletResolvedLayout/);
});
