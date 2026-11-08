import { primaryColorFamilyForStone } from '../knowledge/colors.js';

// Rainbow Mode (Lucky 5/6-goal recommendations only).
//
// Scope: this module is a ranking + physical-ordering optimisation that runs AFTER every existing
// hard rule (Step 3 eligibility, Pyrite exclusion, deterministic primary colour, weekday banned
// primary colour, goal coverage, talisman rules, structural fit). It never relaxes a hard rule and
// never inserts a forbidden colour: it only re-ranks legal stones and re-orders legal beads.
//
// Activation is deliberately isolated: exactly 5 or exactly 6 selected goals.
export const LUMI_RAINBOW_MODE_VERSION = '1.0.0';
export const LUMI_RAINBOW_MODE_GOAL_COUNTS = Object.freeze([5, 6]);
// Canonical colour progression built ONLY from primary_color_family values that already exist in
// lumi/knowledge/colors.js. No new vocabulary is introduced.
export const LUMI_RAINBOW_CHROMATIC_ORDER = Object.freeze(['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink']);
// Neutral / non-spectral families are kept, never dropped, and parked at the single wrap seam so
// they cannot interrupt the chromatic progression.
export const LUMI_RAINBOW_NEUTRAL_ORDER = Object.freeze(['white', 'gray', 'black']);
export const LUMI_RAINBOW_COLOR_ORDER = Object.freeze([...LUMI_RAINBOW_CHROMATIC_ORDER, ...LUMI_RAINBOW_NEUTRAL_ORDER]);
const RANK_BY_FAMILY = Object.freeze(Object.fromEntries(LUMI_RAINBOW_COLOR_ORDER.map((family, index) => [family, index])));
const CHROMATIC_FAMILIES = new Set(LUMI_RAINBOW_CHROMATIC_ORDER);

