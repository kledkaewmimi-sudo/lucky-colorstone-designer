// Five-goal dedicated layout layer: 5 goals + STONES_ONLY + MIXED only.
//
// NARROW SCOPE. Like the six-goal layer this module only RE-ARRANGES already-selected beads:
//   - it never selects or replaces a stone,
//   - it never changes weekday / Pyrite / goal-coverage / diversity / colour / talisman rules,
//   - it never relaxes goal scoring, eligibility or the distinct-stone diversity target,
//   - it is only reached for the explicit `5 goals + STONES_ONLY + MIXED` target condition, from
//     `lumi/service/index.js`. Every other configuration keeps its previous behaviour untouched.
//
// Owner reference: `reports/lumi/five-goal-stones-only/refs/5goal-stones-only-reference.jpg`
// (measured with the polar-unwrap tooling in `reports/lumi/five-goal-stones-only/_analysis/`).
//
// WHAT THE REFERENCE SHOWS (measured, 21 beads clockwise from 12 o'clock):
//   - grouped colour journey: gold/brown -> soft pink -> gold -> pink/red -> purple -> blue ->
//     black/dark -> green -> soft pink (wrapping back to gold),
//   - LARGE beads arrive as short visual groups of TWO (pairs), spread right around the ring,
//   - SMALL beads act as punctuation between those groups, sometimes as a pair,
//   - 12 large + 9 small beads, no run longer than two of the same size anywhere,
//   - measured large : small diameter ratio 1.64-1.70, i.e. the catalog's 10mm : 6mm pair.
//
// THE PATTERN (canonical ring, mirrored about the centre stone):
//   L L S L S S L S L L S L L S L S S L S L L
//   = 12 x 10mm + 9 x 6mm = 174mm, maximum same-size run 2.
// The ring stays a strict palindrome (the engine's hard mirror requirement); the reference itself
// is not exactly mirrored, so the grouping character is reproduced rather than the raw sequence.

export const LUMI_FIVE_GOAL_LAYOUT_VERSION = '1.0.0';

const MM_SIZES = Object.freeze([4, 6, 10]);
const MAX_IDENTITY_BLOCK = 6;
const BLOCK_ORDERS = Object.freeze([Object.freeze([2, 3, 1, 4, 5, 6]), Object.freeze([1, 2, 3, 4, 5, 6])]);
const SEARCH_NODE_BUDGET = 200000;
const CANDIDATE_LIMIT = 4000;
const STATE_KEEP = 6;

// Owner adaptation ladder as a step cost: 10<->6 is the first resort, 6<->4 only when physically
// necessary, and jumping over the accent size is the most expensive step (same policy as the
// six-goal layer, so the two dedicated layouts adapt identically).
const stepCost = (from, to) => {
  if (from === to) return 0;
  if ((from === 10 && to === 6) || (from === 6 && to === 10)) return 1;
  if ((from === 6 && to === 4) || (from === 4 && to === 6)) return 3;
  return 4;
};

const normalizeSizes = (raw) => {
  const list = (Array.isArray(raw) ? raw : []).map(Number).filter((size) => MM_SIZES.includes(size));
  return [...new Set(list)].sort((left, right) => left - right);
};

const sizeTotalsOf = (sizes) => Object.freeze({ 4: sizes.filter((s) => s === 4).length, 6: sizes.filter((s) => s === 6).length, 10: sizes.filter((s) => s === 10).length });

const longestSameSizeRun = (sizes) => {
  let best = 0;
  let run = 0;
  let previous = null;
  for (const size of sizes) {
    run = size === previous ? run + 1 : 1;
    previous = size;
    if (run > best) best = run;
  }
  return best;
};

// Reference-derived half ring (left of the centre stone) and the canonical mirrored ring.
const CANONICAL_HALF = Object.freeze([10, 6, 10, 10, 6, 6, 10, 10, 6, 10]);
const CANONICAL_CENTRE = 6;
export const LUMI_FIVE_GOAL_STONES_ONLY_CANONICAL_RING = Object.freeze([
  ...CANONICAL_HALF,
  CANONICAL_CENTRE,
  ...[...CANONICAL_HALF].reverse()
]);
export const LUMI_FIVE_GOAL_STONES_ONLY_CANONICAL_LENGTH_MM = 174;
export const LUMI_FIVE_GOAL_MAX_SIZE_RUN = 2;
export const LUMI_FIVE_GOAL_LARGE_FRACTION_TARGET = 0.5714; // 12 large / 21 beads, the reference ratio
// Odd ring sizes only: an odd count keeps the reference's single centre stone on the mirror axis.
const CANDIDATE_RING_SIZES = Object.freeze([21, 19, 23, 17, 25, 15, 27]);

