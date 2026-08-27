import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getFitStatus, getPhysicalPreviewSpan } from '../bracelet-geometry.js';

const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const TWO_PI = Math.PI * 2;

test('underfilled fixed and mixed previews reserve a physical gap without changing component geometry', () => {
  for (const [mode, target, placed] of [
    ['fixed-10', 180, 177.9],
    ['fixed-6', 180, 177.9],
    ['fixed-4', 180, 177.9],
    ['mixed', 180, 177.9]
  ]) {
    const span = getPhysicalPreviewSpan({ targetCircumferenceMm: target, placedPhysicalLengthMm: placed, fitStatus: getFitStatus(placed - target) });
    assert.equal(span.isUnderfilled, true, mode);
    assert.ok(span.occupiedAngle < TWO_PI, mode);
    assert.ok(span.gapAngle > 0, mode);
    assert.equal(span.renderCircumferenceMm, target, mode);
  }
});

test('fit values through the inclusive 2mm boundary remain visually closed', () => {
  for (const difference of [0, -0.1, -1, -1.9, -2]) {
    const target = 180;
    const span = getPhysicalPreviewSpan({ targetCircumferenceMm: target, placedPhysicalLengthMm: target + difference, fitStatus: getFitStatus(difference) });
    assert.equal(span.isUnderfilled, false, String(difference));
    assert.equal(span.gapAngle, 0, String(difference));
    assert.equal(span.occupiedAngle, TWO_PI, String(difference));
  }
});

test('adding physical length reduces the underfill gap and the resolved renderer uses the target circumference only for underfill', () => {
  const before = getPhysicalPreviewSpan({ targetCircumferenceMm: 180, placedPhysicalLengthMm: 168, fitStatus: getFitStatus(-12) });
  const after = getPhysicalPreviewSpan({ targetCircumferenceMm: 180, placedPhysicalLengthMm: 174, fitStatus: getFitStatus(-6) });
  assert.ok(after.gapAngle < before.gapAngle);
  assert.match(app, /const visibleLoopComponents = isPhysicallyUnderfilled[\s\S]*?component\.type !== 'empty'/);
  assert.match(app, /const renderedTrailingPlaceholderCount = isPhysicallyUnderfilled \? 0 : trailingPlaceholderCount;/);
  assert.match(app, /const loopCircumferenceMm = isPhysicallyUnderfilled[\s\S]*?physicalPreviewSpan\.renderCircumferenceMm/);
  assert.match(app, /if \(!isPhysicallyUnderfilled && charmComponents\.length === 2\)/);
  assert.match(app, /const itemAngleWidth = \(item\.sizeMm \/ loopCircumferenceMm\) \* 2 \* Math\.PI;/);
});
