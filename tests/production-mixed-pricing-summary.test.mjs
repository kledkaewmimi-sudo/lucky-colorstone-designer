import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getStonePriceForSize } from '../data.js';
import {
  aggregateStoneVariants,
  createStoneVariantPayload
} from '../mixed-order-model.js';

const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const catalog = [{ id: 'amethyst', name: 'Amethyst', nameTh: 'Amethyst TH', p4: 40, p6: 60, p10: 100 }];
const stone = (size, uniqueId) => ({ componentType: 'stone', stoneId: 'amethyst', size, uniqueId });

test('production pricing resolves only p4, p6, and p10 for stored physical sizes', () => {
  assert.equal(getStonePriceForSize(catalog[0], 4), 40);
  assert.equal(getStonePriceForSize(catalog[0], 6), 60);
  assert.equal(getStonePriceForSize(catalog[0], 10), 100);
});

test('invalid physical sizes are not coerced into a billable stone variant', () => {
  const variants = aggregateStoneVariants([stone('mixed', 'a'), stone(4, 'b')], catalog, getStonePriceForSize);
  assert.deepEqual(Object.keys(variants), ['amethyst_4']);
  assert.equal(variants.amethyst_4.quantity, 1);
  assert.equal(variants.amethyst_4.unitPrice, 40);
});

test('mixed variants aggregate by stoneId and physical size, not stoneId alone', () => {
  const aggregation = aggregateStoneVariants([stone(4, 'a'), stone(4, 'b'), stone(10, 'c')], catalog, getStonePriceForSize);
  assert.deepEqual(Object.keys(aggregation), ['amethyst_4', 'amethyst_10']);
  assert.equal(aggregation.amethyst_4.quantity, 2);
  assert.equal(aggregation.amethyst_4.unitPrice, 40);
  assert.equal(aggregation.amethyst_4.totalPrice, 80);
  assert.equal(aggregation.amethyst_10.quantity, 1);
  assert.equal(aggregation.amethyst_10.totalPrice, 100);
  assert.deepEqual(createStoneVariantPayload(aggregation), [
    { stoneId: 'amethyst', size: 4, quantity: 2 },
    { stoneId: 'amethyst', size: 10, quantity: 1 }
  ]);
});

test('mixed grand total preserves existing charm and spacer prices alongside strict stone totals', () => {
  const variants = aggregateStoneVariants([stone(4, 'a'), stone(6, 'b'), stone(10, 'c')], catalog, getStonePriceForSize);
  const stonesSubtotal = Object.values(variants).reduce((sum, variant) => sum + variant.totalPrice, 0);
  const existingCharmPrice = 200;
  const existingSpacerPrice = 25;
  assert.equal(stonesSubtotal, 200);
  assert.equal(stonesSubtotal + existingCharmPrice + existingSpacerPrice, 425);
});

test('fixed 4, 6, and 10 pricing remains physical and unchanged', () => {
  for (const [size, expected] of [[4, 80], [6, 120], [10, 200]]) {
    const variants = aggregateStoneVariants([stone(size, 'a'), stone(size, 'b')], catalog, getStonePriceForSize);
    const stonesSubtotal = Object.values(variants).reduce((sum, variant) => sum + variant.totalPrice, 0);
    assert.equal(stonesSubtotal, expected);
  }
});

test('Step 4 builds its summary from canonical variants while the server remains price-authoritative', () => {
  assert.match(app, /import \{ aggregateStoneVariants, createStoneVariantPayload \} from '\.\/mixed-order-model\.js';/);
  assert.match(app, /function buildCheckoutSummary\(\)/);
  assert.match(app, /aggregatedStones = aggregateStoneVariants\(selectedStoneItems, STONES, getStonePriceForSize\);/);
  assert.match(app, /const stoneVariants = createStoneVariantPayload\(aggregatedStones\);/);
  assert.match(app, /const stonesSubtotal = stoneBilling\.reduce/);
  assert.match(app, /const charmData = buildSelectedCharmOrderData\(\);/);
  assert.match(app, /const spacerData = buildSelectedSpacerOrderData\(\);/);
});