// Owner v2 target: how many DISTINCT stone identities a Rainbow bracelet should show.
export const LUMI_RAINBOW_DISTINCT_TARGET = Object.freeze({ 5: 10, 6: 12 });
export const LUMI_RAINBOW_MAX_MOTIF = 21;
export function rainbowDistinctStoneTarget(profile) {
  const count = Array.isArray(profile?.goals) ? profile.goals.length : 0;
  return LUMI_RAINBOW_DISTINCT_TARGET[count] ?? null;
}
// Physical envelope for the mirrored repeat grammar: the stone beads must share the wrist budget
// with any talisman footprint (the anchored focal talisman and the LUCK clover loop charm).
export function rainbowStoneSlotBudget({ wristSizeCm = 16, beadMode = '6', mixedPlacingSize = 6, allowanceCm = 1.5, charmMm = 0 } = {}) {
  const targetMm = (Number(wristSizeCm) + Number(allowanceCm)) * 10;
  const beadMm = beadMode === 'mixed' ? (Number(mixedPlacingSize) || 6) : (Number(beadMode) || 6);
  if (!(targetMm > 0) || !(beadMm > 0)) return 0;
  return Math.max(0, Math.floor((targetMm - Math.max(0, Number(charmMm) || 0)) / beadMm));
}
// Feasible motif lengths (number of DISTINCT stones in one motif) for this grammar:
//   2 * M * repeat + closureCount + 2 * edgePairs = stoneSlots,  repeat >= 1, edgePairs <= 8,
//   closureCount in {1,2,3} (centre/closure stones emitted by the fit engine).
export function rainbowFeasibleMotifLengthsForSlots(slots, { maxEdgeFillers = 8, maxRepeatCount = 32, closureCounts = [1, 2, 3] } = {}) {
  if (!(slots > 0)) return Object.freeze([]);
  const values = new Set();
  for (const closure of closureCounts) {
    for (let repeat = 1; repeat <= maxRepeatCount; repeat += 1) {
      for (let edges = 0; edges <= maxEdgeFillers; edges += 1) {
        const numerator = slots - closure - 2 * edges;
        if (numerator <= 0) continue;
        if (numerator % (2 * repeat) !== 0) continue;
        const motif = numerator / (2 * repeat);
        if (motif >= 1 && motif <= LUMI_RAINBOW_MAX_MOTIF) values.add(motif);
      }
    }
  }
  return Object.freeze([...values].sort((left, right) => left - right));
}
export function rainbowFeasibleMotifLengths(options) { return rainbowFeasibleMotifLengthsForSlots(rainbowStoneSlotBudget(options), { closureCounts: options?.closureCounts || [1, 2, 3] }); }
export function rainbowMaxFeasibleMotif(options) { const feasible = rainbowFeasibleMotifLengths(options); return feasible.length ? feasible[feasible.length - 1] : 0; }
export function rainbowMotifCapacity(options) { return rainbowMaxFeasibleMotif(options); }
export function rainbowFeasibleTarget(options, requested) {
  const feasible = rainbowFeasibleMotifLengths(options);
  if (!feasible.length) return 0;
  // Prefer the smallest motif length that still MEETS the requested target; otherwise the largest
  // motif length below it (the maximum legal diversity for this envelope).
  const meeting = feasible.filter((motif) => motif >= requested);
  if (meeting.length) return meeting[0];
  const below = feasible.filter((motif) => motif < requested);
  return below.length ? below[below.length - 1] : feasible[0];
}
// Rainbow v3 (WITH_TALISMAN): material IDENTITY symmetry and SIZE symmetry are independent.
// Feasibility is bounded by the ACTUAL physical stone slots around the talisman and the legal
// candidate pool - never by the legacy mirrored-material motif cap, which required two mirrored
// beads per material identity and therefore capped 5/6 WITH_TALISMAN far below the owner target.
export function rainbowDistinctStoneCapacity({ stoneSlots = 0, legalIdentityCount = 0 } = {}) {
  const slots = Math.max(0, Math.floor(Number(stoneSlots) || 0));
  const identities = Math.max(0, Math.floor(Number(legalIdentityCount) || 0));
  return Math.max(0, Math.min(slots, identities));
}
export function isLumiRainbowMode(profile) {
  const count = Array.isArray(profile?.goals) ? profile.goals.length : 0;
  return LUMI_RAINBOW_MODE_GOAL_COUNTS.includes(count);
}
export function rainbowFamilyOfStone(materialId) { return primaryColorFamilyForStone({ id: materialId }); }
export function isChromaticRainbowFamily(family) { return CHROMATIC_FAMILIES.has(family); }
export function rainbowColorRank(family) {
  const rank = RANK_BY_FAMILY[String(family)];
  return rank == null ? LUMI_RAINBOW_COLOR_ORDER.length : rank;
}
export function countDistinctRainbowFamilies(entries) {
  const families = new Set();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const family = rainbowFamilyOfStone(entry?.materialId);
    if (isChromaticRainbowFamily(family)) families.add(family);
  }
  return families.size;
}
// Ranking factor used while COMPLETING goal coverage: keep the existing "must cover this goal"
// rule (the caller only passes stones that already cover the goal), then prefer a stone that adds
// a colour family the set does not have yet - chromatic families first. If every remaining legal
// covering stone repeats an existing family, fall back to the caller's order (highest score first).
export function pickLumiRainbowCoveringStone(covering, selected) {
  if (!Array.isArray(covering) || covering.length === 0) return null;
  const usedFamilies = new Set((Array.isArray(selected) ? selected : []).map((entry) => rainbowFamilyOfStone(entry?.materialId)));
  const fresh = covering.filter((entry) => !usedFamilies.has(rainbowFamilyOfStone(entry?.materialId)));
  const freshChromatic = fresh.filter((entry) => isChromaticRainbowFamily(rainbowFamilyOfStone(entry?.materialId)));
  return freshChromatic[0] || fresh[0] || covering[0];
}
// v2 backfill: keep adding DISTINCT stone identities (never a second copy of a stone we already
// have) until the owner's distinct-stone target is met. Colour families that already appear get
// extra stone identities next, so a family block shows several stone types instead of one stone
// repeated many times; families with the fewest identities are served first.
export function pickLumiRainbowBackfillStone(remaining, selected) {
  if (!Array.isArray(remaining) || remaining.length === 0) return null;
  const usedFamilies = new Set((Array.isArray(selected) ? selected : []).map((entry) => rainbowFamilyOfStone(entry?.materialId)));
  const freshChromatic = remaining.filter((entry) => { const family = rainbowFamilyOfStone(entry?.materialId); return !usedFamilies.has(family) && isChromaticRainbowFamily(family); });
  if (freshChromatic.length) return freshChromatic[0];
  const freshAny = remaining.filter((entry) => !usedFamilies.has(rainbowFamilyOfStone(entry?.materialId)));
  if (freshAny.length) return freshAny[0];
  const familyCounts = new Map();
  for (const entry of Array.isArray(selected) ? selected : []) {
    const family = rainbowFamilyOfStone(entry?.materialId);
    familyCounts.set(family, (familyCounts.get(family) || 0) + 1);
  }
  let best = remaining[0];
  let bestCount = Infinity;
  for (const entry of remaining) {
    const count = familyCounts.get(rainbowFamilyOfStone(entry?.materialId)) || 0;
    if (count < bestCount) { best = entry; bestCount = count; }
  }
  return best;
}
// Physical bead ordering: STONES are regrouped into the canonical colour progression in ascending
// family rank, keeping the original relative order inside a family (stable, deterministic) and
// leaving every non-stone component (spacer / loop charm anchor) exactly where it was.
export function orderLumiRainbowSequence(sequence) {
  const list = Array.isArray(sequence) ? sequence : [];
  const stoneSlots = [];
  const stones = [];
  list.forEach((component, index) => {
    if (component?.componentType === 'stone') { stoneSlots.push(index); stones.push({ component, index }); }
  });
  if (stones.length < 2) return sequence;
  // Group by canonical colour family, then inside each family rotate through the DIFFERENT stone
  // identities so a family block shows several stone types instead of one repeated stone, and so
  // repeated instances of the same identity are never adjacent while alternatives exist.
  const families = new Map();
  for (const entry of stones) {
    const family = rainbowFamilyOfStone(entry.component.materialId);
    const rank = rainbowColorRank(family);
    if (!families.has(rank)) families.set(rank, []);
    families.get(rank).push(entry);
  }
  const ordered = [];
  for (const rank of [...families.keys()].sort((left, right) => left - right)) {
    // Owner rule: one material = ONE contiguous block. Inside a colour family the materials are
    // grouped (never interleaved), so the block order stays material-contiguous and hue-monotonic.
    const group = [...families.get(rank)].sort((left, right) => String(left.component.materialId).localeCompare(String(right.component.materialId)) || (Number(left.component.sizeMm) - Number(right.component.sizeMm)) || (left.index - right.index));
    ordered.push(...group);
  }
  const next = [...list];
  stoneSlots.forEach((slot, index) => { next[slot] = ordered[index].component; });
  return Object.freeze(next);
}
export function reorderLumiRainbowPhysical(physical) {
  if (!physical || !Array.isArray(physical.sequence)) return physical;
  const ordered = orderLumiRainbowSequence(physical.sequence);
  if (ordered === physical.sequence) return physical;
  return Object.freeze({ ...physical, sequence: ordered });
}
// Diagnostics helper (not used by the engine pipeline): the stone family ranks in physical order.
export function rainbowFamilyRanks(sequence) {
  return (Array.isArray(sequence) ? sequence : [])
    .filter((component) => component?.componentType === 'stone')
    .map((component) => rainbowColorRank(rainbowFamilyOfStone(component.materialId)));
}
// A correctly rainbow-ordered ring descends at most once (the single circular wrap).
export function countRainbowDescents(sequence) {
  const ranks = rainbowFamilyRanks(sequence);
  let descents = 0;
  for (let index = 1; index < ranks.length; index += 1) if (ranks[index] < ranks[index - 1]) descents += 1;
  return descents;
}

