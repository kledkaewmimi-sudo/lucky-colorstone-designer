import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createLumiCatalogSnapshot } from '../lumi/contracts/catalog-snapshot.js';
import { generateLumiRecommendation } from '../lumi/service/index.js';
import { prepareLumiAcceptance } from '../lumi/integration/index.js';
import { filterLumiCatalogEligibility, LUMI_ELIGIBILITY_REASONS } from '../lumi/scoring/eligibility.js';
import { prepareLumiStep3Import } from '../lumi/import/step3-import.js';
import { buildLumiDesignContract } from '../lumi/integration/index.js';

// Owner policy 2026-10-11: an active, replenishable material stays eligible for DESIGN while its
// stock is temporarily zero; permanently inactive, deleted, discontinued or non-existent materials
// stay excluded, and checkout keeps its own authoritative stock/pricing validation.
const CAND = new URL('..', import.meta.url);
const read = (name) => JSON.parse(readFileSync(new URL(`data/${name}`, CAND), 'utf8').replace(/^\uFEFF/, ''));
const bundled = () => ({ stones: read('stones.json'), charms: read('charms.json'), spacers: read('spacers.json') });
const zeroStock = (catalog) => ({
  stones: catalog.stones.map((stone) => ({ ...stone, inStock: false, stockQty: 0, stock_qty: 0, availability: { ...(stone.availability || {}), inStock: false, stockQty: 0, stock_qty: 0 } })),
  charms: catalog.charms.map((charm) => ({ ...charm, inStock: false, stockQty: 0, stock_qty: 0, availability: { ...(charm.availability || {}), inStock: false, stockQty: 0, stock_qty: 0 } })),
  spacers: catalog.spacers.map((spacer) => ({ ...spacer, inStock: false, stockQty: 0, stock_qty: 0, availability: { ...(spacer.availability || {}), inStock: false, stockQty: 0, stock_qty: 0 } }))
});
const context = (bead = '6') => ({ wristSizeCm: 16, beadMode: bead, mixedPlacingSize: bead === 'mixed' ? 6 : null });
const answers = (goals, style, weekday = 'monday') => ({ weekday, birthDate: 9, birthMonth: 9, birthYear: 1999, style, goals });
const recommended = (snapshot, goals, style, bead = '6', weekday = 'monday') => generateLumiRecommendation({
  answers: answers(goals, style, weekday),
  context: context(bead),
  catalogSnapshot: snapshot
});
const accepted = (snapshot, output, bead = '6') => prepareLumiAcceptance({
  recommendation: output.recommendation,
  state: { wristSize: 16, beadSize: bead, mixedPlacingSize: bead === 'mixed' ? 6 : null },
  snapshot
});

test('the snapshot separates design activity from fulfillment availability', () => {
  const snapshot = createLumiCatalogSnapshot({
    stones: [
      { id: 'active_zero_stock', sizes: [4, 6, 10], p4: 10, p6: 20, p10: 30, inStock: false, stockQty: 0, isActive: true },
      { id: 'inactive_stone', sizes: [4, 6, 10], p4: 10, p6: 20, p10: 30, inStock: true, stockQty: 5, isActive: false }
    ],
    charms: [{ id: 'active_zero_stock_charm', type: 'takrud_lukshmi', pricing: { base: 100 }, business: { footprintMm: 20 }, inStock: false, stockQty: 0, isActive: true }],
    spacers: []
  });
  const active = snapshot.stones.find((stone) => stone.id === 'active_zero_stock');
  assert.equal(active.active, true, 'an active stone with zero stock stays design-active');
  assert.equal(active.inStock, false, 'the fulfillment flag still reports zero stock');
  assert.equal(active.available, false);
  assert.equal(active.stockQty, 0);

  const inactive = snapshot.stones.find((stone) => stone.id === 'inactive_stone');
  assert.equal(inactive.active, false);
  assert.equal(inactive.inStock, false);

  const charm = snapshot.charms.find((entry) => entry.id === 'active_zero_stock_charm');
  assert.equal(charm.active, true);
  assert.equal(charm.inStock, false);
});

test('design eligibility blocks permanent conditions only and keeps zero stock eligible', () => {
  const snapshot = createLumiCatalogSnapshot({
    stones: [
      { id: 'amethyst', sizes: [4, 6, 10], p4: 40, p6: 60, p10: 100, inStock: false, stockQty: 0, isActive: true },
      { id: 'pyrite', sizes: [4, 6, 10], p4: 40, p6: 60, p10: 100, inStock: true, stockQty: 9, isActive: true },
      { id: 'black_tourmaline', sizes: [4, 6, 10], p4: 40, p6: 60, p10: 100, inStock: true, stockQty: 4, isActive: false }
    ],
    charms: [],
    spacers: []
  });
  const profile = { weekday: 'monday', braceletContext: { beadMode: '6' }, style: 'stones_only', goals: [{ id: 'love' }] };
  const eligibility = filterLumiCatalogEligibility(profile, snapshot);
  const eligibleIds = eligibility.stones.eligible.map((entry) => entry.materialId);
  const excluded = new Map(eligibility.stones.excluded.map((entry) => [entry.materialId, entry.reasons]));

  assert.ok(eligibleIds.includes('amethyst'), 'zero stock must not exclude an active stone');
  const amethyst = eligibility.stones.eligible.find((entry) => entry.materialId === 'amethyst');
  assert.equal(amethyst.fulfillment, 'out_of_stock_now');
  // The scoring layer must not carry a stock quantity at all (scoring source hygiene).
  assert.equal('stockQty' in amethyst, false);
  assert.equal(eligibility.stones.eligible.every((entry) => !('stockQty' in entry)), true);
  const stocked = eligibility.stones.eligible.find((entry) => entry.materialId === 'pyrite') || null;
  assert.equal(stocked, null, 'pyrite is discontinued and must never be eligible');
  assert.ok(excluded.get('pyrite').includes(LUMI_ELIGIBILITY_REASONS.DISCONTINUED_MATERIAL));
  assert.ok(excluded.get('black_tourmaline').includes(LUMI_ELIGIBILITY_REASONS.CATALOG_INACTIVE));
  assert.equal(excluded.has('amethyst'), false);
  assert.equal(excluded.get('not_in_catalog') ?? null, null);
});

