import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  aggregateStoneVariants,
  createStoneVariantPayload
} from '../mixed-order-model.js';
import {
  resolveAuthoritativeStoneVariant,
  validateAuthoritativeOrder
} from '../../../reports/production/phase2-24b-release-preparation/backend-candidate/server-order-validation.js';

const root = path.resolve(import.meta.dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const crm = fs.readFileSync(path.join(root, 'crm.js'), 'utf8');
const data = fs.readFileSync(path.join(root, 'data.js'), 'utf8');

const pearl = {
  id: 'phase27-freshwater-pearl',
  sizes: [10],
  p4: 75,
  p6: 75,
  p10: 75,
  pricing: { base: 75 },
  selectionGroupMm: 10,
  nominalProductSizeMm: 12,
  braceletPackingMm: 12,
  packingLengthMm: 12,
  availability: { isActive: true, inStock: true, stockQty: 1000 },
  isActive: true,
  inStock: true
};

test('Freshwater Pearl serializes by 10 mm selection group while preserving 12/12 physical metadata', () => {
  const aggregated = aggregateStoneVariants([
    ...Array.from({ length: 14 }, () => ({
        stoneId: pearl.id,
        size: 12,
        sizeMm: 12,
        selectionGroupMm: 10,
        nominalProductSizeMm: 12,
        braceletPackingMm: 12
      }))
  ], [pearl], () => 75);
  const variants = createStoneVariantPayload(aggregated);
  assert.deepEqual(variants, [{
    stoneId: pearl.id,
    size: 10,
    selectionGroupMm: 10,
    nominalProductSizeMm: 12,
    braceletPackingMm: 12,
    quantity: 14
  }]);

  for (const beadSize of ['10', 'mixed']) {
    const validated = validateAuthoritativeOrder({
      clientOrder: {
        wristSize: 15.3,
        beadSize,
        braceletSequence: Array.from({ length: 14 }, () => ({
          type: 'stone',
          stoneId: pearl.id,
          size: 10,
          physicalSizeMm: 12,
          selectionGroupMm: 10,
          nominalProductSizeMm: 12,
          braceletPackingMm: 12
        })),
        stoneVariants: variants,
        checkoutSummary: { finalPrice: 1050 }
      },
      catalogs: {
        stone: new Map([[pearl.id, pearl]]),
        charm: new Map(),
        spacer: new Map()
      },
      settings: { discountEnabled: false, globalDiscountPercent: 0 }
    });
    assert.equal(validated.itemizedBilling[0].size, 10);
    assert.equal(validated.itemizedBilling[0].nominalProductSizeMm, 12);
    assert.equal(validated.itemizedBilling[0].braceletPackingMm, 12);
    assert.equal(validated.geometry.usedLengthMm, 168);
    assert.equal(validated.finalPrice, 1050);
  }
});

test('Pearl remains protected from fabricated physical sizes and client prices', () => {
  assert.throws(() => validateAuthoritativeOrder({
    clientOrder: {
      wristSize: 14.5,
      beadSize: '10',
      braceletSequence: [{ type: 'stone', stoneId: pearl.id, size: 12 }],
      stoneVariants: [{ stoneId: pearl.id, size: 12, quantity: 1 }]
    },
    catalogs: { stone: new Map([[pearl.id, pearl]]), charm: new Map(), spacer: new Map() },
    settings: { discountEnabled: false, globalDiscountPercent: 0 }
  }), /physical size 4, 6, or 10|Stone variants are malformed/);
});

test('Existing 4, 6, and 10 mm variants and authoritative prices remain valid', () => {
  for (const size of [4, 6, 10]) {
    const stone = {
      id: `test-${size}`,
      sizes: [size],
      [`p${size}`]: 40 + size,
      pricing: { base: 40 + size },
      availability: { isActive: true, inStock: true },
      isActive: true,
      inStock: true
    };
    assert.deepEqual(resolveAuthoritativeStoneVariant({ size }, stone), {
      size,
      unitPrice: 40 + size,
      selectionGroupMm: size,
      nominalProductSizeMm: size,
      braceletPackingMm: size
    });
  }
});

test('Production client includes checkout, order race, availability, and CRM category safeguards', () => {
  assert.match(app, /size: selectionGroupMm/);
  assert.match(app, /physicalSizeMm: component\.sizeMm/);
  assert.match(data, /ordersFetchSequence/);
  assert.match(data, /mutationRevisionAtStart !== ordersMutationRevision/);
  assert.match(crm, /crmOrdersPageRequestSequence/);
  assert.match(data, /The server did not confirm the saved order status and tracking number/);
  assert.match(crm, /CRM_SPACER_PRESENTED_CHARM_IDS/);
  assert.match(crm, /inventoryType !== activeType/);
  assert.match(data, /nestedInStock \?\? flatInStock/);
  assert.match(crm, /const availability = \{[\s\S]*patch\.availability/);
});
