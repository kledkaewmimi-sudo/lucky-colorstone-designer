import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createLumiCatalogSnapshot } from '../lumi/contracts/catalog-snapshot.js';
import { generateLumiRecommendation } from '../lumi/service/index.js';
import { prepareLumiAcceptance, buildLumiDesignContract } from '../lumi/integration/index.js';
import { filterLumiCatalogEligibility, LUMI_ELIGIBILITY_REASONS } from '../lumi/scoring/eligibility.js';
import { prepareLumiStep3Import } from '../lumi/import/step3-import.js';
import { LUMI_ENGINE_EXCLUDED_STONE_IDS, isEngineExcludedStone } from '../lumi/knowledge/engine-excluded-stones.js';

// TASK B (five stones never selected) + TASK C (authoritative saleable sizes from payload.sizes).
const CAND = new URL('..', import.meta.url);
const read = (name) => JSON.parse(readFileSync(new URL(`data/${name}`, CAND), 'utf8').replace(/^\uFEFF/, ''));
const bundled = () => ({ stones: read('stones.json'), charms: read('charms.json'), spacers: read('spacers.json') });
// The live Supabase payload for rutilated_quartz carries sizes [10] while p4/p6 still hold prices; the
// bundled UAT snapshot predates that, so the authoritative shape is modelled explicitly here.
const liveShapedCatalog = () => {
  const catalog = bundled();
  const rutilated = catalog.stones.find((stone) => stone.id === 'rutilated_quartz');
  rutilated.sizes = [10];
  rutilated.p4 = 88;
  rutilated.p6 = 88;
  rutilated.p10 = 60;
  return catalog;
};
const context = (bead) => ({ wristSizeCm: 16, beadMode: bead, mixedPlacingSize: bead === 'mixed' ? 6 : null });
const recommend = (snapshot, goals, style, bead, weekday = 'monday') => generateLumiRecommendation({
  answers: { weekday, birthDate: 9, birthMonth: 9, birthYear: 1999, style, goals },
  context: context(bead),
  catalogSnapshot: snapshot
});
const selectedMaterials = (recommendation) => ({
  ids: [...recommendation.selected.sequence.map((component) => component.materialId), ...recommendation.selected.anchoredCharms.map((charm) => charm.materialId)],
  stonePairs: recommendation.selected.sequence
    .filter((component) => component.componentType === 'stone')
    .map((component) => ({ id: component.materialId, size: Number(component.sizeMm) }))
});

test('the owner exclusion list and the saleable size source are exactly as specified', () => {
  assert.deepEqual([...LUMI_ENGINE_EXCLUDED_STONE_IDS].sort(), ['howlite', 'labradorite', 'malachite', 'pyrite', 'sodalite']);
  for (const id of LUMI_ENGINE_EXCLUDED_STONE_IDS) assert.equal(isEngineExcludedStone(id), true, `${id} must be excluded`);
  assert.equal(isEngineExcludedStone('golden_rutile'), false);
  const catalog = liveShapedCatalog();
  const rutilated = catalog.stones.find((stone) => stone.id === 'rutilated_quartz');
  assert.deepEqual(rutilated.sizes.map(Number), [10], 'the live catalog marks rutilated_quartz as 10mm only');
  assert.ok(Number(rutilated.p4) > 0 && Number(rutilated.p6) > 0, 'the price fields still contain 4/6 values (which must never gate sizes)');
  const snapshot = createLumiCatalogSnapshot(catalog);
  const entry = snapshot.stones.find((stone) => stone.id === 'rutilated_quartz');
  assert.deepEqual([...entry.supportedSizesMm], [10], 'the snapshot must read payload.sizes only');
});

