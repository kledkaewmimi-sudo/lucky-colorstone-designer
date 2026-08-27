import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getCheckoutFitEligibility, getNextComponentPlacementEligibility } from '../bracelet-geometry.js';

const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');

function sourceBetween(start, end) {
  return app.slice(app.indexOf(start), app.indexOf(end));
}

test('Step 2 to Step 3 commits the body before the stepper', () => {
  const renderApp = sourceBetween('async function renderApp()', '// Stepper bar rendering logic');
  assert.ok(renderApp.indexOf('await renderStepViews();') < renderApp.indexOf('renderStepper();'));
  const stepViews = sourceBetween('async function renderStepViews()', '// Navigate to step');
  assert.ok(stepViews.indexOf("view.classList.add('active')") < stepViews.indexOf('renderStep3();'));
});

test('the known-good slot renderer retains dotted placeholders and stable source positions', () => {
  const renderer = sourceBetween('function createResolvedBraceletLayout', 'function createCurrentBraceletResolvedLayout');
  assert.match(renderer, /loopComponents\.map\(\(component\) => component\.type === 'empty'/);
  assert.match(renderer, /Array\.from\(\{ length: trailingPlaceholderCount \}/);
  assert.doesNotMatch(renderer, /isPhysicallyUnderfilled|physicalPreviewSpan|renderedTrailingPlaceholderCount/);
  assert.match(app, /slot\.setAttribute\("stroke-dasharray", isFirstPlaceholder \? "4 2" : "3 3"\)/);
  assert.match(app, /State\.selectedStones\[index\] = createEmptyLoopSlot\(getLoopItemLengthMm\(removed\), removed\?\.uniqueId \|\| null\)/);
  assert.match(app, /State\.selectedStones\[State\.activeSlotIndex\] = newBead/);
  assert.match(sourceBetween('function removeLoopItemFromBracelet', '// Remove Stone Logic'), /\} else \{\s*State\.selectedStones\[index\] = createEmptyLoopSlot/);
});

test('fixed and mixed final-slot placement reaches the same inclusive 2mm final-fit boundary', () => {
  for (const [mode, usedLengthMm, targetLengthMm, componentLengthMm] of [
    ['fixed-4', 172, 178, 4],
    ['fixed-6', 168, 176, 6],
    ['fixed-10', 170, 178, 10],
    ['mixed', 174, 178, 6]
  ]) {
    const placement = getNextComponentPlacementEligibility({ usedLengthMm, targetLengthMm, componentLengthMm });
    assert.equal(placement.eligible, true, mode);
    assert.equal(placement.isComplete, true, mode);
    assert.equal(getCheckoutFitEligibility({ differenceMm: placement.differenceMm }).eligible, true, mode);
  }
});

test('underfilled states retain at least one supported physical placement when one can reach the fit boundary', () => {
  const targetLengthMm = 178;
  const usedLengthMm = 166;
  assert.equal(getCheckoutFitEligibility({ differenceMm: usedLengthMm - targetLengthMm }).eligible, false);
  assert.ok([4, 6, 10].some((componentLengthMm) => getNextComponentPlacementEligibility({
    usedLengthMm,
    targetLengthMm,
    componentLengthMm
  }).eligible));
  assert.match(app, /function getCurrentPlacementEligibility\(lengthMm\)[\s\S]*?getNextComponentPlacementEligibility/);
  assert.match(app, /while \(getCurrentPlacementEligibility\(placedSize\)\.eligible && remainingStockQty > 0\)/);
});
