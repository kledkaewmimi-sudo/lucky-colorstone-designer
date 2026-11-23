import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getComponentPhysicalLengthMm } from '../bracelet-geometry.js';

const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');

test('retained slots are zero physical length but retain their former visual size', () => {
  assert.equal(getComponentPhysicalLengthMm({ type: 'empty', size: 10 }), 0);
  assert.match(app, /function getLoopItemLengthMm\(item\)\s*\{\s*if \(isEmptyLoopSlot\(item\)\)\s*\{[\s\S]{0,220}?return 0;/);
  assert.match(app, /function getLoopItemRenderSizeMm\(item\)\s*\{\s*if \(isEmptyLoopSlot\(item\)\)\s*\{\s*return Number\(item\?\.size \|\| getCurrentBeadSizeMm\(\)\);/);
  assert.match(app, /type: 'empty',[\s\S]{0,220}?sizeMm: getLoopItemRenderSizeMm\(item\),/);
});

test('a retained slot preserves visual design-loop capacity while completion remains physical', () => {
  assert.match(app, /const emptySlotCount = loopComponents\.filter\(\(component\) => component\.type === 'empty'\)\.length;/);
  assert.match(app, /const visualUsedLengthMm = loopComponents\.reduce/);
  assert.match(app, /const visualSpaceLeftMm = Math\.max\(0, braceletConfig\.braceletLengthMm - visualUsedLengthMm\);/);
  assert.match(app, /const trailingPlaceholderCount = completionEligibility\.complete\s*\? 0\s*:\s*Math\.max\(0, Math\.floor\(visualSpaceLeftMm \/ braceletConfig\.placingSizeMm\)\);/);
});

test('re-add consumes the retained position and keeps its stable render identity', () => {
  assert.match(app, /loopItem\.uniqueId = State\.selectedStones\[emptySlotIndex\]\?\.uniqueId \|\| loopItem\.uniqueId;[\s\S]{0,120}?State\.selectedStones\[emptySlotIndex\] = loopItem;/);
  assert.match(app, /newBead\.uniqueId = State\.selectedStones\[State\.activeSlotIndex\]\?\.uniqueId \|\| newBead\.uniqueId;[\s\S]{0,120}?State\.selectedStones\[State\.activeSlotIndex\] = newBead;/);
  assert.match(app, /newSpacer\.uniqueId = State\.selectedStones\[State\.activeSlotIndex\]\?\.uniqueId \|\| newSpacer\.uniqueId;[\s\S]{0,120}?State\.selectedStones\[State\.activeSlotIndex\] = newSpacer;/);
});
