import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');

function resolveFullRing(items) {
  const circumferenceMm = items.reduce((sum, item) => sum + item.sizeMm, 0);
  let angle = -Math.PI / 2;
  return items.map((item) => {
    const angleWidth = item.sizeMm / circumferenceMm * 2 * Math.PI;
    const node = { ...item, centerAngle: angle + angleWidth / 2, angleWidth };
    angle += angleWidth;
    return node;
  });
}

function assertReplacementUsesCurrentFootprint(before, index, replacementSizeMm) {
  const afterDelete = before.toSpliced(index, 1, { ...before[index], kind: 'empty', sizeMm: 0, renderSizeMm: before[index].renderSizeMm });
  const afterReadd = afterDelete.toSpliced(index, 1, {
    ...before[index],
    kind: 'stone',
    sizeMm: replacementSizeMm,
    renderSizeMm: replacementSizeMm
  });
  const nodes = resolveFullRing(afterReadd);
  assert.equal(afterReadd.filter((item) => item.kind === 'empty').length, 0);
  assert.equal(nodes[index].sizeMm, replacementSizeMm);
  assert.equal(nodes[index].renderSizeMm, replacementSizeMm);
  assert.equal(nodes.length, before.length);
  assert.deepEqual(nodes.map((item) => item.uniqueId), before.map((item) => item.uniqueId));
}

test('slot forensics is UAT-only and records source, SVG, metadata, and neighbor arc evidence', () => {
  assert.match(app, /const SLOT_FORENSICS_ENABLED = IS_UAT_MODE && urlParams\.get\('slot_forensics'\) === '1'/);
  assert.match(app, /TOTAL_CANONICAL_ITEMS[\s\S]*TOTAL_DOM_COMPONENT_NODES/);
  assert.match(app, /TOTAL_OCCUPIED_ITEMS[\s\S]*TOTAL_PLACEHOLDER_NODES/);
  assert.match(app, /placeholderSubtype[\s\S]*angleWidthDeg[\s\S]*imageHref/);
  assert.match(app, /getForensicNeighborDistances[\s\S]*visualGapMm/);
  assert.match(app, /GAP_WITHOUT_EMPTY_NODE/);
  assert.match(app, /\['STATE_A_BEFORE_DELETE', 'Capture A'\]/);
  assert.match(app, /setupSlotForensicsPanel\(\);/);
  assert.match(app, /setupLineDebugPanel\(\);/);
  assert.match(app, /SLOT FORENSICS ACTIVE/);
  assert.match(app, /Export \/ Copy Trace/);
  assert.match(app, /z-index:2147483647!important/);
  assert.match(app, /document\.body\.appendChild\(panel\)/);
  assert.match(app, /history:\s*\[\]/);
  assert.match(app, /slotForensics\.history\.push\(snapshot\)/);
  assert.match(app, /STATE_C_IMMEDIATE_AFTER_READD/);
  assert.match(app, /STATE_D_FINAL_SETTLED_RENDER/);
  assert.match(app, /compareSlotForensicsSnapshots/);
  assert.match(app, /JSON\.stringify\(slotForensics, null, 2\)/);
});

test('Step 2 UAT trace is query-gated and records selection, validation, navigation, and mobile export evidence', () => {
  assert.match(app, /const STEP2_DEBUG_ENABLED = IS_UAT_MODE && urlParams\.get\('step2_debug'\) === '1'/);
  ['STEP2_RENDER', 'CARD_POINTERDOWN', 'CARD_CLICK', 'BEFORE_SIZE_TRANSITION', 'AFTER_SIZE_TRANSITION', 'AFTER_STEP2_RENDER', 'NEXT_CLICK', 'BEFORE_VALIDATION', 'AFTER_VALIDATION', 'BEFORE_GOTO_STEP3', 'AFTER_GOTO_STEP3'].forEach((eventName) => {
    assert.match(app, new RegExp(`recordStep2Debug\\('${eventName}'`));
  });
  ['CLICKED_CARD', 'ACTIVE_CARD', 'STATE_BEAD_SIZE', 'STATE_MIXED_PLACING_SIZE', 'EXPLICIT_SELECTION', 'VALIDATION_RESULT', 'NEXT_HANDLER_CALLS', 'LAST_TRANSITION_RESULT', 'LAST_RENDER_SEQUENCE'].forEach((field) => {
    assert.match(app, new RegExp(field));
  });
  assert.match(app, /window\.__step2Debug = step2Debug/);
  assert.match(app, /COPY STEP2 TRACE/);
  assert.match(app, /top:max\(52px, env\(safe-area-inset-top\)\)/);
  assert.doesNotMatch(app.slice(app.indexOf('function setupStep2DebugPanel'), app.indexOf('function renderStep2DebugPanel')), /bottom:max\(8px/);
  assert.match(app, /output\.hidden = true/);
  assert.match(app, /toggle\.textContent = expanded \? 'Collapse' : 'Expand'/);
});

test('full-ring mixed composition preserves order and uses replacement size for same, smaller, and larger re-adds', () => {
  // 170 mm realistic full Mixed bracelet: 13×10 + 6×6 + 1×4, 20 components.
  const sizes = [10, 6, 10, 10, 6, 10, 10, 10, 4, 10, 6, 10, 10, 6, 10, 10, 6, 10, 10, 6];
  const before = sizes.map((sizeMm, index) => ({ kind: 'stone', sizeMm, renderSizeMm: sizeMm, uniqueId: index + 1 }));
  assert.ok(before.length >= 15);
  assert.equal(before.reduce((sum, item) => sum + item.sizeMm, 0), 170);
  assertReplacementUsesCurrentFootprint(before, 9, 10);
  assertReplacementUsesCurrentFootprint(before, 9, 4);
  assertReplacementUsesCurrentFootprint(before, 9, 6);
});

test('full-ring angular widths have no residual deleted-size arc after a smaller replacement', () => {
  const before = Array.from({ length: 18 }, (_, index) => ({ kind: 'stone', sizeMm: [10, 6, 4][index % 3], renderSizeMm: [10, 6, 4][index % 3], uniqueId: index + 1 }));
  const readded = before.toSpliced(8, 1, { ...before[8], sizeMm: 4, renderSizeMm: 4 });
  const nodes = resolveFullRing(readded);
  const circumference = readded.reduce((sum, item) => sum + item.sizeMm, 0);
  assert.equal(nodes[8].angleWidth, 4 / circumference * 2 * Math.PI);
  assert.notEqual(nodes[8].angleWidth, 10 / circumference * 2 * Math.PI);
});
