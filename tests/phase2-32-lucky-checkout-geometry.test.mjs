import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateAuthoritativeOrder } from '../server-order-validation.js';

const settings = { globalDiscountPercent: 20, discountEnabled: true };
const stone = {
  id: 'golden_rutile',
  sizes: [4, 6, 10],
  p4: 120,
  p6: 120,
  p10: 120,
  inStock: true
};

const inlineCharm = (id, footprintMm, price) => ({
  id,
  type: id === 'cl01' ? 'bee_heart' : 'takrud_lukshmi',
  inStock: true,
  pricing: { base: price },
  business: {
    sizeCm: footprintMm / 10,
    footprintMm,
    threadingOccupancyMm: 0
  }
});

const charms = [
  inlineCharm('tg01', 30, 590),
  inlineCharm('cl01', 4.2, 290),
  { ...inlineCharm('px01', 24, 390), type: 'pi_xiu' },
  { ...inlineCharm('tg02', 30, 450), type: 'takrud_ganesha' },
  { ...inlineCharm('tg03', 30, 450), type: 'takrud_ganesha' },
  { ...inlineCharm('bh01', 2, 190), type: 'bee_heart' },
  { ...inlineCharm('bh02', 2, 190), type: 'bee_heart' },
  { ...inlineCharm('bh03', 2, 190), type: 'bee_heart' }
];

const catalogs = {
  stone: new Map([[stone.id, stone]]),
  charm: new Map(charms.map((charm) => [charm.id, charm])),
  spacer: new Map()
};

const stoneComponents = Array.from({ length: 16 }, (_, index) => ({
  type: 'stone',
  stoneId: 'golden_rutile',
  size: 10,
  uniqueId: index + 1
}));

const reportedOrder = {
  wristSize: 18,
  beadSize: '10',
  braceletSequence: [
    { type: 'charm', charmId: 'tg01', uniqueId: 'anchored-tg01' },
    ...stoneComponents,
    { type: 'charm', charmId: 'cl01', uniqueId: 'loop-cl01' }
  ],
  stoneVariants: [{ stoneId: 'golden_rutile', size: 10, quantity: 16 }]
};

test('Phase 2.32 reported Lucky bracelet validates with inline/anchored charm footprints', () => {
  const result = validateAuthoritativeOrder({
    clientOrder: reportedOrder,
    catalogs,
    settings
  });

  assert.equal(result.geometry.targetLengthMm, 195);
  assert.equal(result.geometry.usedLengthMm, 194.2);
  assert.equal(result.completionEligibility.complete, true);
  assert.equal(result.geometry.fitStatus, 'COMPLETE_DISCRETE_CAPACITY');
  assert.deepEqual(
    result.itemizedBilling.filter((item) => item.type === 'charm').map((item) => item.id),
    ['tg01', 'cl01']
  );
  assert.equal(result.finalPrice, 2240);
});

test('zero threading occupancy is optional for non-pendant charm types', () => {
  for (const charm of charms) {
    const targetLengthMm = 255;
    const stoneCount = Math.floor((targetLengthMm - charm.business.footprintMm) / 10);
    const sequence = [
      { type: 'charm', charmId: charm.id, uniqueId: `first-${charm.id}` },
      ...Array.from({ length: stoneCount }, (_, index) => ({
        type: 'stone',
        stoneId: 'golden_rutile',
        size: 10,
        uniqueId: `stone-${charm.id}-${index}`
      }))
    ];
    const result = validateAuthoritativeOrder({
      clientOrder: { wristSize: 24, beadSize: '10', braceletSequence: sequence },
      catalogs,
      settings
    });
    assert.equal(
      result.itemizedBilling.find((item) => item.type === 'charm').size,
      charm.business.footprintMm,
      charm.id
    );
  }
});

