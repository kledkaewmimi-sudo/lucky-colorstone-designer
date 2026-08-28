import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { BRACELET_FIT_TOLERANCE_MM, getBraceletCompletionEligibility, getFitStatus, getNextComponentPlacementEligibility } from '../bracelet-geometry.js';

const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');

test('2mm fit status remains diagnostic metadata rather than the completion contract', () => {
  assert.equal(BRACELET_FIT_TOLERANCE_MM, 2);
  for (const value of [0, 0.1, 0.5, 1, 1.9, 2, -0.1, -0.5, -1, -1.9, -2, 2 - Number.EPSILON, -2 + Number.EPSILON]) {
    assert.equal(getFitStatus(value), 'within_tolerance', String(value));
  }
  for (const value of [2.1, -2.1]) assert.notEqual(getFitStatus(value), 'within_tolerance', String(value));
  assert.equal(getFitStatus(2.0000000000000004), 'within_tolerance');
});

test('Step 3 completion, Next UI, and Step 4 validation share Mixed wrist eligibility', () => {
  assert.match(app, /function getResolvedLayoutFitEligibility\(resolvedLayout\) \{[\s\S]*?getBraceletCompletionEligibility/);
  assert.match(app, /if \(summary\.completionEligibility\) return summary\.completionEligibility;/);
  assert.match(app, /wristSizeMm: State\.wristSize \* 10,/);
  assert.match(app, /completionEligibility,/);
  assert.match(app, /const fitEligibility = getResolvedLayoutFitEligibility\(resolvedLayout\);/);
  assert.match(app, /const isFull = fitEligibility\.eligible;/);
  assert.match(app, /return getResolvedLayoutFitEligibility\(createCurrentBraceletResolvedLayout\(\)\);/);
  assert.match(app, /if \(validationState\.isOverflow \|\| validationState\.isFull\)/);
  assert.match(app, /if \(!validationState\.isFull\) \{/);
  assert.doesNotMatch(app, /1\.0mm fit tolerance/);
});

test('the shared Step 4 gate uses fixed discrete capacity and Mixed target through target plus five', () => {
  assert.equal(getBraceletCompletionEligibility({ mode: 'fixed', usedLengthMm: 170, targetLengthMm: 175, fixedComponentLengthMm: 10 }).eligible, true);
  assert.equal(getBraceletCompletionEligibility({ mode: 'mixed', usedLengthMm: 170, targetLengthMm: 175 }).eligible, false);
  assert.equal(getNextComponentPlacementEligibility({ usedLengthMm: 172, targetLengthMm: 175, componentLengthMm: 4 }).eligible, true);
  assert.equal(getNextComponentPlacementEligibility({ usedLengthMm: 172, targetLengthMm: 175, componentLengthMm: 6 }).eligible, true);
  assert.equal(getNextComponentPlacementEligibility({ usedLengthMm: 172, targetLengthMm: 175, componentLengthMm: 10 }).eligible, false);
  assert.equal(getBraceletCompletionEligibility({ mode: 'mixed', usedLengthMm: 176, targetLengthMm: 175 }).eligible, true);
});
