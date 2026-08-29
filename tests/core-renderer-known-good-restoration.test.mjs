import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getBraceletCompletionEligibility, getNextComponentPlacementEligibility } from '../bracelet-geometry.js';

const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');

function sourceBetween(start, end) {
  return app.slice(app.indexOf(start), app.indexOf(end));
}

test('Step 2 to Step 3 commits the body before the stepper', () => {
  const renderApp = sourceBetween('async function renderApp()', '// Stepper bar rendering logic');
  assert.ok(renderApp.indexOf('renderStepper();') < renderApp.indexOf('await renderStepViews();'));
  const atomicTransition = sourceBetween('async function renderStep2ToStep3Atomically()', '// Stepper bar rendering logic');
  assert.ok(atomicTransition.indexOf('await renderStepViews();') < atomicTransition.indexOf('renderStepper();'));
  const navigation = sourceBetween('async function goToStep(step)', 'function configureFooterNavigation()');
  assert.match(navigation, /if \(previousStep === 2 && step === 3\) \{\s*await renderStep2ToStep3Atomically\(\)/);
  const stepViews = sourceBetween('async function renderStepViews()', '// Navigate to step');
  assert.ok(stepViews.indexOf("view.classList.add('active')") < stepViews.indexOf('renderStep3();'));
});

test('the slot renderer preserves retained visual footprint while completion remains physical', () => {
  const renderer = sourceBetween('function createResolvedBraceletLayout', 'function createCurrentBraceletResolvedLayout');
  assert.match(renderer, /loopComponents\.map\(\(component\) => component\.type === 'empty'/);
  assert.match(renderer, /Array\.from\(\{ length: trailingPlaceholderCount \}/);
  assert.match(renderer, /const visualUsedLengthMm = loopComponents\.reduce/);
  assert.match(renderer, /const trailingPlaceholderCount = completionEligibility\.complete/);
  assert.match(renderer, /Math\.floor\(visualSpaceLeftMm \/ braceletConfig\.placingSizeMm\)/);
  assert.doesNotMatch(renderer, /isPhysicallyUnderfilled|physicalPreviewSpan|renderedTrailingPlaceholderCount/);
  assert.match(app, /slot\.setAttribute\("stroke-dasharray", isFirstPlaceholder \? "4 2" : "3 3"\)/);
  assert.match(app, /State\.selectedStones\[resolvedIndex\] = createEmptyLoopSlot\(removed\?\.size, removed\?\.uniqueId \|\| null\)/);
  assert.match(app, /State\.selectedStones\[State\.activeSlotIndex\] = newBead/);
  assert.match(sourceBetween('function removeLoopItemFromBracelet', '// Remove Stone Logic'), /\} else \{\s*State\.selectedStones\[resolvedIndex\] = createEmptyLoopSlot/);
});

test('fixed slots preserve pre-Mixed capacity while Mixed uses target-minus-five completion', () => {
  for (const [sizeMm, usedLengthMm] of [[4, 172], [6, 174], [10, 170]]) {
    assert.equal(getNextComponentPlacementEligibility({ mode: 'fixed', usedLengthMm, targetLengthMm: 175, componentLengthMm: sizeMm }).eligible, false, `fixed-${sizeMm}`);
    assert.equal(getBraceletCompletionEligibility({ mode: 'fixed', usedLengthMm, targetLengthMm: 175, fixedComponentLengthMm: sizeMm }).eligible, true, `fixed-${sizeMm}`);
  }
  assert.equal(getNextComponentPlacementEligibility({ mode: 'mixed', usedLengthMm: 168, targetLengthMm: 175, componentLengthMm: 4 }).eligible, true);
  assert.equal(getBraceletCompletionEligibility({ mode: 'mixed', usedLengthMm: 170, targetLengthMm: 175 }).eligible, true);
});

test('underfilled states retain at least one supported physical placement when capacity remains', () => {
  const targetLengthMm = 178;
  const usedLengthMm = 166;
  assert.equal(getBraceletCompletionEligibility({ mode: 'mixed', usedLengthMm, targetLengthMm }).eligible, false);
  assert.ok([4, 6, 10].some((componentLengthMm) => getNextComponentPlacementEligibility({
    usedLengthMm,
    targetLengthMm,
    componentLengthMm
  }).eligible));
  assert.match(app, /function getCurrentPlacementEligibility\(lengthMm\)[\s\S]*?getNextComponentPlacementEligibility/);
  assert.match(app, /while \(getCurrentPlacementEligibility\(placedSize\)\.eligible && remainingStockQty > 0\)/);
});
