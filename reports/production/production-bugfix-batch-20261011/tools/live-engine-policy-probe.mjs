// Live runtime probe (read-only) for TASK C on the DEPLOYED Production site:
//   node .../live-engine-policy-probe.mjs [--base=https://customize.luckycolorstone.com]
//
// Loads the real site in Chromium, then, inside the page, imports the DEPLOYED engine modules and runs
// the owner's flow (WITH_TALISMAN, all six goals) against the live catalog the site itself serves. This
// is runtime evidence on the shipped bytes - it does not replace the offline 3,528-case matrix, and it
// performs no writes, no orders and no payment.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const args = process.argv.slice(2);
const arg = (name, fallback) => (args.find((entry) => entry.startsWith(`--${name}=`)) || `--${name}=${fallback}`).split('=').slice(1).join('=');
const BASE = arg('base', 'https://customize.luckycolorstone.com');
const OUT = 'reports/production/production-bugfix-batch-20261011/evidence';
const EXCLUDED = ['malachite', 'labradorite', 'howlite', 'sodalite', 'pyrite'];
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const BEADS = ['4', '6', '10', 'mixed'];

const browser = await chromium.launch({ headless: true });
let result = null;
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  // Keep the probe off the network beyond the catalog endpoints the site already uses.
  result = await page.evaluate(async ({ excluded, weekdays, beads }) => {
    const [stonesRes, charmsRes, spacersRes] = await Promise.all([
      fetch('/api/stones'), fetch('/api/charms'), fetch('/api/spacers')
    ]);
    const catalog = {
      stones: await stonesRes.json(),
      charms: await charmsRes.json(),
      spacers: await spacersRes.json()
    };
    const { createLumiCatalogSnapshot } = await import('/lumi/contracts/catalog-snapshot.js');
    const { generateLumiRecommendation } = await import('/lumi/service/index.js');
    const { prepareLumiAcceptance } = await import('/lumi/integration/index.js');
    const { LUMI_ENGINE_EXCLUDED_STONE_IDS, isEngineExcludedStone } = await import('/lumi/knowledge/engine-excluded-stones.js');

    const snapshot = createLumiCatalogSnapshot(catalog);
    const saleable = new Map(catalog.stones.map((stone) => [String(stone.id), new Set((stone.sizes || []).map(Number))]));
    const goals = ['love', 'money', 'career', 'wellbeing', 'luck', 'protection'];
    const rows = [];
    for (const weekday of weekdays) {
      for (const bead of beads) {
        const context = { wristSizeCm: 16, beadMode: bead, mixedPlacingSize: bead === 'mixed' ? 6 : null };
        let output = null;
        try {
          output = generateLumiRecommendation({
            answers: { weekday, birthDate: 9, birthMonth: 9, birthYear: 1999, style: 'with_charm', goals },
            context,
            catalogSnapshot: snapshot
          });
        } catch (error) {
          rows.push({ weekday, bead, status: 'THREW', code: String(error?.code || error?.message) });
          continue;
        }
        const entry = { weekday, bead, status: output?.status || 'UNKNOWN', code: output?.code || '' };
        if (entry.status === 'RECOMMENDED') {
          const selected = output.recommendation.selected;
          const ids = [...selected.sequence.map((component) => component.materialId), ...selected.anchoredCharms.map((charm) => charm.materialId)];
          entry.forbidden = [...new Set(ids.filter((id) => excluded.includes(id)))];
          entry.unsaleable = selected.sequence
            .filter((component) => component.componentType === 'stone' && !(saleable.get(String(component.materialId)) || new Set()).has(Number(component.sizeMm)))
            .map((component) => `${component.materialId}@${component.sizeMm}`);
          entry.hasClover = ids.includes('cl01');
          const acceptance = prepareLumiAcceptance({
            recommendation: output.recommendation,
            state: { wristSize: 16, beadSize: bead, mixedPlacingSize: bead === 'mixed' ? 6 : null },
            snapshot
          });
          entry.acceptance = acceptance.status;
        }
        rows.push(entry);
      }
    }
    return {
      excludedFromModule: [...LUMI_ENGINE_EXCLUDED_STONE_IDS],
      moduleExcludesAll: excluded.every((id) => isEngineExcludedStone(id)),
      catalogSizes: {
        golden_rutile: (catalog.stones.find((stone) => stone.id === 'golden_rutile') || {}).sizes,
        rutilated_quartz: (catalog.stones.find((stone) => stone.id === 'rutilated_quartz') || {}).sizes,
        rutilated_prices: (() => { const stone = catalog.stones.find((entry) => entry.id === 'rutilated_quartz') || {}; return { p4: stone.p4, p6: stone.p6, p10: stone.p10 }; })()
      },
      rows
    };
  }, { excluded: EXCLUDED, weekdays: WEEKDAYS, beads: BEADS });
} finally {
  await browser.close();
}

const recommended = result.rows.filter((row) => row.status === 'RECOMMENDED');
const summary = {
  ranAt: new Date().toISOString(),
  base: BASE,
  cases: result.rows.length,
  recommended: recommended.length,
  accepted: recommended.filter((row) => row.acceptance === 'READY_TO_ACCEPT').length,
  forbiddenStoneViolations: result.rows.filter((row) => (row.forbidden || []).length > 0).length,
  unsaleableSizeViolations: result.rows.filter((row) => (row.unsaleable || []).length > 0).length,
  cloverCases: recommended.filter((row) => row.hasClover).length,
  excludedFromModule: result.excludedFromModule,
  moduleExcludesAll: result.moduleExcludesAll,
  catalogSizes: result.catalogSizes,
  nonRecommended: result.rows.filter((row) => row.status !== 'RECOMMENDED').slice(0, 10),
  rows: result.rows
};
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(`${OUT}/live-engine-policy-probe.json`, JSON.stringify(summary, null, 1) + '\n', 'utf8');
console.log(JSON.stringify({ ...summary, rows: summary.rows.length }, null, 1));
process.exit(summary.forbiddenStoneViolations === 0 && summary.unsaleableSizeViolations === 0 ? 0 : 1);
