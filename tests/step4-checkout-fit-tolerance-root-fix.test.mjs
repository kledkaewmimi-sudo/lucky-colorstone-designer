import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getBraceletCompletionEligibility, getComponentPhysicalLengthMm } from '../bracelet-geometry.js';

const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');

function mixedEligibility(usedLengthMm) {
  return getBraceletCompletionEligibility({
    mode: 'mixed',
    targetLengthMm: 175,
    usedLengthMm,
    supportedComponentLengthsMm: [4, 6, 10]
  });
}

test('UAT checkout derives fit eligibility from the resolved shared completion authority', () => {
  assert.match(app, /function getResolvedLayoutFitEligibility\(resolvedLayout\) \{[\s\S]*?if \(summary\.completionEligibility\) return summary\.completionEligibility/);
  assert.match(app, /function getCurrentCheckoutFitEligibility\(\) \{\s*return getResolvedLayoutFitEligibility\(createCurrentBraceletResolvedLayout\(\)\);/);
  const checkout = app.slice(app.indexOf('async function handleStripeCheckout'), app.indexOf('function renderBraceletShowcaseCard'));
  assert.match(checkout, /if \(IS_UAT_MODE\) \{[\s\S]*?const fitEligibility = getCurrentCheckoutFitEligibility\(\);[\s\S]*?UAT safe mode: bracelet validation passed\. Checkout and payment are disabled\./);
  assert.ok(checkout.indexOf("if (IS_UAT_MODE)") < checkout.indexOf("fetch('/api/stripe/checkout-session'"));
});

test('Mixed 16cm target 175mm has the approved inclusive checkout-completion boundaries', () => {
  assert.equal(mixedEligibility(169).eligible, false);
  for (const usedLengthMm of [170, 171, 172, 173, 174, 175]) {
    assert.equal(mixedEligibility(usedLengthMm).eligible, true, `${usedLengthMm}mm must be completion eligible`);
  }
  assert.equal(mixedEligibility(176).eligible, false);
  assert.equal(mixedEligibility(176).isOverflow, true);
});

test('approved one, two, and three millimetre Mixed final gaps remain eligible', () => {
  for (const usedLengthMm of [172, 173, 174]) {
    const eligibility = mixedEligibility(usedLengthMm);
    assert.equal(eligibility.eligible, true, `${175 - usedLengthMm}mm final gap must remain eligible`);
  }
});

test('Fixed discrete completion and component physical-length semantics remain unchanged', () => {
  for (const [sizeMm, usedLengthMm] of [[10, 170], [6, 174], [4, 172]]) {
    const eligibility = getBraceletCompletionEligibility({
      mode: 'fixed', targetLengthMm: 175, usedLengthMm, fixedComponentLengthMm: sizeMm
    });
    assert.equal(eligibility.eligible, true, `${sizeMm}mm fixed completion remains eligible`);
  }
  assert.equal(getComponentPhysicalLengthMm({ type: 'empty', sizeMm: 10 }), 0);
  assert.equal(getComponentPhysicalLengthMm({ type: 'stone', sizeMm: 10 }), 10);
  assert.equal(getComponentPhysicalLengthMm({ type: 'spacer', effectiveLengthMm: 6 }), 6);
  assert.equal(getComponentPhysicalLengthMm({ type: 'charm', footprintMm: 4 }), 4);
});
