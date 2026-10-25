// Owner policy 2026-10-11: these stone ids must never be used by the Lucky recommendation engine in
// any path - initial eligibility, candidate selection, compatible fallbacks, donor/backfill picks or a
// re-imported reference design. The catalog records themselves are untouched: manual customization
// keeps its own independent rules, and historical orders keep their recorded components.
//
// Pyrite is also on the pre-existing discontinued list (lumi/knowledge/discontinued-materials.js); it
// is repeated here so the engine has a single, explicit exclusion set for the owner's list.
export const LUMI_ENGINE_EXCLUDED_STONE_IDS = Object.freeze([
  'malachite',
  'labradorite',
  'howlite',
  'sodalite',
  'pyrite',
  'phase27-strawberry-quartz',
  'phase27-freshwater-pearl'
]);

const excluded = new Set(LUMI_ENGINE_EXCLUDED_STONE_IDS);

/** True when a stone id may never be selected by the Lucky engine. */
export function isEngineExcludedStone(materialId) {
  return excluded.has(String(materialId || '').trim().toLowerCase());
}
