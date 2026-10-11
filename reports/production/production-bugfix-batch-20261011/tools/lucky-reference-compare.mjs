// Compares the CURRENT engine's design outcome for every approved UAT Phase 12.8 reference case
// against the recorded reference artifact (the owner-approved gallery manifest).
//
//   node .../lucky-reference-compare.mjs [--reference=<manifest.json>] [--label=phase-12.8h]
//                                        [--base=https://customize.luckycolorstone.com] [--local]
//
// The comparison replays each reference case on its own axes (goal set, weekday, style, bead mode,
// birth year, wrist, mixed placing size) against the catalog the target environment serves now, and
// reports:
//   - reference_replay:  the case still produces an accepted Step-3 design
//   - material_match:    the same distinct stone set + talisman as the reference
//   - sequence_match:    the identical ordered physical sequence and sizes
//   - hard rules:        zero pyrite, zero weekday colour violations, correct talisman rule
// Differences caused by a different catalog fingerprint than the reference are reported separately,
// because the reference gallery was rendered against the 2026-09-28 catalog, not today's.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const arg = (name, fallback) => (args.find((entry) => entry.startsWith(`--${name}=`)) || `--${name}=${fallback}`).split('=').slice(1).join('=');
const BASE = arg('base', 'https://customize.luckycolorstone.com');
const LABEL = arg('label', 'phase-12.8h');
const USE_LOCAL = args.includes('--local');
const MAX_CASES = Number(arg('maxcases', '0'));
// `--restock=all` forces every active material back in stock, which isolates catalog drift from the
// 2026-10-11 design-eligibility policy change (with full stock the old and new engine agree).
const RESTOCK = arg('restock', '');
const CAND = 'reports/production/full-uat-feature-migration-20261009/reconciled-candidate';
const OUT = 'reports/production/production-bugfix-batch-20261011/evidence';
const REFERENCE = arg('reference', 'reports/lumi/visual/weekday-sensitivity-v2-six-goals-color-talisman/weekday-sensitivity-visual-manifest-v2.json');
const mod = (rel) => `file:///${path.resolve(CAND, rel).replace(/\\/g, '/')}`;

const { createLumiCatalogSnapshot } = await import(mod('lumi/contracts/catalog-snapshot.js'));
const { generateLumiRecommendation } = await import(mod('lumi/service/index.js'));
const { prepareLumiAcceptance } = await import(mod('lumi/integration/index.js'));
const { weekdayBannedColorFor } = await import(mod('lumi/knowledge/colors.js'));
const { primaryColorFamilyForStone } = await import(mod('lumi/knowledge/colors.js'));

const readLocal = (name) => JSON.parse(fs.readFileSync(path.join(CAND, 'data', name), 'utf8').replace(/^\uFEFF/, ''));
const fetchJson = async (rel) => {
  const response = await fetch(`${BASE}/api/${rel}`);
  if (!response.ok) throw new Error(`catalog ${rel} -> HTTP ${response.status}`);
  const body = await response.json();
  return Array.isArray(body) ? body : Object.values(body).find(Array.isArray);
};

let catalog = USE_LOCAL
  ? { stones: readLocal('stones.json'), charms: readLocal('charms.json'), spacers: readLocal('spacers.json') }
  : { stones: await fetchJson('stones'), charms: await fetchJson('charms'), spacers: await fetchJson('spacers') };
if (RESTOCK === 'all') {
  for (const kind of ['stones', 'charms', 'spacers']) {
    catalog[kind] = catalog[kind].map((item) => item.isActive === false || item.availability?.isActive === false ? item : {
      ...item,
      inStock: true,
      stockQty: Math.max(1, Number(item.stockQty ?? item.stock_qty ?? item.availability?.stockQty ?? item.availability?.stock_qty ?? 1) || 1),
      stock_qty: Math.max(1, Number(item.stockQty ?? item.stock_qty ?? item.availability?.stockQty ?? item.availability?.stock_qty ?? 1) || 1),
      availability: { ...(item.availability || {}), inStock: true, stockQty: Math.max(1, Number(item.availability?.stockQty ?? item.stockQty ?? 1) || 1) }
    });
  }
}
const snapshot = createLumiCatalogSnapshot(catalog);
const stoneById = new Map(catalog.stones.map((stone) => [String(stone.id), stone]));

const manifest = JSON.parse(fs.readFileSync(REFERENCE, 'utf8').replace(/^\uFEFF/, ''));
const cases = MAX_CASES > 0 ? manifest.records.slice(0, MAX_CASES) : manifest.records;
const strict = (value) => JSON.stringify(value);
const results = { matched: [], materialDifferences: [], sequenceDifferences: [], notRecommended: [], ruleFailures: [] };

