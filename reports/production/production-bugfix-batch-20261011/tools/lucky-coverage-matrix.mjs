// Lucky recommendation coverage matrix (Task 1 evidence).
//
//   node .../lucky-coverage-matrix.mjs [--base=https://customize.luckycolorstone.com] [--label=production] [--local]
//
// Runs the real engine + the real Step-3 acceptance validator over
// 63 canonical goal sets x 7 weekdays x 2 styles x 4 bead modes = 3,528 combinations, against the
// catalog that environment actually serves, and classifies each combination:
//   SUCCESS · STRUCTURALLY_UNSUPPORTED · STOCK_UNAVAILABLE · NO_RECOMMENDATION · VALIDATION_FAILURE
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const arg = (name, fallback) => (args.find((entry) => entry.startsWith(`--${name}=`)) || `--${name}=${fallback}`).split('=').slice(1).join('=');
const BASE = arg('base', 'https://customize.luckycolorstone.com');
const LABEL = arg('label', 'production');
const USE_LOCAL = args.includes('--local');
const BEAD_FILTER = arg('beads', '').split(',').map((value) => value.trim()).filter(Boolean);
const STYLE_FILTER = arg('styles', '').split(',').map((value) => value.trim()).filter(Boolean);
const WEEKDAY_FILTER = arg('weekdays', '').split(',').map((value) => value.trim()).filter(Boolean);
const GOAL_LIMIT = Number(arg('maxgoals', '6'));
const PROGRESS_EVERY = Number(arg('progress', '50'));
const TAG = arg('tag', '');
const BIRTH_YEAR = Number(arg('birth-year', '1999'));
const WRIST = Number(arg('wrist', '16'));
// Owner policy 2026-10-11: an active, replenishable material must stay recommendable while its
// stock is temporarily zero, so the matrix can be replayed with inventory forced to zero without
// touching the catalog itself. `--zero-stock=all` forces every active record, `--zero-stock=a,b`
// forces the listed ids.
const ZERO_STOCK = arg('zero-stock', '');
const CAND = 'reports/production/full-uat-feature-migration-20261009/reconciled-candidate';
const OUT = 'reports/production/production-bugfix-batch-20261011/evidence';
const mod = (rel) => `file:///${path.resolve(CAND, rel).replace(/\\/g, '/')}`;

const { createLumiCatalogSnapshot } = await import(mod('lumi/contracts/catalog-snapshot.js'));
const { generateLumiRecommendation } = await import(mod('lumi/service/index.js'));
const { prepareLumiAcceptance } = await import(mod('lumi/integration/index.js'));
const { LUMI_RECOMMENDATION_VERSION } = await import(mod('lumi/recommendation/recommendation-version.js'));
const { LUMI_COMPOSITION_VERSION } = await import(mod('lumi/composition/composition-version.js'));

const readLocal = (name) => JSON.parse(fs.readFileSync(path.join(CAND, 'data', name), 'utf8').replace(/^\uFEFF/, ''));
const fetchJson = async (rel) => {
  const response = await fetch(`${BASE}/api/${rel}`);
  if (!response.ok) throw new Error(`catalog ${rel} -> HTTP ${response.status}`);
  const body = await response.json();
  return Array.isArray(body) ? body : (body.charms || body.stones || body.spacers || body.items || Object.values(body).find(Array.isArray));
};

const catalog = USE_LOCAL
  ? { stones: readLocal('stones.json'), charms: readLocal('charms.json'), spacers: readLocal('spacers.json') }
  : { stones: await fetchJson('stones'), charms: await fetchJson('charms'), spacers: await fetchJson('spacers') };

const zeroStockIds = new Set(ZERO_STOCK === 'all' ? [] : ZERO_STOCK.split(',').map((value) => value.trim()).filter(Boolean));
const zeroStockAll = ZERO_STOCK === 'all';
const forced = [];
if (ZERO_STOCK) {
  for (const kind of ['stones', 'charms', 'spacers']) {
    catalog[kind] = catalog[kind].map((item) => {
      const isActiveItem = item?.isActive !== false && item?.availability?.isActive !== false;
      if (!isActiveItem) return item;
      if (!zeroStockAll && !zeroStockIds.has(String(item.id))) return item;
      forced.push(String(item.id));
      return {
        ...item,
        stockQty: 0,
        stock_qty: 0,
        inStock: false,
        availability: { ...(item.availability || {}), stockQty: 0, stock_qty: 0, inStock: false }
      };
    });
  }
}
const snapshot = createLumiCatalogSnapshot(catalog);