export function fiveGoalIdentityOrder(sequence) {
  const ids = [];
  const roleOf = new Map();
  const sourceOf = new Map();
  for (const component of Array.isArray(sequence) ? sequence : []) {
    if (component?.componentType !== 'stone') continue;
    const id = String(component.materialId);
    if (!roleOf.has(id)) { ids.push(id); roleOf.set(id, component.role ?? null); sourceOf.set(id, component.sourcePatternToken ?? null); }
  }
  return Object.freeze({ ids: Object.freeze(ids), roleOf, sourceOf });
}

// Canonical preferred ring for an odd size: grow/shrink the reference motif symmetrically at the
// seam so the mirrored grammar (and the palindrome property) is preserved at every size.
export function fiveGoalCanonicalRing(size) {
  const target = Number(size);
  const base = LUMI_FIVE_GOAL_STONES_ONLY_CANONICAL_RING;
  if (!(target > 2) || target % 2 === 0) return null;
  if (target < 5) return null;
  const delta = target - base.length;
  if (delta === 0) return [...base];
  if (delta > 0) {
    if (delta % 2 !== 0) return null;
    const pairs = delta / 2;
    return [...new Array(pairs).fill(6), ...base, ...new Array(pairs).fill(6)];
  }
  const pairs = -delta / 2;
  if (base.length - 2 * pairs < 5) return null;
  return base.slice(pairs, base.length - pairs);
}

// Deterministic size search over the mirrored pairs. `pairs[i]` describes the pair nearest the
// centre stone first (index 0) so the inner signature pairs carry the highest weight.
function enumeratePairSolutions(pairs, { targetMinMm, targetMaxMm, lockSignature = true, minTenSlots = 0, minSixSlots = 0 }) {
  const remainingMax = new Array(pairs.length + 1).fill(0);
  for (let index = pairs.length - 1; index >= 0; index -= 1) remainingMax[index] = remainingMax[index + 1] + 2 * Math.max(...pairs[index].options);
  let states = new Map([[0, [{ total: 0, cost: 0, ten: 0, six: 0, picks: [] }]]]);
  for (let index = 0; index < pairs.length; index += 1) {
    const pair = pairs[index];
    const filtered = lockSignature && pair.locked ? pair.options.filter((size) => size === pair.preferred) : pair.options;
    const usable = filtered.length ? filtered : pair.options;
    const next = new Map();
    for (const bucket of states.values()) {
      for (const state of bucket) {
        for (const size of usable) {
          const total = state.total + 2 * size;
          if (total > targetMaxMm) continue;
          if (total + remainingMax[index + 1] < targetMinMm) continue;
          const ten = state.ten + (size === 10 ? 2 : 0);
          const six = state.six + (size === 6 ? 2 : 0);
          const cost = state.cost + stepCost(pair.preferred, size) * (pair.weight ?? 1) + (size === pair.preferred ? 0 : 1);
          const key = total + '|' + ten + '|' + six;
          const list = next.get(key) || [];
          list.push({ total, cost, ten, six, picks: [...state.picks, size] });
          list.sort((left, right) => left.cost - right.cost);
          while (list.length > STATE_KEEP) list.pop();
          next.set(key, list);
        }
      }
    }
    states = next;
    if (!states.size) return [];
  }
  const feasible = [];
  for (const bucket of states.values()) {
    for (const state of bucket) {
      if (state.total < targetMinMm || state.total > targetMaxMm) continue;
      if (state.ten < minTenSlots || state.six < minSixSlots) continue;
      feasible.push(state);
    }
  }
  feasible.sort((left, right) => left.cost - right.cost || right.total - left.total);
  return feasible.slice(0, CANDIDATE_LIMIT).map((state) => state.picks);
}

// Local clone of the six-goal sequence builder so the six-goal module stays byte-identical.
const buildSequence = (slotPlan, stoneSlotIndices, plan) => {
  const { blocks, order, ids, roleOf, sourceOf } = plan;
  const materialAt = new Map();
  blocks.forEach((slots, index) => { for (const slot of slots) materialAt.set(slot, ids[order[index]]); });
  const parts = [];
  for (let index = 0; index < slotPlan.length; index += 1) {
    const entry = slotPlan[index];
    if (entry.kind === 'charm') { parts.push(entry.component); continue; }
    const stonePosition = stoneSlotIndices.indexOf(index);
    const materialId = materialAt.get(stonePosition);
    if (!materialId) return null;
    parts.push({
      instanceId: 'lumi-five-goal-' + index + '-' + materialId,
      componentType: 'stone',
      materialId,
      role: roleOf.get(materialId) ?? null,
      sizeMm: entry.size,
      sourcePatternToken: sourceOf.get(materialId) ?? 'five_goal'
    });
  }
  return Object.freeze(parts.map((part) => Object.freeze(part)));
};

