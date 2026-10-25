// Discontinued materials - owner rule (2026-10-08): Pyrite is discontinued.
//
// This is the single source of truth for the rule. It is consumed by
//   * lumi/scoring/eligibility.js  (Lucky must never consider or recommend it)
//   * app.js                       (Step 3 must never display or select it)
//   * lumi/knowledge/stone-goal-taxonomy.js (the selectable-stone audit)
// The catalog record itself is intentionally KEPT in data/stones.json: historical orders, CRM
// records and price history still reference it, so nothing is deleted and no price/stock rule
// changes. Only selection, display and recommendation eligibility are withdrawn.

export const LUMI_DISCONTINUED_MATERIAL_IDS = Object.freeze(['pyrite']);

const discontinued = new Set(LUMI_DISCONTINUED_MATERIAL_IDS);

/** True when a material id is discontinued and must not be selectable or recommendable. */
export function isDiscontinuedMaterial(materialId) {
  return discontinued.has(String(materialId || '').trim().toLowerCase());
}