test('the five excluded stones are never eligible, even when active and in stock', () => {
  const catalog = bundled();
  for (const id of LUMI_ENGINE_EXCLUDED_STONE_IDS) {
    const stone = catalog.stones.find((entry) => entry.id === id);
    assert.ok(stone, `${id} must exist in the fixture`);
    stone.isActive = true;
    stone.inStock = true;
    stone.stockQty = 25;
  }
  const snapshot = createLumiCatalogSnapshot(catalog);
  const profile = { weekday: 'monday', braceletContext: { beadMode: '10' }, style: 'stones_only', goals: [{ id: 'money' }] };
  const eligibility = filterLumiCatalogEligibility(profile, snapshot);
  const excluded = new Map(eligibility.stones.excluded.map((entry) => [entry.materialId, entry.reasons]));
  for (const id of LUMI_ENGINE_EXCLUDED_STONE_IDS) {
    assert.equal(eligibility.stones.eligible.some((entry) => entry.materialId === id), false, `${id} must not be eligible`);
    assert.ok((excluded.get(id) || []).includes(LUMI_ELIGIBILITY_REASONS.DISCONTINUED_MATERIAL), `${id} must carry the exclusion reason`);
  }
});

test('no generated design selects an excluded stone nor an unsaleable size (all goal sets, styles and bead modes)', () => {
  const catalog = bundled();
  // Force the excluded stones to look maximally attractive: active, in stock and priced.
  for (const id of LUMI_ENGINE_EXCLUDED_STONE_IDS) {
    const stone = catalog.stones.find((entry) => entry.id === id);
    if (stone) { stone.isActive = true; stone.inStock = true; stone.stockQty = 99; }
  }
  const snapshot = createLumiCatalogSnapshot(catalog);
  const saleable = new Map(catalog.stones.map((stone) => [String(stone.id), new Set((stone.sizes || []).map(Number))]));
  const goalsList = ['love', 'money', 'career', 'wellbeing', 'luck', 'protection'];
  const goalSets = [];
  for (let mask = 1; mask < (1 << goalsList.length); mask += 1) goalSets.push(goalsList.filter((_, index) => mask & (1 << index)));

  const violations = { forbidden: [], sizes: [] };
  let evaluated = 0;
  for (const goals of goalSets) {
    for (const style of ['stones_only', 'with_charm']) {
      for (const bead of ['6', 'mixed']) {
        const output = recommend(snapshot, goals, style, bead);
        if (output.status !== 'RECOMMENDED') continue;
        evaluated += 1;
        const selected = selectedMaterials(output.recommendation);
        for (const id of selected.ids) {
          if (LUMI_ENGINE_EXCLUDED_STONE_IDS.includes(id)) violations.forbidden.push(`${goals.join('+')}/${style}/${bead}:${id}`);
        }
        for (const pair of selected.stonePairs) {
          const allowed = saleable.get(pair.id) || new Set();
          if (!allowed.has(pair.size)) violations.sizes.push(`${goals.join('+')}/${style}/${bead}:${pair.id}@${pair.size}`);
        }
      }
    }
  }
  assert.ok(evaluated > 0, 'the sweep must produce designs');
  assert.deepEqual(violations.forbidden.slice(0, 10), [], 'excluded stones must never be selected');
  assert.deepEqual(violations.sizes.slice(0, 10), [], 'every stone-size pair must be saleable for that stone');
});

