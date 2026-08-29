import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getServerCompletionEligibility, validateAuthoritativeOrder } from '../server-order-validation.js';

const stone = { id: 'amethyst', sizes: [4, 6, 10], p4: 40, p6: 60, p10: 100, inStock: true };
const spacers = Array.from({ length: 9 }, (_, index) => {
  const effectiveLengthMm = index + 1;
  return [{ id: `spacer-${effectiveLengthMm}`, pricing: { base: 25 }, business: { effectiveLengthMm }, inStock: true }, effectiveLengthMm];
});
const catalogs = {
  stone: new Map([[stone.id, stone]]),
  charm: new Map(),
  spacer: new Map(spacers.map(([item]) => [item.id, item]))
};
const settings = { globalDiscountPercent: 20, discountEnabled: true };
const stones = (count, size = 10) => Array.from({ length: count }, () => ({ type: 'stone', stoneId: stone.id, size }));
const spacer = (lengthMm) => ({ type: 'spacer', spacerId: `spacer-${lengthMm}` });
const validate = (braceletSequence, beadSize = 'mixed') => validateAuthoritativeOrder({
  clientOrder: { wristSize: 16, beadSize, braceletSequence }, catalogs, settings
});

test('server completion authority implements every approved Mixed 175mm boundary', () => {
  const cases = [
    [169, [...stones(16), spacer(9)], false],
    [170, stones(17), true],
    [171, [...stones(17), spacer(1)], true],
    [172, [...stones(17), spacer(2)], true],
    [173, [...stones(17), spacer(3)], true],
    [174, [...stones(17), spacer(4)], true],
    [175, [...stones(17), spacer(5)], true],
    [176, [...stones(17), spacer(6)], false]
  ];
  for (const [usedLengthMm, sequence, accepted] of cases) {
    const completion = getServerCompletionEligibility({ beadSize: 'mixed', usedLengthMm, targetLengthMm: 175 });
    assert.equal(completion.complete, accepted, `${usedLengthMm}mm helper result`);
    if (accepted) {
      const result = validate(sequence);
      assert.equal(result.geometry.usedLengthMm, usedLengthMm);
      assert.equal(result.completionEligibility.complete, true);
    } else {
      assert.throws(() => validate(sequence), usedLengthMm < 170 ? /incomplete/ : /exceeds allowed target/);
    }
  }
});

test('one, two, and three millimetre final gaps pass server validation', () => {
  for (const gapMm of [1, 2, 3]) {
    const result = validate([...stones(17), spacer(5 - gapMm)]);
    assert.equal(result.geometry.usedLengthMm, 175 - gapMm);
    assert.equal(result.completionEligibility.status, 'COMPLETE_WITHIN_TARGET_RANGE');
  }
});

test('Fixed discrete capacity stays distinct from the Mixed completion interval', () => {
  assert.equal(validate(stones(17), '10').completionEligibility.complete, true);
  assert.throws(() => validate(stones(18), '10'), /exceeds allowed target/);
  assert.equal(validate(stones(29, 6), '6').completionEligibility.complete, true);
  assert.equal(validate(stones(43, 4), '4').completionEligibility.complete, true);
});

test('empty and placeholder sequence entries carry zero backend physical length', () => {
  const result = validate([...stones(17), { type: 'empty', size: 10 }, { type: 'placeholder', size: 10 }]);
  assert.equal(result.geometry.usedLengthMm, 170);
  assert.equal(result.completionEligibility.complete, true);
});

test('the Stripe checkout route retains server-authoritative validation and no UAT safety branch', async () => {
  const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  const validator = await readFile(new URL('../server-order-validation.js', import.meta.url), 'utf8');
  assert.match(server, /const \{ validateAuthoritativeOrder \} = require\('\.\/server-order-validation\.js'\);/);
  assert.match(server, /const validated = validateAuthoritativeOrder\(\{ clientOrder, catalogs, settings \}\);/);
  assert.match(server, /async function createStripeCheckoutSession/);
  assert.match(server, /async function applyStripeCheckoutPaymentEvent/);
  assert.equal(server.includes('UAT: checkout and payment are disabled.'), false);
  assert.equal(validator.includes('1.0mm fit tolerance'), false);
});
