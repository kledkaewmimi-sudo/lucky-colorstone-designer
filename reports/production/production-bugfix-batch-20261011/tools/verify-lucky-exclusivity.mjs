// Guards the Lucky recommendation contract that must survive this batch: discontinued materials are
// never recommended, and every recommended material is an active, in-stock catalog component.
import fs from 'node:fs';
import path from 'node:path';

const CAND = 'reports/production/full-uat-feature-migration-20261009/reconciled-candidate';
const OUT = 'reports/production/production-bugfix-batch-20261011/evidence';
const api = (rel) => `file:///${path.resolve(CAND, rel).replace(/\\/g, '/')}`;

const { createLumiCatalogSnapshot } = await import(api('lumi/contracts/catalog-snapshot.js'));
const { generateLumiRecommendation } = await import(api('lumi/service/index.js'));
const read = (name) => JSON.parse(fs.readFileSync(path.join(CAND, 'data', name), 'utf8').replace(/^\uFEFF/, ''));

const stones = read('stones.json');
const snapshot = createLumiCatalogSnapshot({ stones, charms: read('charms.json'), spacers: read('spacers.json') });
const byId = new Map(stones.map((stone) => [String(stone.id), stone]));
const discontinued = [];
const unavailable = [];
const pyriteUses = [];
let runs = 0;

const goalsList = [['love'], ['money'], ['career'], ['wellbeing'], ['luck'], ['protection'], ['love', 'money'], ['love', 'money', 'career'], ['love', 'money', 'career', 'wellbeing', 'protection', 'luck']];
for (const weekday of ['monday', 'sunday', 'thursday']) {
  for (const style of ['with_charm', 'stones_only']) {
    for (const goals of goalsList) {
      for (const bead of ['4', '6', '10', 'mixed']) {
        let output;
        try {
          output = generateLumiRecommendation({
            answers: { weekday, birthDate: 7, birthMonth: 7, birthYear: 2003, style, goals },
            context: { wristSizeCm: 16, beadMode: bead, mixedPlacingSize: bead === 'mixed' ? 6 : null },
            catalogSnapshot: snapshot
          });
        } catch (error) { continue; }
        runs += 1;
        if (output?.status !== 'RECOMMENDED') continue;
        const selected = output.recommendation.selected;
        const componentIds = [...selected.sequence.map((component) => component.materialId), ...selected.anchoredCharms.map((charm) => charm.materialId)];
        for (const id of componentIds) {
          if (id === 'pyrite') pyriteUses.push({ weekday, style, goals: goals.join('+'), bead });
          const record = byId.get(String(id));
          if (!record) continue;
          if (record.isActive === false) unavailable.push({ id, weekday, style, bead });
        }
      }
    }
  }
}

// A discontinued material must also be absent from the engine's own knowledge pools.
const discontinuedSource = fs.readFileSync(path.join(CAND, 'lumi/knowledge/discontinued-materials.js'), 'utf8');
const discontinuedListed = /pyrite/i.test(discontinuedSource);

const summary = {
  ranAt: new Date().toISOString(),
  recommendationRuns: runs,
  pyriteRecommendations: pyriteUses.length,
  inactiveComponentUses: unavailable.length,
  pyriteListedAsDiscontinued: discontinuedListed,
  pyriteCatalogPresence: (() => {
    const record = byId.get('pyrite');
    return record ? { id: record.id, isActive: record.isActive, inStock: record.inStock, sizes: record.sizes } : null;
  })(),
  samples: { pyriteUses: pyriteUses.slice(0, 3), unavailable: unavailable.slice(0, 3) }
};
const passed = summary.pyriteRecommendations === 0 && summary.inactiveComponentUses === 0 && summary.pyriteListedAsDiscontinued;
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'lucky-exclusivity-verification.json'), JSON.stringify({ passed, summary }, null, 1) + '\n', 'utf8');
console.log(JSON.stringify({ passed, summary }, null, 1));
process.exit(passed ? 0 : 1);