test('golden_rutile is usable at 4/6/10 and rutilated_quartz only at 10mm', () => {
  const snapshot = createLumiCatalogSnapshot(liveShapedCatalog());
  const eligibilityFor = (bead) => filterLumiCatalogEligibility({ weekday: 'monday', braceletContext: { beadMode: bead }, style: 'stones_only', goals: [{ id: 'money' }] }, snapshot);
  for (const bead of ['4', '6', '10']) {
    assert.ok(eligibilityFor(bead).stones.eligible.some((entry) => entry.materialId === 'golden_rutile'), `golden_rutile must be eligible at ${bead}mm`);
  }
  const eligible4 = eligibilityFor('4').stones.eligible.map((entry) => entry.materialId);
  const eligible6 = eligibilityFor('6').stones.eligible.map((entry) => entry.materialId);
  const eligible10 = eligibilityFor('10').stones.eligible.map((entry) => entry.materialId);
  assert.equal(eligible4.includes('rutilated_quartz'), false, 'rutilated_quartz must not be eligible at 4mm');
  assert.equal(eligible6.includes('rutilated_quartz'), false, 'rutilated_quartz must not be eligible at 6mm');
  assert.equal(eligible10.includes('rutilated_quartz'), true, 'rutilated_quartz stays eligible at 10mm');

  const mixed = eligibilityFor('mixed');
  const excluded = new Map(mixed.stones.excluded.map((entry) => [entry.materialId, entry.reasons]));
  const rutilatedMixed = mixed.stones.eligible.find((entry) => entry.materialId === 'rutilated_quartz');
  assert.ok(rutilatedMixed, 'mixed mode keeps rutilated_quartz (10mm is saleable)');
  assert.deepEqual([...rutilatedMixed.supportedSizes], [10]);
  assert.equal(excluded.has('rutilated_quartz'), false);
});

test('a design (or cached reference) that reintroduces an excluded stone or an unsaleable size is rejected at import', () => {
  const snapshot = createLumiCatalogSnapshot(liveShapedCatalog());
  const output = recommend(snapshot, ['money'], 'stones_only', '10');
  assert.equal(output.status, 'RECOMMENDED');
  const contract = buildLumiDesignContract(output.recommendation, { mixedPlacingSize: null });
  const state = { wristSize: 16, beadSize: '10', mixedPlacingSize: null };
  assert.equal(prepareLumiStep3Import({ contract, state, snapshot }).selectedStones.length > 0, true);

  // reintroduce an excluded stone into the contract
  const excludedStone = snapshot.stones.find((stone) => stone.id === 'malachite');
  const withExcluded = JSON.parse(JSON.stringify(contract));
  const stoneComponent = withExcluded.bracelet.components.find((component) => component.type === 'stone');
  stoneComponent.materialId = excludedStone.id;
  stoneComponent.sizeMm = excludedStone.supportedSizesMm[0];
  assert.throws(
    () => prepareLumiStep3Import({ contract: withExcluded, state, snapshot }),
    (error) => error.code === 'LUMI_IMPORT_MATERIAL_INACTIVE' || /INACTIVE/.test(String(error.code))
  );

  // a size that is not saleable for that stone must be rejected too (6mm rutilated_quartz)
  const sixSnapshot = createLumiCatalogSnapshot(liveShapedCatalog());
  const sixOutput = recommend(sixSnapshot, ['money'], 'stones_only', '6');
  assert.equal(sixOutput.status, 'RECOMMENDED');
  const withBadSize = JSON.parse(JSON.stringify(buildLumiDesignContract(sixOutput.recommendation, { mixedPlacingSize: null })));
  const pairComponent = withBadSize.bracelet.components.find((component) => component.type === 'stone');
  const rutilated = sixSnapshot.stones.find((stone) => stone.id === 'rutilated_quartz');
  pairComponent.materialId = rutilated.id;
  pairComponent.sizeMm = 6;
  assert.throws(
    () => prepareLumiStep3Import({ contract: withBadSize, state: { wristSize: 16, beadSize: '6', mixedPlacingSize: null }, snapshot: sixSnapshot }),
    (error) => /SIZE_UNSUPPORTED/.test(String(error.code))
  );

  // and the acceptance facade reports the rejection instead of silently accepting
  const acceptance = prepareLumiAcceptance({ recommendation: output.recommendation, state, snapshot });
  assert.equal(acceptance.status, 'READY_TO_ACCEPT');
  const broken = { ...output.recommendation, selected: { ...output.recommendation.selected } };
  broken.selected.sequence = broken.selected.sequence.map((component) => component.componentType === 'stone' ? { ...component, materialId: 'howlite' } : component);
  const rejected = prepareLumiAcceptance({ recommendation: broken, state, snapshot });
  assert.equal(rejected.status, 'REJECTED');
});
