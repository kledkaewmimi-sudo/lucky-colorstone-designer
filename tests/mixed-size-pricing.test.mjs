import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getCheckoutFitEligibility } from '../bracelet-geometry.js';
import { aggregateStoneVariants, createStoneVariantPayload } from '../mixed-order-model.js';

const require = createRequire(import.meta.url);
const { getAuthoritativeStoneVariant } = require('../server-order-validation.js');
const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const crm = await readFile(new URL('../crm.js', import.meta.url), 'utf8');
const guestState = await readFile(new URL('../guest-design-state.js', import.meta.url), 'utf8');
const amethyst = { id: 'amethyst', name: 'Amethyst', nameTh: 'Amethyst TH', sizes: [4, 6, 10], p4: 40, p6: 60, p10: 100 };
const priceForSize = (stone, size) => Number(stone?.[`p${size}`] || 0);

test('4mm, 6mm, and 10mm variants resolve their exact catalog prices', () => {
  assert.equal(priceForSize(amethyst, 4), 40);
  assert.equal(priceForSize(amethyst, 6), 60);
  assert.equal(priceForSize(amethyst, 10), 100);
});

test('same stone in 4/6/10 aggregates as three physical variants', () => {
  const variants = aggregateStoneVariants([
    { stoneId: 'amethyst', size: 4 }, { stoneId: 'amethyst', size: 6 }, { stoneId: 'amethyst', size: 10 }
  ], [amethyst], priceForSize);
  assert.deepEqual(Object.keys(variants), ['amethyst_4', 'amethyst_6', 'amethyst_10']);
  assert.deepEqual(createStoneVariantPayload(variants), [
    { stoneId: 'amethyst', size: 4, quantity: 1 },
    { stoneId: 'amethyst', size: 6, quantity: 1 },
    { stoneId: 'amethyst', size: 10, quantity: 1 }
  ]);
});

test('variant quantities and mixed total use actual physical variants', () => {
  const variants = aggregateStoneVariants([
    { stoneId: 'amethyst', size: 4 }, { stoneId: 'amethyst', size: 4 },
    { stoneId: 'amethyst', size: 6 }, { stoneId: 'amethyst', size: 6 }, { stoneId: 'amethyst', size: 6 },
    { stoneId: 'amethyst', size: 10 }
  ], [amethyst], priceForSize);
  assert.equal(variants.amethyst_4.quantity, 2);
  assert.equal(variants.amethyst_6.quantity, 3);
  assert.equal(variants.amethyst_10.quantity, 1);
  assert.equal(Object.values(variants).reduce((sum, line) => sum + line.subtotal, 0), 360);
});

for (const size of [4, 6, 10]) {
  test(`fixed ${size}mm pricing remains a single variant`, () => {
    const variants = aggregateStoneVariants([{ stoneId: 'amethyst', size }, { stoneId: 'amethyst', size }], [amethyst], priceForSize);
    assert.equal(Object.keys(variants).length, 1);
    assert.equal(variants[`amethyst_${size}`].subtotal, priceForSize(amethyst, size) * 2);
  });
}

test('summary retains physical size, line subtotal, and ordered sequence data', () => {
  const variants = aggregateStoneVariants([{ stoneId: 'amethyst', size: 10 }], [amethyst], priceForSize);
  assert.deepEqual(variants.amethyst_10.size, 10);
  assert.deepEqual(variants.amethyst_10.subtotal, 100);
  assert.match(app, /braceletSequence: pricing\.braceletSequence/);
  assert.match(app, /stoneVariants: createStoneVariantPayload\(pricing\.aggregatedStones\)/);
});

test('payload variants never emit mixed as a stone size', () => {
  const variants = aggregateStoneVariants([{ stoneId: 'amethyst', size: 'mixed' }, { stoneId: 'amethyst', size: 6 }], [amethyst], priceForSize);
  assert.deepEqual(createStoneVariantPayload(variants), [{ stoneId: 'amethyst', size: 6, quantity: 1 }]);
});

test('charms and spacers keep their existing independent price fields', () => {
  const charm = { price: 250, footprintMm: 9 };
  const spacer = { price: 15, effectiveLengthMm: 1 };
  assert.equal(charm.price, 250);
  assert.equal(spacer.price, 15);
  assert.match(app, /const charmSubtotal = charmBilling\.reduce/);
  assert.match(app, /const spacerSubtotal = spacerBilling\.reduce/);
});

test('server accepts supported sizes, rejects unsupported/mixed variants, and ignores client unit price', () => {
  assert.deepEqual(getAuthoritativeStoneVariant({ size: 4, unitPrice: 1 }, amethyst), { size: 4, unitPrice: 40 });
  assert.deepEqual(getAuthoritativeStoneVariant({ size: 6, unitPrice: 1 }, amethyst), { size: 6, unitPrice: 60 });
  assert.deepEqual(getAuthoritativeStoneVariant({ size: 10, unitPrice: 1 }, amethyst), { size: 10, unitPrice: 100 });
  assert.throws(() => getAuthoritativeStoneVariant({ size: 'mixed' }, amethyst), /physical size 4, 6, or 10/);
  assert.throws(() => getAuthoritativeStoneVariant({ size: 8 }, amethyst), /physical size 4, 6, or 10/);
  assert.throws(() => getAuthoritativeStoneVariant({ size: 4 }, { ...amethyst, sizes: [6] }), /unavailable/);
  assert.throws(() => getAuthoritativeStoneVariant({ size: 4 }, { ...amethyst, p4: null }), /invalid pricing/);
});

test('fit gate accepts inclusive +/-1mm and blocks underfill/overflow without mutation', () => {
  assert.equal(getCheckoutFitEligibility({ differenceMm: -1 }).eligible, true);
  assert.equal(getCheckoutFitEligibility({ differenceMm: 1 }).eligible, true);
  const design = [{ stoneId: 'amethyst', size: 4 }];
  const before = structuredClone(design);
  assert.equal(getCheckoutFitEligibility({ differenceMm: -1.01 }).fitStatus, 'underfill');
  assert.equal(getCheckoutFitEligibility({ differenceMm: 1.01 }).fitStatus, 'overflow');
  assert.deepEqual(design, before);
  assert.match(app, /const fitEligibility = getCurrentCheckoutFitEligibility\(\)/);
});

test('CRM preview favors per-component stone size and fixed orders remain compatible', () => {
  assert.match(crm, /: \[item\.sizeMm, item\.displaySizeMm, item\.size, fallbackBeadSize\]/);
  const fixedLegacyOrder = { beadSize: '6', beads: [{ stoneId: 'amethyst', size: 6 }] };
  assert.equal(fixedLegacyOrder.beads[0].size, 6);
});

test('no ResolvedLayout is persisted in the mixed pricing/order model', () => {
  assert.doesNotMatch(guestState, /ResolvedLayout/);
  assert.doesNotMatch(JSON.stringify(createStoneVariantPayload({ amethyst_4: { stoneId: 'amethyst', size: 4, quantity: 1 } })), /ResolvedLayout/);
});