const isPalindromeSizes = (ring, centre) => {
  for (let offset = 1; centre - offset >= 0 && centre + offset < ring.length; offset += 1) {
    if (ring[centre - offset] !== ring[centre + offset]) return false;
  }
  return true;
};

export function buildFiveGoalStonesOnlyMixed(sequence, allowedSizesFor, options = {}) {
  const targetLengthMm = Number(options.targetLengthMm) || 0;
  const windowBelowMm = Number.isFinite(Number(options.windowBelowMm)) ? Number(options.windowBelowMm) : 5;
  const maxRun = Number.isFinite(Number(options.maxSizeRun)) ? Number(options.maxSizeRun) : LUMI_FIVE_GOAL_MAX_SIZE_RUN;
  const { ids, roleOf, sourceOf } = fiveGoalIdentityOrder(sequence);
  if (ids.length < 2 || !(targetLengthMm > 0)) return Object.freeze({ applied: false, reason: 'FIVE_GOAL_LAYOUT_INPUT_INVALID', sequence: null });
  const allowedOf = (id) => normalizeSizes(allowedSizesFor ? allowedSizesFor(id) : null);
  const supportsById = ids.map((id) => { const allowed = allowedOf(id); return (size) => allowed.includes(size); });
  const floors = onlyCounts(ids, allowedOf);
  const targetMin = targetLengthMm - windowBelowMm;
  const targetMax = targetLengthMm;

  const attempts = [];
  for (const ringSize of CANDIDATE_RING_SIZES) {
    const canonical = fiveGoalCanonicalRing(ringSize);
    if (!canonical) continue;
    const centre = (ringSize - 1) / 2;
    if (!isPalindromeSizes(canonical, centre)) continue;
    // The centre stone is not part of any mirrored pair, so its size has to be removed from the
    // length window before the pair search (otherwise the built ring overshoots by centreSize).
    const centreSize = canonical[centre];
    const pairs = [];
    for (let offset = 1; offset <= centre; offset += 1) {
      const preferred = canonical[centre - offset];
      // Inner pairs hold the signature (weight high, locked on the first pass); the seam pairs
      // absorb the wrist adaptation first, exactly like the six-goal ladder.
      const distanceFromCentre = offset - 1;
      pairs.push({
        preferred,
        locked: distanceFromCentre <= 2,
        weight: 11 - distanceFromCentre,
        options: MM_SIZES
      });
    }
    for (const lockSignature of [true, false]) {
      const solutions = enumeratePairSolutions(pairs, { targetMinMm: targetMin - centreSize, targetMaxMm: targetMax - centreSize, lockSignature, minTenSlots: floors.ten, minSixSlots: floors.six });
      for (const picks of solutions) {
        const slotSizes = new Array(ringSize).fill(0);
        for (let index = 0; index < pairs.length; index += 1) {
          slotSizes[centre - 1 - index] = picks[index];
          slotSizes[centre + 1 + index] = picks[index];
        }
        slotSizes[centre] = canonical[centre];
        if (slotSizes.some((value) => !value)) continue;
        // Grammar gate: the reference never shows a same-size run longer than two.
        const run = longestSameSizeRun(slotSizes);
        const largeFraction = slotSizes.filter((size) => size === 10).length / slotSizes.length;
        const total = slotSizes.reduce((sum, value) => sum + value, 0);
        if (total < targetMin || total > targetMax) continue;
        const fourCount = slotSizes.filter((size) => size === 4).length;
        attempts.push({
          ringSize, picks, slotSizes, run, largeFraction, total, lockSignature,
          fourCount,
          grammarDistance: Math.abs(largeFraction - LUMI_FIVE_GOAL_LARGE_FRACTION_TARGET)
        });
      }
    }
  }
  if (!attempts.length) return Object.freeze({ applied: false, reason: 'FIVE_GOAL_LAYOUT_NO_SIZE_SOLUTION', sequence: null });

  // Selection: best grammar first (short runs, then the reference ratio, then fewest pair changes),
  // then the smallest deviation from the canonical 21-bead ring.
  const acceptable = attempts.filter((attempt) => attempt.run <= maxRun);
  const pool = acceptable.length ? acceptable : attempts.slice().sort((left, right) => left.run - right.run).slice(0, 400);
  // Priority: no long same-size runs, then the reference's two-size grammar (fewest 4mm beads),
  // then the reference's large:small ratio, then closeness to the canonical 21-bead ring.
  pool.sort((left, right) => left.run - right.run
    || left.fourCount - right.fourCount
    || left.grammarDistance - right.grammarDistance
    || Math.abs(left.ringSize - 21) - Math.abs(right.ringSize - 21)
    || left.ringSize - right.ringSize);

  for (const attempt of pool) {
    const partition = partitionBlocks(attempt.slotSizes, ids, supportsById, [], true);
    if (!partition) continue;
    const slotPlan = attempt.slotSizes.map((value) => ({ kind: 'stone', size: value }));
    const stoneSlotIndices = slotPlan.map((_, index) => index);
    const result = buildSequence(slotPlan, stoneSlotIndices, { ...partition, ids, roleOf, sourceOf });
    if (!result) continue;
    const builtSizes = result.filter((part) => part.componentType === 'stone').map((part) => Number(part.sizeMm));
    const usedMm = builtSizes.reduce((sum, value) => sum + value, 0);
    return Object.freeze({
      applied: true,
      reason: attempt.run <= maxRun ? null : 'FIVE_GOAL_LAYOUT_RUN_RELAXED',
      sequence: result,
      diagnostics: Object.freeze({
        layoutVersion: LUMI_FIVE_GOAL_LAYOUT_VERSION,
        case: 'FIVE_GOAL_STONES_ONLY_MIXED',
        canonicalRing: Object.freeze([...LUMI_FIVE_GOAL_STONES_ONLY_CANONICAL_RING]),
        canonicalLengthMm: LUMI_FIVE_GOAL_STONES_ONLY_CANONICAL_LENGTH_MM,
        ringSize: attempt.ringSize,
        stoneCount: builtSizes.length,
        sizeTotals: sizeTotalsOf(builtSizes),
        maxSameSizeRun: attempt.run,
        largeFraction: Number(attempt.largeFraction.toFixed(4)),
        usedLengthMm: usedMm,
        targetLengthMm,
        signaturePreserved: attempt.lockSignature,
        grammarRelaxed: attempt.run > maxRun,
        distinctIdentities: ids.length,
        materialBlockCount: partition.blocks.length
      })
    });
  }
  return Object.freeze({ applied: false, reason: 'FIVE_GOAL_LAYOUT_BLOCK_INFEASIBLE', sequence: null });
}