test('a deleted or unknown material is excluded, an inactive one never appears in a design', () => {
  const catalog = bundled();
  const snapshot = createLumiCatalogSnapshot({ ...catalog, stones: catalog.stones.filter((stone) => stone.id !== 'amethyst') });
  const profile = { weekday: 'monday', braceletContext: { beadMode: '6' }, style: 'stones_only', goals: [{ id: 'love' }] };
  const eligibility = filterLumiCatalogEligibility(profile, snapshot);
  const excluded = new Map(eligibility.stones.excluded.map((entry) => [entry.materialId, entry.reasons]));
  assert.ok(excluded.get('amethyst').includes(LUMI_ELIGIBILITY_REASONS.MATERIAL_UNKNOWN));
  assert.ok(!eligibility.stones.eligible.some((entry) => entry.materialId === 'amethyst'));

  const output = recommended(snapshot, ['love'], 'stones_only');
  assert.equal(output.status, 'RECOMMENDED');
  assert.ok(!output.recommendation.selected.sequence.some((component) => component.materialId === 'amethyst'));
});

test('a fully out-of-stock but active catalog still produces accepted designs for every bead mode', () => {
  const snapshot = createLumiCatalogSnapshot(zeroStock(bundled()));
  for (const bead of ['4', '6', '10', 'mixed']) {
    const output = recommended(snapshot, ['love', 'money', 'career', 'wellbeing', 'luck', 'protection'], 'with_charm', bead);
    assert.equal(output.status, 'RECOMMENDED', `bead ${bead}: ${output.code || ''}`);
    const acceptance = accepted(snapshot, output, bead);
    assert.equal(acceptance.status, 'READY_TO_ACCEPT', `bead ${bead}: ${acceptance.code || ''}`);
  }
});

test('the luck rule keeps Lucky Clover even when its stock is zero', () => {
  const catalog = bundled();
  const clover = catalog.charms.find((charm) => charm.id === 'cl01');
  assert.ok(clover, 'the clover fixture must exist');
  const zeroClover = { ...catalog, charms: catalog.charms.map((charm) => charm.id === 'cl01' ? { ...charm, inStock: false, stockQty: 0, stock_qty: 0, availability: { ...(charm.availability || {}), inStock: false, stockQty: 0, stock_qty: 0 } } : charm) };
  const snapshot = createLumiCatalogSnapshot(zeroClover);
  for (const goals of [['luck'], ['love', 'luck'], ['love', 'money', 'career', 'wellbeing', 'luck', 'protection']]) {
    const output = recommended(snapshot, goals, 'with_charm');
    assert.equal(output.status, 'RECOMMENDED', `${goals.join('+')}: ${output.code || ''}`);
    const charmIds = [...output.recommendation.selected.anchoredCharms.map((charm) => charm.materialId), ...output.recommendation.selected.sequence.filter((component) => component.componentType !== 'stone').map((component) => component.materialId)];
    assert.ok(charmIds.includes('cl01'), `${goals.join('+')} must still use Lucky Clover`);
    assert.equal(accepted(snapshot, output).status, 'READY_TO_ACCEPT');
    assert.equal(charmIds.includes('pyrite'), false);
  }
});

test('no accepted design ever contains pyrite or an inactive material', () => {
  const catalog = bundled();
  const inactive = catalog.stones.filter((stone) => stone.isActive === false || stone.inStock === false).map((stone) => stone.id);
  const snapshot = createLumiCatalogSnapshot(catalog);
  const outputs = [
    recommended(snapshot, ['money'], 'stones_only'),
    recommended(snapshot, ['luck'], 'stones_only', 'mixed'),
    recommended(snapshot, ['love', 'career'], 'with_charm', '10')
  ];
  for (const output of outputs) {
    assert.equal(output.status, 'RECOMMENDED');
    const materialIds = output.recommendation.selected.sequence.map((component) => component.materialId);
    assert.equal(materialIds.includes('pyrite'), false);
    for (const id of inactive) assert.equal(materialIds.includes(id), false, `${id} is inactive/out of stock in the fixture but appeared in a design`);
  }
});

test('the Step-3 import accepts a zero-stock but active material and still rejects an inactive one', () => {
  const catalog = zeroStock(bundled());
  const snapshot = createLumiCatalogSnapshot(catalog);
  const output = recommended(snapshot, ['money'], 'stones_only');
  const contract = buildLumiDesignContract(output.recommendation, { mixedPlacingSize: null });
  const prepared = prepareLumiStep3Import({ contract, state: { wristSize: 16, beadSize: '6', mixedPlacingSize: null }, snapshot });
  assert.equal(prepared.selectedStones.length > 0, true);

  const inactiveSnapshot = createLumiCatalogSnapshot({ ...catalog, stones: catalog.stones.map((stone) => stone.id === contract.bracelet.components.find((component) => component.type === 'stone')?.materialId ? { ...stone, isActive: false } : stone) });
  assert.throws(
    () => prepareLumiStep3Import({ contract, state: { wristSize: 16, beadSize: '6', mixedPlacingSize: null }, snapshot: inactiveSnapshot }),
    (error) => error.code === 'LUMI_IMPORT_MATERIAL_INACTIVE' || /INACTIVE/.test(String(error.code))
  );
});
