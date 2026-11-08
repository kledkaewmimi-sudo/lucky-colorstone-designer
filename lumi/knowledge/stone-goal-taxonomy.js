// Canonical Step 3 stone taxonomy = the SAME six goals Lucky uses (owner review 2026-10-08).
//
// Source of truth: lumi/knowledge/goals.js (the canonical goal ids + official Thai labels) and
// lumi/knowledge/profiles.js (the per-stone goalAffinity the recommendation engine already scores
// with). The Step 3 category tabs therefore describe exactly the same taxonomy the assistant uses,
// so manual browsing and Lucky-assisted browsing stay consistent.
//
// A stone belongs to a goal when its engine affinity for that goal is meaningfully above the shared
// neutral baseline (see STONE_GOAL_MIN_AFFINITY). Stones without affinity data fall back to the
// legacy catalog category so no selectable stone can ever end up uncategorised.
//
// This module never changes selection, scoring, composition, pattern or fit behaviour - it only
// publishes the goal membership the Step 3 catalog filter reads.

import { LUMI_GOALS, LUMI_GOAL_LABELS } from './goals.js';
import { STONE_KNOWLEDGE } from './profiles.js';
import { isDiscontinuedMaterial } from './discontinued-materials.js';

// profiles.js blends a shared neutral baseline (0.34 in the current catalog) with per-goal
// affinities; everything at or above this cut is a real association, everything below is baseline.
export const STONE_GOAL_MIN_AFFINITY = 0.5;

// Historical catalog categories, used only as a fallback when a stone has no affinity data at all.
export const STONE_GOAL_LEGACY_FALLBACK = Object.freeze({
  wealth: Object.freeze(['money', 'career', 'luck']),
  love: Object.freeze(['love', 'wellbeing']),
  calm: Object.freeze(['wellbeing']),
  protection: Object.freeze(['protection', 'wellbeing'])
});

export const STEP3_ALL_CATEGORY = Object.freeze({ id: 'all', en: 'All', th: 'ทั้งหมด' });

// The six canonical goals, in the canonical order, with the official Thai labels from goals.js.
export const STEP3_GOAL_CATEGORIES = Object.freeze(
  LUMI_GOALS.map((id) => Object.freeze({ id, en: id, th: LUMI_GOAL_LABELS[id] }))
);

const knowledgeById = new Map(STONE_KNOWLEDGE.map((entry) => [entry.materialId, entry]));
const goalIds = new Set(LUMI_GOALS);
const goalCache = new Map();

const idOf = (stone) => (stone && typeof stone === 'object' ? stone.id : stone);

function categoryFallback(stone) {
  const id = idOf(stone);
  const legacy = (stone && typeof stone === 'object' ? stone.category || stone.categoryId : null)
    || knowledgeById.get(id)?.catalog?.category
    || knowledgeById.get(id)?.category;
  return STONE_GOAL_LEGACY_FALLBACK[String(legacy || '').trim()] || null;
}

/**
 * Goal ids a stone belongs to, in canonical goal order. Always returns an array; a stone with
 * affinity data always yields at least one goal, and a stone without affinity data falls back to
 * its legacy catalog category.
 */
export function getStoneGoalIds(stone) {
  const id = idOf(stone);
  if (!id) return [];
  if (goalCache.has(id)) return goalCache.get(id);
  const entry = knowledgeById.get(id);
  const affinity = entry && entry.goalAffinity ? entry.goalAffinity : null;
  let goals = affinity
    ? LUMI_GOALS.filter((goal) => Number(affinity[goal]) >= STONE_GOAL_MIN_AFFINITY)
    : [];
  if (!goals.length) goals = [...(categoryFallback(stone) || [])];
  goals = goals.filter((goal) => goalIds.has(goal));
  goalCache.set(id, goals);
  return goals;
}

/** True when the stone belongs to the given Step 3 goal category. The All category matches all. */
export function stoneMatchesGoalCategory(stone, categoryId) {
  const category = String(categoryId || '').trim();
  if (!category || category === STEP3_ALL_CATEGORY.id) return true;
  return getStoneGoalIds(stone).includes(category);
}

/**
 * Audit for the owner: totals per goal, multi-goal stones, unassigned stones (must be zero) and any
 * secondary association the owner may want to re-classify.
 */
/**
 * The stones a customer can actually see/select in Step 3: active, in stock and not discontinued.
 * The category audit must run against this set (owner rule 2026-10-08: Pyrite is discontinued).
 */
export function filterSelectableStep3Stones(stones = []) {
  return (Array.isArray(stones) ? stones : []).filter((stone) => {
    if (!stone || stone.isActive === false || stone.inStock === false) return false;
    return !isDiscontinuedMaterial(stone.id);
  });
}

export function buildStoneGoalTaxonomyAudit(stones = []) {
  const perGoal = Object.fromEntries(LUMI_GOALS.map((goal) => [goal, 0]));
  const assigned = [];
  const unassigned = [];
  const multiGoal = [];
  const goldenMin = 0.7;
  const secondary = [];
  for (const stone of stones) {
    const id = idOf(stone);
    const goals = getStoneGoalIds(stone);
    const entry = knowledgeById.get(id);
    const invalid = goals.filter((goal) => !goalIds.has(goal));
    if (!goals.length) unassigned.push(id);
    else {
      assigned.push(id);
      for (const goal of goals) perGoal[goal] += 1;
      if (goals.length > 1) multiGoal.push({ id, goals });
      if (entry && entry.goalAffinity) {
        const weak = goals.filter((goal) => Number(entry.goalAffinity[goal]) < goldenMin);
        if (weak.length) secondary.push({ id, goals, weakAssociations: weak });
      }
    }
    if (invalid.length) throw new Error('Invalid goal mapping for ' + id + ': ' + invalid.join(','));
  }
  return {
    totalStones: stones.length,
    assignedCount: assigned.length,
    unassignedCount: unassigned.length,
    unassigned,
    multiGoalCount: multiGoal.length,
    multiGoal,
    duplicateMappingCount: 0,
    invalidMappingCount: 0,
    perGoal,
    secondaryAssociations: secondary
  };
}
