import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateAuthoritativeOrder } from '../server-order-validation.js';

const stone = { id: 'amethyst', sizes: [4, 6, 10], p4: 40, p6: 60, p10: 100, inStock: true };
const spacer = { id: 'spacer-1', pricing: { base: 25 }, business: { effectiveLengthMm: 1 }, inStock: true };
const spacerNine = { id: 'spacer-9', pricing: { base: 25 }, business: { effectiveLengthMm: 9 }, inStock: true };
const charm = { id: 'charm-1', pricing: { base: 200 }, business: { footprintMm: 9 }, inStock: true };
const catalogs = { stone: new Map([[stone.id, stone]]), charm: new Map([[charm.id, charm]]), spacer: new Map([[spacer.id, spacer], [spacerNine.id, spacerNine]]) };
const settings = { globalDiscountPercent: 20, discountEnabled: true };
const component = (size) => ({ type: 'stone', stoneId: 'amethyst', size });
const order = (braceletSequence, extras = {}) => ({ wristSize: 0.5, beadSize: 'mixed', braceletSequence, ...extras });
const validate = (braceletSequence, extras = {}) => validateAuthoritativeOrder({ clientOrder: order(braceletSequence, extras), catalogs, settings });

test('authoritative variants accept physical 4/6/10 and keep same stone sizes separate', () => {
  const result = validate([component(4), component(6), component(10)], { stoneVariants: [{ stoneId: 'amethyst', size: 4, quantity: 1 }, { stoneId: 'amethyst', size: 6, quantity: 1 }, { stoneId: 'amethyst', size: 10, quantity: 1 }] });
  assert.deepEqual(result.stoneVariants, [
    { stoneId: 'amethyst', size: 4, quantity: 1 },
    { stoneId: 'amethyst', size: 6, quantity: 1 },
    { stoneId: 'amethyst', size: 10, quantity: 1 }
  ]);
  assert.equal(result.subtotal, 200);
  assert.equal(result.finalPrice, 160);
});

test('variant quantities aggregate and malformed or mismatched variants reject', () => {
  const sequence = [component(4), component(4), component(6), component(6)];
  const result = validate(sequence, { stoneVariants: [{ stoneId: 'amethyst', size: 4, quantity: 2 }, { stoneId: 'amethyst', size: 6, quantity: 2 }] });
  assert.equal(result.stoneVariants[0].quantity, 2);
  assert.throws(() => validate(sequence, { stoneVariants: [{ stoneId: 'amethyst', size: 4, quantity: 0 }] }), /malformed/);
  assert.throws(() => validate(sequence, { stoneVariants: [{ stoneId: 'amethyst', size: 4, quantity: 1 }, { stoneId: 'amethyst', size: 6, quantity: 2 }] }), /do not match/);
});

test('mixed, unknown, unsupported, invalid price, and browser-supplied prices reject or are ignored', () => {
  assert.throws(() => validate([component('mixed')]), /physical size/);
  assert.throws(() => validate([{ type: 'stone', stoneId: 'unknown', size: 4 }]), /unavailable/);
  assert.throws(() => validate([component(8)]), /physical size/);
  const unsupportedCatalogs = { ...catalogs, stone: new Map([['amethyst', { ...stone, sizes: [6] }]]) };
  assert.throws(() => validateAuthoritativeOrder({ clientOrder: order([component(4)]), catalogs: unsupportedCatalogs, settings }), /unavailable/);
  const missingPriceCatalogs = { ...catalogs, stone: new Map([['amethyst', { ...stone, p4: null }]]) };
  assert.throws(() => validateAuthoritativeOrder({ clientOrder: order([component(4)]), catalogs: missingPriceCatalogs, settings }), /invalid pricing/);
  const result = validate([component(10), component(10)], { itemizedBilling: [{ unitPrice: 1, totalPrice: 1 }], totalPrice: 1 });
  assert.equal(result.itemizedBilling[0].unitPrice, 100);
  assert.equal(result.finalPrice, 160);
});

test('authoritative totals preserve existing charm and spacer pricing', () => {
  const result = validate([component(10), { type: 'spacer', spacerId: 'spacer-1' }, { type: 'charm', charmId: 'charm-1' }]);
  assert.equal(result.subtotal, 325);
  assert.equal(result.finalPrice, 260);
  assert.equal(result.itemizedBilling.find((item) => item.type === 'spacer').unitPrice, 25);
  assert.equal(result.itemizedBilling.find((item) => item.type === 'charm').unitPrice, 200);
});

test('authoritative fit accepts inclusive boundaries and ignores browser fitStatus', () => {
  const underTarget = validate([component(10), { type: 'spacer', spacerId: 'spacer-9' }], { fitStatus: 'overflow' });
  assert.equal(underTarget.geometry.differenceMm, -1);
  assert.equal(underTarget.geometry.fitStatus, 'within_tolerance');
  const overTarget = validate([component(10), component(10), { type: 'spacer', spacerId: 'spacer-1' }], { fitStatus: 'underfill' });
  assert.equal(overTarget.geometry.differenceMm, 1);
  assert.equal(overTarget.geometry.fitStatus, 'within_tolerance');
  assert.throws(() => validate([component(10), { type: 'spacer', spacerId: 'spacer-9' }], { wristSize: 0.501 }), /below/);
  assert.throws(() => validate([component(10), component(10), { type: 'spacer', spacerId: 'spacer-1' }], { wristSize: 0.499 }), /exceeds/);
});

test('legacy fixed 4/6/10 component payloads remain valid without stoneVariants', () => {
  const fixedFour = validateAuthoritativeOrder({ clientOrder: { wristSize: 0.5, beadSize: '4', braceletSequence: Array.from({ length: 5 }, () => ({ type: 'stone', stoneId: 'amethyst' })) }, catalogs, settings });
  const fixedSix = validateAuthoritativeOrder({ clientOrder: { wristSize: 0.5, beadSize: '6', braceletSequence: Array.from({ length: 3 }, () => ({ type: 'stone', stoneId: 'amethyst' })).concat([{ type: 'spacer', spacerId: 'spacer-1' }, { type: 'spacer', spacerId: 'spacer-1' }]) }, catalogs, settings });
  const fixedTen = validateAuthoritativeOrder({ clientOrder: { wristSize: 0.5, beadSize: '10', braceletSequence: [{ type: 'stone', stoneId: 'amethyst' }, { type: 'stone', stoneId: 'amethyst' }] }, catalogs, settings });
  assert.deepEqual(fixedFour.stoneVariants, [{ stoneId: 'amethyst', size: 4, quantity: 5 }]);
  assert.equal(fixedSix.stoneVariants[0].size, 6);
  assert.equal(fixedTen.stoneVariants[0].size, 10);
});

test('server integration retains the existing Stripe, webhook, paid-order, and LINE flows', async () => {
  const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(server, /const \{ validateAuthoritativeOrder \} = require\('\.\/server-order-validation\.js'\);/);
  assert.match(server, /const validated = validateAuthoritativeOrder\(\{ clientOrder, catalogs, settings \}\);/);
  assert.match(server, /async function createStripeCheckoutSession/);
  assert.match(server, /async function applyStripeCheckoutPaymentEvent/);
  assert.match(server, /stripePaymentStatus: 'paid'/);
  assert.match(server, /notifyPaidOrderLineRecipients/);
  for (const forbidden of ['UAT_BACKEND', 'lucky-colorstone-uat', 'fixture-only', 'UAT Step 4', 'debugSticky', 'UAT banner']) assert.equal(server.includes(forbidden), false);
});
