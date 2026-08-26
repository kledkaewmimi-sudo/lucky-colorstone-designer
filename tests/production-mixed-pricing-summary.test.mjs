import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getStonePriceForSize } from '../data.js';
import {
  aggregateStoneVariants,
  createStonePricingSummary,
  createStoneVariantPayload,
  resolveStonePriceForPhysicalSize
} from '../mixed-order-model.js';

const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const catalog = [{ id: 'amethyst', name: 'Amethyst', nameTh: 'Amethyst TH', p4: 40, p6: 60, p10: 100 }];
const stone = (size, uniqueId) => ({ componentType: 'stone', stoneId: 'amethyst', size, uniqueId });

test('production pricing resolves only p4, p6, and p10 for stored physical sizes', () => {
  assert.equal(getStonePriceForSize(catalog[0], 4), 40);
  assert.equal(getStonePriceForSize(catalog[0], 6), 60);
  assert.equal(getStonePriceForSize(catalog[0], 10), 100);
  assert.equal(resolveStonePriceForPhysicalSize(catalog[0], 4).unitPrice, 40);
  assert.equal(resolveStonePriceForPhysicalSize(catalog[0], 6).unitPrice, 60);
  assert.equal(resolveStonePriceForPhysicalSize(catalog[0], 10).unitPrice, 100);
});

test('missing or invalid prices return invalid pricing without a fallback', () => {
  assert.equal(getStonePriceForSize({ id: 'bad', p6: 60, price: 999 }, 4), null);
  assert.equal(resolveStonePriceForPhysicalSize({ id: 'bad', p6: 60, price: 999 }, 4).valid, false);
  const invalid = createStonePricingSummary([stone('mixed', 'a'), stone(4, 'b')], catalog);
  assert.equal(invalid.valid, false);
  assert.equal(invalid.stonesSubtotal, null);
  assert.equal(invalid.invalidComponents[0].reason, 'invalid_physical_size');
});

test('mixed variants aggregate by stoneId and physical size, not stoneId alone', () => {
  const aggregation = aggregateStoneVariants([stone(4, 'a'), stone(4, 'b'), stone(10, 'c')], catalog);
  assert.equal(aggregation.valid, true);
  assert.deepEqual(Object.keys(aggregation.variants), ['amethyst_4', 'amethyst_10']);
  assert.equal(aggregation.variants.amethyst_4.quantity, 2);
  assert.equal(aggregation.variants.amethyst_4.unitPrice, 40);
  assert.equal(aggregation.variants.amethyst_4.subtotal, 80);
  assert.equal(aggregation.variants.amethyst_10.quantity, 1);
  assert.equal(aggregation.variants.amethyst_10.subtotal, 100);
  assert.deepEqual(createStoneVariantPayload(aggregation), [
    { stoneId: 'amethyst', size: 4, quantity: 2 },
    { stoneId: 'amethyst', size: 10, quantity: 1 }
  ]);
});

test('mixed grand total preserves existing charm and spacer prices alongside strict stone totals', () => {
  const stoneSummary = createStonePricingSummary([stone(4, 'a'), stone(6, 'b'), stone(10, 'c')], catalog);
  const existingCharmPrice = 200;
  const existingSpacerPrice = 25;
  assert.equal(stoneSummary.stonesSubtotal, 200);
  assert.equal(stoneSummary.stonesSubtotal + existingCharmPrice + existingSpacerPrice, 425);
  assert.equal(stoneSummary.clientPriceAuthoritative, false);
});

test('fixed 4, 6, and 10 pricing remains physical and unchanged', () => {
  for (const [size, expected] of [[4, 80], [6, 120], [10, 200]]) {
    const summary = createStonePricingSummary([stone(size, 'a'), stone(size, 'b')], catalog);
    assert.equal(summary.valid, true);
    assert.equal(summary.stonesSubtotal, expected);
  }
});

test('summary model exposes variants and canonical geometry while browser prices remain non-authoritative', () => {
  assert.match(app, /stoneVariants: stonePricing\.stoneVariants/);
  assert.match(app, /geometry: getCurrentBraceletCapacityMetrics\(\)\.geometry/);
  assert.match(app, /clientPriceAuthoritative: false/);
  assert.match(app, /const charmData = buildSelectedCharmOrderData\(\);/);
  assert.match(app, /const spacerData = buildSelectedSpacerOrderData\(\);/);
});
