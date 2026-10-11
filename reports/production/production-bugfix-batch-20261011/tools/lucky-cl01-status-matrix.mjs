// ISSUE 3 evidence: the owner's reported flow (WITH_TALISMAN + ALL SIX GOALS) evaluated against the
// three catalog states that matter, with the real engine + the real Step-3 acceptance validator.
//
//   node .../lucky-cl01-status-matrix.mjs [--base=https://customize.luckycolorstone.com]
//
//   1) cl01 inactive            -> the luck rule must refuse (no silent substitution, no Pyrite)
//   2) cl01 active + zero stock -> must still recommend and accept (owner policy 2026-10-11)
//   3) cl01 active + 1000 units -> must recommend and accept (the state after the CRM reactivation)
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const arg = (name, fallback) => (args.find((entry) => entry.startsWith(`--${name}=`)) || `--${name}=${fallback}`).split('=').slice(1).join('=');
const BASE = arg('base', 'https://customize.luckycolorstone.com');
const CAND = 'reports/production/full-uat-feature-migration-20261009/reconciled-candidate';
const OUT = 'reports/production/production-bugfix-batch-20261011/evidence';
const mod = (rel) => `file:///${path.resolve(CAND, rel).replace(/\\/g, '/')}`;

const { createLumiCatalogSnapshot } = await import(mod('lumi/contracts/catalog-snapshot.js'));
const { generateLumiRecommendation } = await import(mod('lumi/service/index.js'));
const { prepareLumiAcceptance } = await import(mod('lumi/integration/index.js'));

const fetchJson = async (rel) => {
  const response = await fetch(`${BASE}/api/${rel}`);
  if (!response.ok) throw new Error(`catalog ${rel} -> HTTP ${response.status}`);
  const body = await response.json();
  return Array.isArray(body) ? body : Object.values(body).find(Array.isArray);
};
const live = { stones: await fetchJson('stones'), charms: await fetchJson('charms'), spacers: await fetchJson('spacers') };
const liveCl01 = live.charms.find((charm) => charm.id === 'cl01');

const withCl01 = (charms, { inStock, isActive, stockQty }) => charms.map((charm) => charm.id === 'cl01'
  ? {
    ...charm,
    inStock,
    isActive,
    stockQty,
    stock_qty: stockQty,
    availability: { ...(charm.availability || {}), inStock, isActive, stockQty, stock_qty: stockQty }
  }
  : charm);

const GOALS = ['love', 'money', 'career', 'wellbeing', 'luck', 'protection'];
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const BEADS = ['4', '6', '10', 'mixed'];
const scenarios = [
  { id: 'cl01-inactive', label: 'cl01 inactive (current production state)', charms: withCl01(live.charms, { inStock: false, isActive: false, stockQty: 1000 }), expect: 'NO_RECOMMENDATION' },
  { id: 'cl01-active-zero-stock', label: 'cl01 active with zero stock (policy fixture)', charms: withCl01(live.charms, { inStock: false, isActive: true, stockQty: 0 }), expect: 'RECOMMENDED' },
  { id: 'cl01-active-1000', label: 'cl01 active with 1000 units (after the CRM reactivation)', charms: withCl01(live.charms, { inStock: true, isActive: true, stockQty: 1000 }), expect: 'RECOMMENDED' }
];

const output = { ranAt: new Date().toISOString(), base: BASE, liveCl01: liveCl01 ? { inStock: liveCl01.availability?.inStock ?? liveCl01.inStock, isActive: liveCl01.availability?.isActive ?? liveCl01.isActive, stockQty: liveCl01.availability?.stockQty ?? liveCl01.stockQty } : null, scenarios: {} };

for (const scenario of scenarios) {
  const snapshot = createLumiCatalogSnapshot({ stones: live.stones, charms: scenario.charms, spacers: live.spacers });
  const rows = [];
  for (const weekday of WEEKDAYS) {
    for (const bead of BEADS) {
      const context = { wristSizeCm: 16, beadMode: bead, mixedPlacingSize: bead === 'mixed' ? 6 : null };
      const entry = { weekday, bead };
      let result = null;
      try {
        result = generateLumiRecommendation({
          answers: { weekday, birthDate: 9, birthMonth: 9, birthYear: 1999, style: 'with_charm', goals: GOALS },
          context,
          catalogSnapshot: snapshot
        });
      } catch (error) {
        entry.status = 'THREW';
        entry.code = String(error?.code || error?.message);
        rows.push(entry);
        continue;
      }
      entry.status = result?.status === 'RECOMMENDED' ? 'RECOMMENDED' : (result?.status || 'UNKNOWN');
      entry.code = result?.code || '';
      if (entry.status === 'RECOMMENDED') {
        const selected = result.recommendation.selected;
        const materialIds = [...selected.sequence.map((component) => component.materialId), ...selected.anchoredCharms.map((charm) => charm.materialId)];
        entry.charms = [...selected.anchoredCharms.map((charm) => charm.materialId), ...selected.sequence.filter((component) => component.componentType !== 'stone').map((component) => component.materialId)];
        entry.hasClover = materialIds.includes('cl01');
        entry.hasPyrite = materialIds.includes('pyrite');
        const acceptance = prepareLumiAcceptance({ recommendation: result.recommendation, state: { wristSize: 16, beadSize: bead, mixedPlacingSize: bead === 'mixed' ? 6 : null }, snapshot });
        entry.acceptance = acceptance.status;
        entry.acceptanceCode = acceptance.code || '';
      }
      rows.push(entry);
    }
  }
  const recommended = rows.filter((row) => row.status === 'RECOMMENDED');
  const accepted = rows.filter((row) => row.acceptance === 'READY_TO_ACCEPT');
  const withClover = recommended.filter((row) => row.hasClover);
  output.scenarios[scenario.id] = {
    label: scenario.label,
    expected: scenario.expect,
    cases: rows.length,
    recommended: recommended.length,
    accepted: accepted.length,
    withoutCloverAmongRecommended: recommended.length - withClover.length,
    pyriteUses: rows.filter((row) => row.hasPyrite).length,
    failureCodes: [...new Set(rows.filter((row) => row.status !== 'RECOMMENDED').map((row) => `${row.status}:${row.code}`))],
    rows
  };
}

fs.mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, 'lucky-cl01-status-matrix.json');
fs.writeFileSync(file, JSON.stringify(output, null, 1) + '\n', 'utf8');
console.log(JSON.stringify({
  liveCl01: output.liveCl01,
  scenarios: Object.fromEntries(Object.entries(output.scenarios).map(([id, value]) => [id, {
    label: value.label,
    cases: value.cases,
    recommended: value.recommended,
    accepted: value.accepted,
    withoutCloverAmongRecommended: value.withoutCloverAmongRecommended,
    pyriteUses: value.pyriteUses,
    failureCodes: value.failureCodes
  }])),
  evidenceFile: file
}, null, 1));