for (const record of cases) {
  const goals = Array.isArray(record.goal_ids) ? record.goal_ids : String(record.goal_key).split('+');
  const weekday = record.weekday;
  const style = record.style;
  const bead = String(record.bead_mode);
  const birthYear = Number(record.normalized_profile?.birth_year ?? 1990);
  const wrist = Number(record.normalized_profile?.wrist_size_cm ?? 16);
  const mixedPlacingSize = record.normalized_profile?.mixed_placing_size ?? (bead === 'mixed' ? 6 : null);
  const context = { wristSizeCm: wrist, beadMode: bead, mixedPlacingSize: bead === 'mixed' ? Number(mixedPlacingSize) : null };
  const entry = { caseId: record.case_id, goals: goals.join('+'), weekday, style, bead, birthYear, wrist };

  let outcome = null;
  try {
    outcome = generateLumiRecommendation({
      answers: { weekday, birthDate: 9, birthMonth: 9, birthYear, style, goals },
      context,
      catalogSnapshot: snapshot
    });
  } catch (error) {
    entry.reason = 'THREW:' + (error?.code || error?.message || 'unknown');
    results.notRecommended.push(entry);
    continue;
  }
  if (outcome?.status !== 'RECOMMENDED') {
    entry.reason = outcome?.code || outcome?.status || 'UNKNOWN';
    results.notRecommended.push(entry);
    continue;
  }

  const acceptance = prepareLumiAcceptance({
    recommendation: outcome.recommendation,
    state: { wristSize: wrist, beadSize: bead, mixedPlacingSize: bead === 'mixed' ? Number(mixedPlacingSize) : null },
    snapshot
  });
  if (acceptance.status !== 'READY_TO_ACCEPT') {
    entry.reason = acceptance.code || 'LUMI_ACCEPTANCE_IMPORT_REJECTED';
    results.notRecommended.push(entry);
    continue;
  }

  const selected = outcome.recommendation.selected;
  const currentStoneIds = selected.sequence.filter((component) => component.componentType === 'stone').map((component) => component.materialId);
  const currentSizes = selected.sequence.filter((component) => component.componentType === 'stone').map((component) => component.sizeMm);
  const currentCharms = [
    ...selected.anchoredCharms.map((charm) => charm.materialId),
    ...selected.sequence.filter((component) => component.componentType !== 'stone').map((component) => component.materialId)
  ];
  const referenceStoneIds = Array.isArray(record.stone_ids) ? record.stone_ids.map(String) : [];
  const referenceSizes = Array.isArray(record.stone_sizes) ? record.stone_sizes.map(Number) : [];
  const referenceCharms = [record.talisman_id].filter(Boolean).map(String);

  const distinct = (ids) => [...new Set(ids)].sort();
  entry.distinctStones = distinct(currentStoneIds);
  entry.referenceDistinctStones = distinct(referenceStoneIds);
  entry.talisman = currentCharms;
  entry.referenceTalisman = referenceCharms;

  // Hard rules that must hold regardless of catalog drift.
  const banned = weekdayBannedColorFor(weekday);
  const colorViolations = currentStoneIds.filter((id) => banned && primaryColorFamilyForStone(stoneById.get(id)) === banned);
  const dayColorFamilies = currentStoneIds.map((id) => primaryColorFamilyForStone(stoneById.get(id)));
  const ruleIssues = [];
  if (currentStoneIds.includes('pyrite')) ruleIssues.push('pyrite');
  if (colorViolations.length) ruleIssues.push('weekday_color:' + colorViolations.join(','));
  // The Luck clover rule only applies to a talisman design; a stones-only Luck bracelet carries no
  // charm at all (exactly as the reference gallery records it).
  if (style === 'with_charm' && goals.includes('luck') && !currentCharms.includes('cl01')) ruleIssues.push('luck_without_clover');
  if ((goals.length === 1 && goals[0] === 'love') && style === 'with_charm' && !currentCharms.includes('tg01')) ruleIssues.push('lakshmi_missing');
  if (goals.includes('love') && goals.includes('career') && style === 'with_charm' && !currentCharms.includes('tg01')) ruleIssues.push('love_career_lakshmi_missing');
  entry.weekdayBannedColor = banned;
  entry.dayColorFamilies = dayColorFamilies;
  if (ruleIssues.length) results.ruleFailures.push({ ...entry, ruleIssues });

  const materialMatch = strict(entry.distinctStones) === strict(entry.referenceDistinctStones)
    && strict(entry.talisman.slice().sort()) === strict(entry.referenceTalisman.slice().sort());
  const sequenceMatch = strict(currentStoneIds) === strict(referenceStoneIds)
    && strict(currentSizes) === strict(referenceSizes)
    && strict(entry.talisman.slice().sort()) === strict(entry.referenceTalisman.slice().sort());

  if (sequenceMatch) results.matched.push(entry);
  else if (materialMatch) results.sequenceDifferences.push(entry);
  else results.materialDifferences.push(entry);
}

const summary = {
  label: LABEL,
  reference: REFERENCE,
  referencePhase: manifest.phase,
  referenceCatalogFingerprint: manifest.records[0]?.catalog_fingerprint || null,
  currentCatalogFingerprint: snapshot.catalogVersion,
  restockScenario: RESTOCK || null,
  base: USE_LOCAL ? 'local candidate data' : BASE,
  ranAt: new Date().toISOString(),
  referenceCases: cases.length,
  replayAccepted: results.matched.length + results.sequenceDifferences.length + results.materialDifferences.length,
  exactSequenceMatch: results.matched.length,
  sameMaterialsDifferentSequence: results.sequenceDifferences.length,
  differentMaterials: results.materialDifferences.length,
  materialsMatchingButSequenceOrTalisman: results.sequenceDifferences.length,
  notRecommended: results.notRecommended.length,
  hardRuleFailures: results.ruleFailures.length,
  catalogDriftNote: 'The reference gallery was captured against its own catalog fingerprint; cases that replay on today\u2019s catalog legitimately differ in material choice.',
  examples: {
    notRecommended: results.notRecommended.slice(0, 25),
    materialDifferences: results.materialDifferences.slice(0, 25),
    ruleFailures: results.ruleFailures.slice(0, 25)
  }
};

fs.mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, `lucky-reference-compare-${LABEL}.json`);
fs.writeFileSync(file, JSON.stringify({ summary, results }, null, 1) + '\n', 'utf8');
console.log(JSON.stringify({ ...summary, evidenceFile: file }, null, 1));
process.exit(summary.notRecommended === 0 && summary.hardRuleFailures === 0 ? 0 : 1);