test('every active non-pendant charm in the Production catalog shape remains checkoutable', async () => {
  const records = JSON.parse(await readFile(new URL('../data/charms.json', import.meta.url), 'utf8'));
  const eligible = records.filter((item) => (
    item?.type !== 'pendant'
    && item?.availability?.isActive !== false
    && item?.availability?.inStock !== false
    && Number(item?.business?.footprintMm) > 0
  ));

  assert.ok(eligible.length >= 14, `expected all active Lucky-selectable charms, found ${eligible.length}`);
  for (const item of eligible) {
    const footprintMm = Number(item.business.footprintMm);
    const stoneCount = Math.floor((195 - footprintMm) / 10);
    const charm = {
      ...item,
      business: { ...item.business, threadingOccupancyMm: 0 }
    };
    const result = validateAuthoritativeOrder({
      clientOrder: {
        wristSize: 18,
        beadSize: '10',
        braceletSequence: [
          { type: 'charm', charmId: item.id, uniqueId: `charm-${item.id}` },
          ...Array.from({ length: stoneCount }, (_, index) => ({
            type: 'stone',
            stoneId: 'golden_rutile',
            size: 10,
            uniqueId: `${item.id}-${index}`
          }))
        ]
      },
      catalogs: {
        stone: catalogs.stone,
        charm: new Map([[item.id, charm]]),
        spacer: new Map()
      },
      settings
    });
    assert.equal(
      result.itemizedBilling.find((line) => line.type === 'charm').size,
      footprintMm,
      item.id
    );
  }
});

test('a threaded pendant still requires verified positive threading occupancy', () => {
  const pendant = {
    id: 'phase27-gold-heart-pendant',
    type: 'pendant',
    inStock: true,
    pricing: { base: 790 },
    business: {
      sizeCm: 1.9,
      footprintMm: 7,
      threadingOccupancyMm: 0
    }
  };
  const pendantCatalog = {
    ...catalogs,
    charm: new Map([...catalogs.charm, [pendant.id, pendant]])
  };
  const sequence = [
    { type: 'charm', charmId: pendant.id, uniqueId: 'heart' },
    ...stoneComponents
  ];
  assert.throws(
    () => validateAuthoritativeOrder({
      clientOrder: { wristSize: 18, beadSize: '10', braceletSequence: sequence },
      catalogs: pendantCatalog,
      settings
    }),
    /invalid threading geometry/
  );
});

test('Heart and Star threaded pendants use their verified loop occupancy', () => {
  const pendants = [
    {
      id: 'phase27-gold-heart-pendant',
      type: 'pendant',
      inStock: true,
      pricing: { base: 790 },
      business: { sizeCm: 1.9, footprintMm: 7, threadingOccupancyMm: 4 }
    },
    {
      id: 'phase27-gold-star-pendant',
      type: 'pendant',
      inStock: true,
      pricing: { base: 690 },
      business: { sizeCm: 1.4, footprintMm: 10, threadingOccupancyMm: 2 }
    }
  ];
  for (const pendant of pendants) {
    const occupancyMm = pendant.business.threadingOccupancyMm;
    const stoneCount = Math.floor((195 - occupancyMm) / 10);
    const result = validateAuthoritativeOrder({
      clientOrder: {
        wristSize: 18,
        beadSize: '10',
        braceletSequence: [
          { type: 'charm', charmId: pendant.id, uniqueId: pendant.id },
          ...Array.from({ length: stoneCount }, (_, index) => ({
            type: 'stone',
            stoneId: 'golden_rutile',
            size: 10,
            uniqueId: `${pendant.id}-${index}`
          }))
        ]
      },
      catalogs: {
        stone: catalogs.stone,
        charm: new Map([[pendant.id, pendant]]),
        spacer: new Map()
      },
      settings
    });
    assert.equal(
      result.itemizedBilling.find((line) => line.type === 'charm').size,
      occupancyMm
    );
  }
});

test('unsupported 8 mm stone variants remain rejected', () => {
  assert.throws(
    () => validateAuthoritativeOrder({
      clientOrder: {
        wristSize: 18,
        beadSize: '8',
        braceletSequence: [{ type: 'stone', stoneId: 'golden_rutile', size: 8 }]
      },
      catalogs,
      settings
    }),
    /physical size 4, 6, or 10/
  );
});
