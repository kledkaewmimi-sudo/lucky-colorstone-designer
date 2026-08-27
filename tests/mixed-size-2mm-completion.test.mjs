import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { BRACELET_FIT_TOLERANCE_MM, getCheckoutFitEligibility, getFitStatus } from '../bracelet-geometry.js';

const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');

test('2mm inclusive fit accepts mixed-size completion boundaries without extra beads', () => {
  assert.equal(BRACELET_FIT_TOLERANCE_MM, 2);
  for (const value of [0, 0.1, 0.5, 1, 1.9, 2, -0.1, -0.5, -1, -1.9, -2, 2 - Number.EPSILON, -2 + Number.EPSILON]) {
    assert.equal(getCheckoutFitEligibility({ differenceMm: value }).eligible, true, String(value));
  }
  for (const value of [2.1, -2.1]) assert.equal(getCheckoutFitEligibility({ differenceMm: value }).eligible, false, String(value));
  assert.equal(getFitStatus(2.0000000000000004), 'within_tolerance');
});

test('Step 3 completion, Next UI, and Step 4 validation share the resolved-layout fit rule', () => {
  assert.match(app, /function getResolvedLayoutFitEligibility\(resolvedLayout\) \{\s*return getCheckoutFitEligibility\(resolvedLayout\?\.summary\);\s*\}/);
  assert.match(app, /const fitEligibility = getResolvedLayoutFitEligibility\(resolvedLayout\);/);
  assert.match(app, /const isFull = resolvedLayout\.summary\.placedCount > 0 && fitEligibility\.eligible;/);
  assert.match(app, /return getResolvedLayoutFitEligibility\(createCurrentBraceletResolvedLayout\(\)\);/);
  assert.match(app, /if \(validationState\.isOverflow \|\| validationState\.isFull\)/);
  assert.match(app, /if \(!validationState\.isFull\) \{/);
  assert.doesNotMatch(app, /1\.0mm fit tolerance/);
});

test('the shared Step 4 gate permits every bead-size mode within 2mm and blocks 2.1mm', () => {
  for (const beadSize of ['mixed', '4', '6', '10']) {
    for (const remainingMm of [0, 0.1, 0.5, 1, 1.9, 2, -0.1, -2]) {
      assert.equal(getCheckoutFitEligibility({ differenceMm: -remainingMm }).eligible, true, `${beadSize}:${remainingMm}`);
    }
    assert.equal(getCheckoutFitEligibility({ differenceMm: -2.1 }).eligible, false, `${beadSize}:2.1`);
  }
});