// ---------------------------------------------------------------------------
// Layout diagnostics (used by tests, the render gallery and the owner report).
// ---------------------------------------------------------------------------
const stoneInstances = (selected) => (Array.isArray(selected?.sequence) ? selected.sequence : []).filter((item) => item?.componentType === 'stone');
function circularRuns(values) {
  const list = Array.isArray(values) ? values : [];
  if (!list.length) return { max: 0, pairs: 0 };
  let start = 0;
  for (let index = 1; index < list.length; index += 1) if (list[index] !== list[0]) { start = index; break; }
  const rotated = list.slice(start).concat(list.slice(0, start));
  let max = 1, current = 1, pairs = 0;
  for (let index = 1; index < rotated.length; index += 1) {
    if (rotated[index] === rotated[index - 1]) { current += 1; pairs += 1; } else current = 1;
    if (current > max) max = current;
  }
  return { max, pairs };
}
function quadrantSizeCounts(sizes) {
  const list = Array.isArray(sizes) ? sizes : [];
  const quadrants = [ {}, {}, {}, {} ];
  list.forEach((size, index) => {
    const quadrant = Math.min(3, Math.floor((index / Math.max(1, list.length)) * 4));
    quadrants[quadrant][size] = (quadrants[quadrant][size] || 0) + 1;
  });
  return quadrants.map((counts) => Object.freeze({ ...counts }));
}
export function analyzeLumiRainbowLayout(selected) {
  const instances = stoneInstances(selected);
  const materialIds = instances.map((item) => item.materialId);
  const families = instances.map((item) => rainbowFamilyOfStone(item.materialId));
  const sizes = instances.map((item) => Number(item.sizeMm));
  const stoneRuns = circularRuns(materialIds);
  const familyRuns = circularRuns(families);
  const quadrants = quadrantSizeCounts(sizes);
  const sizeTotals = {};
  for (const size of sizes) sizeTotals[size] = (sizeTotals[size] || 0) + 1;
  const sizeKeys = Object.keys(sizeTotals).map(Number).sort((a, b) => a - b);
  const largest = sizeKeys.at(-1) ?? null;
  const smallest = sizeKeys[0] ?? null;
  const share = (size) => {
    if (size == null || !sizeTotals[size]) return null;
    const maxPerQuadrant = Math.max(...quadrants.map((counts) => counts[size] || 0));
    return Number((maxPerQuadrant / sizeTotals[size]).toFixed(3));
  };
  return Object.freeze({
    stoneBeadCount: instances.length,
    distinctStoneTypes: new Set(materialIds).size,
    distinctColorFamilies: new Set(families).size,
    distinctChromaticFamilies: new Set(families.filter(isChromaticRainbowFamily)).size,
    maxExactStoneRun: stoneRuns.max,
    adjacentSameStonePairs: stoneRuns.pairs,
    maxColorFamilyRun: familyRuns.max,
    adjacentSameFamilyPairs: familyRuns.pairs,
    rainbowDescents: countRainbowDescents(selected?.sequence),
    materialIds: Object.freeze([...materialIds]),
    families: Object.freeze([...families]),
    sizes: Object.freeze([...sizes]),
    sizeTotals: Object.freeze({ ...sizeTotals }),
    sizeCountsByQuadrant: Object.freeze(quadrants),
    largestSize: largest,
    smallestSize: smallest,
    largestSizeQuadrantShare: share(largest),
    smallestSizeQuadrantShare: share(smallest)
  });
}