// ---------------------------------------------------------------------------
// Shared helpers (local copies; the six-goal module is never imported for behaviour)
// ---------------------------------------------------------------------------
function onlyCounts(ids, allowedOf) {
  let ten = 0;
  let six = 0;
  for (const id of ids) {
    const allowed = allowedOf(id);
    if (!allowed.length) continue;
    if (allowed.every((size) => size === 10)) ten += 1;
    else if (allowed.every((size) => size === 6)) six += 1;
  }
  return { ten, six };
}

function partitionBlocks(slotSizes, ids, supportsById, barriers = [], allowRotation = true) {
  const total = slotSizes.length;
  const blocked = new Set(barriers);
  const rotations = allowRotation ? ids.map((_, index) => index) : [0];
  for (const rotation of rotations) {
    const order = ids.map((_, index) => (index + rotation) % ids.length);
    const result = [];
    const failed = new Set();
    let nodes = 0;
    let aborted = false;
    const canCross = (start, size) => {
      for (let offset = 1; offset < size; offset += 1) if (blocked.has(start + offset)) return false;
      return true;
    };
    const dfs = (index, cursor) => {
      if (index === order.length) return cursor === total;
      const memoKey = index + '|' + cursor;
      if (failed.has(memoKey)) return false;
      if (nodes >= SEARCH_NODE_BUDGET) { aborted = true; return false; }
      nodes += 1;
      const remainingBlocks = order.length - index;
      const remainingSlots = total - cursor;
      if (remainingSlots < remainingBlocks) { failed.add(memoKey); return false; }
      for (const sizes of BLOCK_ORDERS) {
        for (const size of sizes) {
          if (size > MAX_IDENTITY_BLOCK) continue;
          if (size > remainingSlots - (remainingBlocks - 1)) continue;
          if (!canCross(cursor, size)) continue;
          const afterSlots = remainingSlots - size;
          const afterBlocks = remainingBlocks - 1;
          if (afterBlocks > 0 && (afterSlots < afterBlocks || afterSlots > afterBlocks * MAX_IDENTITY_BLOCK)) continue;
          if (afterBlocks === 0 && afterSlots !== 0) continue;
          let ok = true;
          for (let offset = 0; offset < size; offset += 1) {
            if (!supportsById[order[index]](slotSizes[cursor + offset])) { ok = false; break; }
          }
          if (!ok) continue;
          const slots = [];
          for (let offset = 0; offset < size; offset += 1) slots.push(cursor + offset);
          result.push(slots);
          if (dfs(index + 1, cursor + size)) return true;
          result.pop();
        }
      }
      failed.add(memoKey);
      return false;
    };
    if (dfs(0, 0)) return { blocks: result.map((slots) => Object.freeze(slots)), order };
    if (aborted) continue;
  }
  return null;
}