const GOALS = ['love', 'money', 'career', 'wellbeing', 'luck', 'protection'];
const goalSets = [];
for (let mask = 1; mask < (1 << GOALS.length); mask += 1) goalSets.push(GOALS.filter((_, index) => mask & (1 << index)));
const WEEKDAYS = (WEEKDAY_FILTER.length ? WEEKDAY_FILTER : ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']);
const STYLES = ['stones_only', 'with_charm'];
const BEADS = (BEAD_FILTER.length ? BEAD_FILTER : ['4', '6', '10', 'mixed']);
const STYLES_USED = (STYLE_FILTER.length ? STYLE_FILTER : STYLES);

// Charm rules mirrored from composition-generator.js so a failure can be attributed to stock.
const mandatoryFocal = (goals) => ((goals.length === 1 && goals[0] === 'love') || (goals.includes('love') && goals.includes('career')) ? 'tg01' : null);
// Design eligibility follows the owner policy: charm activity, not current stock level.
const availableCharmIds = new Set(snapshot.charms.filter((charm) => charm.active).map((charm) => charm.id));
const stockedCharmIds = new Set(snapshot.charms.filter((charm) => charm.active && charm.inStock).map((charm) => charm.id));
const catalogCharmIds = new Set(snapshot.charms.map((charm) => charm.id));

const results = [];
const tally = {};
const bump = (key) => { tally[key] = (tally[key] || 0) + 1; };
const startedAt = Date.now();

const selectedGoalSets = goalSets.filter((goals) => goals.length <= GOAL_LIMIT);
let processed = 0;
const total = selectedGoalSets.length * WEEKDAYS.length * STYLES_USED.length * BEADS.length;
for (const goals of selectedGoalSets) {
  for (const weekday of WEEKDAYS) {
    for (const style of STYLES_USED) {
      for (const bead of BEADS) {
        processed += 1;
        if (PROGRESS_EVERY && processed % PROGRESS_EVERY === 0) {
          console.log(`[progress] ${processed}/${total} combinations, ${Math.round((Date.now() - startedAt) / 1000)}s elapsed, last=${goals.join('+')}/${weekday}/${style}/${bead}`);
        }
        const entry = { goals: goals.join('+'), goalCount: goals.length, weekday, style, bead };
        const context = { wristSizeCm: WRIST, beadMode: bead, mixedPlacingSize: bead === 'mixed' ? 6 : null };
        let output = null;
        try {
          output = generateLumiRecommendation({
            answers: { weekday, birthDate: 9, birthMonth: 9, birthYear: BIRTH_YEAR, style, goals },
            context,
            catalogSnapshot: snapshot
          });
        } catch (error) {
          entry.classification = 'VALIDATION_FAILURE';
          entry.code = 'THREW:' + (error?.code || error?.message || 'unknown');
          results.push(entry); bump(entry.classification); continue;
        }
        if (output?.status === 'RECOMMENDED') {
          try {
            const prepared = prepareLumiAcceptance({
              recommendation: output.recommendation,
              state: { wristSize: WRIST, beadSize: bead, mixedPlacingSize: bead === 'mixed' ? 6 : null },
              snapshot
            });
            if (prepared.status === 'READY_TO_ACCEPT') {
              const selected = output.recommendation.selected;
              entry.classification = 'SUCCESS';
              entry.stones = new Set(selected.sequence.filter((component) => component.componentType === 'stone').map((component) => component.materialId)).size;
              entry.stoneIds = selected.sequence.filter((component) => component.componentType === 'stone').map((component) => component.materialId);
              entry.stoneSizes = selected.sequence.filter((component) => component.componentType === 'stone').map((component) => component.sizeMm);
              entry.anchoredCharms = selected.anchoredCharms.map((charm) => charm.materialId);
              entry.loopCharms = selected.sequence.filter((component) => component.componentType === 'loop_charm').map((component) => component.materialId);
              entry.usesCl01 = entry.anchoredCharms.includes('cl01') || entry.loopCharms.includes('cl01');
              entry.usesPyrite = [...selected.sequence.map((component) => component.materialId), ...entry.anchoredCharms].includes('pyrite');
            } else {
              entry.classification = 'VALIDATION_FAILURE';
              entry.code = prepared.code || 'LUMI_ACCEPTANCE_IMPORT_REJECTED';
            }
          } catch (error) {
            entry.classification = 'VALIDATION_FAILURE';
            entry.code = 'PREPARE_THREW:' + (error?.code || error?.message || 'unknown');
          }
          results.push(entry); bump(entry.classification); continue;
        }
        const code = output?.code || output?.status || 'UNKNOWN';
        if (code === 'LUMI_COMPOSITION_NO_CHARM' && style === 'with_charm') {
          const required = mandatoryFocal(goals);
          const needsClover = goals.includes('luck');
          const missing = [];
          if (needsClover && catalogCharmIds.has('cl01') && !availableCharmIds.has('cl01')) missing.push('cl01');
          if (required && catalogCharmIds.has(required) && !availableCharmIds.has(required)) missing.push(required);
          entry.classification = missing.length ? 'STOCK_UNAVAILABLE' : 'NO_RECOMMENDATION';
          entry.code = code + (missing.length ? ':missing=' + missing.join(',') : ':no-anchored-focal-charm')
            + (needsClover && !stockedCharmIds.has('cl01') ? ':cl01-out-of-stock' : '');
        } else if (output?.status === 'NO_RECOMMENDATION') {
          entry.classification = 'NO_RECOMMENDATION';
          entry.code = code;
        } else if (code === 'LUMI_COMPOSITION_NO_VALID_CANDIDATE') {
          entry.classification = 'NO_RECOMMENDATION';
          entry.code = code;
        } else {
          entry.classification = 'STRUCTURALLY_UNSUPPORTED';
          entry.code = code;
        }
        results.push(entry); bump(entry.classification);
      }
    }
  }
}

const failures = results.filter((entry) => entry.classification !== 'SUCCESS');
const byStyle = {};
const byBead = {};
for (const entry of results) {
  byStyle[entry.style] = byStyle[entry.style] || {};
  byBead[entry.bead] = byBead[entry.bead] || {};
  byStyle[entry.style][entry.classification] = (byStyle[entry.style][entry.classification] || 0) + 1;
  byBead[entry.bead][entry.classification] = (byBead[entry.bead][entry.classification] || 0) + 1;
}

const summary = {
  label: LABEL,
  base: USE_LOCAL ? 'local candidate data' : BASE,
  ranAt: new Date().toISOString(),
  durationSec: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
  engineVersions: { recommendation: LUMI_RECOMMENDATION_VERSION, composition: LUMI_COMPOSITION_VERSION },
  catalog: {
    stones: snapshot.stones.length,
    charms: snapshot.charms.length,
    charmsAvailable: availableCharmIds.size,
    cl01Available: availableCharmIds.has('cl01'),
    spacers: snapshot.spacers.length,
    zeroStockScenario: ZERO_STOCK ? { mode: zeroStockAll ? 'all-active' : 'ids', forcedCount: forced.length, forcedIds: forced.slice(0, 60) } : null,
    catalogFingerprint: snapshot.catalogVersion
  },
  axes: { birthYear: BIRTH_YEAR, wristSizeCm: WRIST },
  combinations: results.length,
  tally,
  byStyle,
  byBead,
  pyriteUses: results.filter((entry) => entry.usesPyrite).length,
  cl01Uses: results.filter((entry) => entry.usesCl01).length,
  failureExamples: failures.slice(0, 40),
  failuresByCode: Object.entries(failures.reduce((acc, entry) => { const key = entry.classification + '|' + (entry.code || ''); acc[key] = (acc[key] || 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 20)
};

fs.mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, `lucky-coverage-${LABEL}${TAG ? '-' + TAG : ''}.json`);
fs.writeFileSync(file, JSON.stringify({ summary, results }, null, 1) + '\n', 'utf8');
console.log(JSON.stringify({ ...summary, resultsFile: file }, null, 1));
