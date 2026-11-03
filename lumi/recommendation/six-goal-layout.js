// Six-goal dedicated layout layer (CASE A + CASE B).
//
// NARROW SCOPE. This module only RE-ARRANGES already-selected beads:
//   - it never selects or replaces a stone,
//   - it never changes weekday / Pyrite / goal-coverage / diversity / talisman rules,
//   - it is only reached for the two explicit `goalCount === 6` target conditions, from
//     `lumi/service/index.js`. Every other case keeps its previous behaviour untouched.
//
// CASE B - 6 goals + STONES_ONLY + MIXED
//   Canonical ring: 22 stones, 11 positions per side, mirrored size motif
//     10 6 10 6 10 10 10 6 10 6 10
//   (14 x 10mm + 8 x 6mm = 188mm). The exact motif is used at wrists where the existing mixed
//   completion window can host it. Smaller wrists adapt deterministically and symmetrically from
//   the outside in: outermost mirrored 10mm pair -> 6mm first, then 6mm -> 4mm as a last resort.
//   Larger wrists add mirror-safe bead pairs at the motif ends only. Never a random extension.
//
// CASE A - 6 goals + WITH_TALISMAN (`with_charm`) + MIXED
//   Owner grouped visual grammar, talisman anchored at the top. Per side, from the talisman:
//     2 major -> 1 small accent -> 2 major -> 1 small accent -> base group
//   mirrored left/right; the base group carries the most mass and grows first on larger wrists.
//   Material blocks may be re-ordered (owner-approved) but the selected identity set, colours and
//   talisman are never changed.

export const LUMI_SIX_GOAL_LAYOUT_VERSION = '1.0.0';

const MM_SIZES = Object.freeze([4, 6, 10]);
const MAX_IDENTITY_BLOCK = 6;
const BLOCK_ORDERS = Object.freeze([Object.freeze([2, 3, 1, 4, 5, 6]), Object.freeze([1, 2, 3, 4, 5, 6])]);
const SEARCH_NODE_BUDGET = 200000;
const CANDIDATE_LIMIT = 4000;
const STATE_KEEP = 6;

const normalizeSizes = (raw) => {
  const list = (Array.isArray(raw) ? raw : []).map(Number).filter((size) => MM_SIZES.includes(size));
  return [...new Set(list)].sort((left, right) => left - right);
};

// Owner adaptation ladder as a step cost: 10<->6 is the first resort, 6<->4 only when physically
// necessary, and jumping over the accent size is the most expensive step.
const stepCost = (from, to) => {
  if (from === to) return 0;
  if ((from === 10 && to === 6) || (from === 6 && to === 10)) return 1;
  if ((from === 6 && to === 4) || (from === 4 && to === 6)) return 3;
  return 4;
};

export function sixGoalIdentityOrder(sequence) {
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

// Deterministic per-mirror-pair size search. `pairs[i]`:
//   { options, preferred, weight, locked } - locked pairs are the canonical 10mm x 3 signature and
//   only keep 10mm on the first pass, so the signature survives whenever a legal fit exists.
// The best few pick vectors per (total, 10-slot, 6-slot) state are kept so the block-layout search
// can also use equal-length alternatives (for example a compensated pair swap that creates the
// adjacent 6mm slots two hue-adjacent 6mm-only stones need).
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

// Contiguous block partition of the stone slots, honouring each identity's own supported sizes.
// `barriers` are stone-position boundaries a block may never span. Rotations of the circular
// material order are tried deterministically; failed (blockIndex, cursor) states are memoised.
export function partitionBlocks(slotSizes, ids, supportsById, barriers = [], allowRotation = true) {
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
      for (let boundary = start; boundary < start + size - 1; boundary += 1) if (blocked.has(boundary)) return false;
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
      instanceId: 'lumi-six-goal-' + index + '-' + materialId,
      componentType: 'stone',
      materialId,
      role: roleOf.get(materialId) ?? null,
      sizeMm: entry.size,
      sourcePatternToken: sourceOf.get(materialId) ?? 'six_goal'
    });
  }
  return Object.freeze(parts.map((part) => Object.freeze(part)));
};

const sizeTotalsOf = (sizes) => Object.freeze({ 4: sizes.filter((s) => s === 4).length, 6: sizes.filter((s) => s === 6).length, 10: sizes.filter((s) => s === 10).length });
const onlyCounts = (ids, allowedOf) => {
  let ten = 0;
  let six = 0;
  for (const id of ids) {
    const allowed = allowedOf(id);
    if (!allowed.length) continue;
    if (allowed.every((size) => size === 10)) ten += 1;
    else if (allowed.every((size) => size === 6)) six += 1;
  }
  return { ten, six };
};

// ---------------------------------------------------------------------------
// CASE B - 6 goals + STONES_ONLY + MIXED
// ---------------------------------------------------------------------------
const CASE_B_PER_SIDE = Object.freeze([10, 6, 10, 6, 10, 10, 10, 6, 10, 6, 10]);
export const LUMI_SIX_GOAL_STONES_ONLY_CANONICAL_MOTIF = CASE_B_PER_SIDE;
const CASE_B_BASE = Object.freeze([...CASE_B_PER_SIDE, ...CASE_B_PER_SIDE]);

export function buildSixGoalStonesOnlyMixed(sequence, allowedSizesFor, options = {}) {
  const targetLengthMm = Number(options.targetLengthMm) || 0;
  const windowBelowMm = Number.isFinite(Number(options.windowBelowMm)) ? Number(options.windowBelowMm) : 5;
  const { ids, roleOf, sourceOf } = sixGoalIdentityOrder(sequence);
  if (ids.length < 2 || !(targetLengthMm > 0)) return Object.freeze({ applied: false, reason: 'SIX_GOAL_LAYOUT_INPUT_INVALID', sequence: null });
  const allowedOf = (id) => normalizeSizes(allowedSizesFor ? allowedSizesFor(id) : null);
  const supportsById = ids.map((id) => { const allowed = allowedOf(id); return (size) => allowed.includes(size); });
  const floors = onlyCounts(ids, allowedOf);
  const targetMin = targetLengthMm - windowBelowMm;
  const targetMax = targetLengthMm;
  for (const extraPairs of [0, 1, 2, 3, 4]) {
    const extras = new Array(extraPairs).fill(6);
    const ring = [...[...extras].reverse(), ...CASE_B_BASE, ...extras];
    const size = ring.length;
    const pairs = [];
    for (let index = 0; index < size / 2; index += 1) {
      const preferred = ring[index];
      const inSignature = index >= extraPairs + 4 && index <= extraPairs + 6;
      pairs.push({ preferred, locked: inSignature, weight: (extraPairs > 0 && index < extraPairs) ? 6 : 11 - Math.abs(index - (size / 2 - 1)), options: MM_SIZES });
    }
    for (const lockSignature of [true, false]) {
      const solutions = enumeratePairSolutions(pairs, { targetMinMm: targetMin, targetMaxMm: targetMax, lockSignature, minTenSlots: floors.ten, minSixSlots: floors.six });
      for (const picks of solutions) {
        const slotSizes = new Array(size).fill(0);
        for (let index = 0; index < pairs.length; index += 1) { slotSizes[index] = picks[index]; slotSizes[size - 1 - index] = picks[index]; }
        if (slotSizes.some((value) => !value)) continue;
        const partition = partitionBlocks(slotSizes, ids, supportsById, [], true);
        if (!partition) continue;
        const slotPlan = slotSizes.map((value) => ({ kind: 'stone', size: value }));
        const stoneSlotIndices = slotPlan.map((_, index) => index);
        const result = buildSequence(slotPlan, stoneSlotIndices, { ...partition, ids, roleOf, sourceOf });
        if (!result) continue;
        const builtSizes = result.filter((part) => part.componentType === 'stone').map((part) => Number(part.sizeMm));
        const usedMm = builtSizes.reduce((sum, value) => sum + value, 0);
        return Object.freeze({
          applied: true,
          reason: lockSignature ? null : 'SIX_GOAL_LAYOUT_SIGNATURE_RELAXED',
          sequence: result,
          diagnostics: Object.freeze({
            layoutVersion: LUMI_SIX_GOAL_LAYOUT_VERSION,
            case: 'SIX_GOAL_STONES_ONLY_MIXED',
            canonicalMotif: Object.freeze([...CASE_B_PER_SIDE]),
            canonicalLengthMm: 188,
            stoneCount: builtSizes.length,
            sizeTotals: sizeTotalsOf(builtSizes),
            usedLengthMm: usedMm,
            targetLengthMm,
            signaturePreserved: lockSignature,
            addedMirrorPairs: extraPairs,
            distinctIdentities: ids.length,
            materialBlockCount: partition.blocks.length
          })
        });
      }
    }
  }
  return Object.freeze({ applied: false, reason: 'SIX_GOAL_LAYOUT_BLOCK_INFEASIBLE', sequence: null });
}

// ---------------------------------------------------------------------------
// CASE A - 6 goals + WITH_TALISMAN (with_charm) + MIXED
// ---------------------------------------------------------------------------
// Side grammar from the talisman: major, major, accent, major, major, accent, then the base group.
const CASE_A_SIDE_PREFIX = Object.freeze([10, 10, 6, 10, 10, 6]);
const CASE_A_ACCENT_WEIGHT = 40;

export function buildSixGoalWithTalisman(sequence, allowedSizesFor, options = {}) {
  const targetLengthMm = Number(options.targetLengthMm) || 0;
  const windowBelowMm = Number.isFinite(Number(options.windowBelowMm)) ? Number(options.windowBelowMm) : 5;
  const extraLengthMm = Number(options.extraLengthMm) || 0;
  const input = Array.isArray(sequence) ? sequence : [];
  const charm = input.find((component) => component?.componentType === 'loop_charm') || null;
  if (!charm) return Object.freeze({ applied: false, reason: 'SIX_GOAL_LAYOUT_TALISMAN_MISSING', sequence: null });
  const { ids, roleOf, sourceOf } = sixGoalIdentityOrder(input);
  if (ids.length < 2 || !(targetLengthMm > 0)) return Object.freeze({ applied: false, reason: 'SIX_GOAL_LAYOUT_INPUT_INVALID', sequence: null });
  const allowedOf = (id) => normalizeSizes(allowedSizesFor ? allowedSizesFor(id) : null);
  const supportsById = ids.map((id) => { const allowed = allowedOf(id); return (size) => allowed.includes(size); });
  const floors = onlyCounts(ids, allowedOf);
  const charmMm = Number(charm.footprintMm) || 0;
  const targetMax = targetLengthMm - extraLengthMm - charmMm;
  const targetMin = targetMax - windowBelowMm;
  for (const baseCount of [2, 1, 3, 4, 5]) {
    const perSide = [...CASE_A_SIDE_PREFIX, ...new Array(baseCount).fill(10)];
    const side = perSide.length;
    const canonicalLeft = [...perSide].reverse();
    const canonical = [...canonicalLeft, ...perSide];
    const pairs = [];
    for (let distance = 0; distance < side; distance += 1) {
      const leftSlot = side - 1 - distance;
      const preferred = canonical[leftSlot];
      const isAccent = preferred === 6;
      const isBase = distance >= CASE_A_SIDE_PREFIX.length;
      // First resort = the side majors nearest the talisman; accent positions and the base group are
      // expensive so the owner's hierarchy (base heaviest, accents small) survives adaptation.
      // Majors stay 6mm/10mm (a major never collapses to 4mm); accents stay small (4mm/6mm) and are
      // never upgraded, so the small separators survive every adaptation.
      pairs.push({ preferred, locked: false, weight: isAccent ? CASE_A_ACCENT_WEIGHT : isBase ? 20 : distance + 1, options: isAccent ? [4, 6] : [6, 10] });
    }
    const solutions = enumeratePairSolutions(pairs, { targetMinMm: targetMin, targetMaxMm: Math.max(targetMin, targetMax), lockSignature: false, minTenSlots: floors.ten, minSixSlots: floors.six });
    for (const picks of solutions) {
      const slotSizes = new Array(side * 2).fill(0);
      for (let index = 0; index < side; index += 1) { slotSizes[side - 1 - index] = picks[index]; slotSizes[side + index] = picks[index]; }
      if (slotSizes.some((value) => !value)) continue;
      const partition = partitionBlocks(slotSizes, ids, supportsById, [side - 1], true);
      if (!partition) continue;
      const slotPlan = [];
      const stoneSlotIndices = [];
      for (let index = 0; index < side; index += 1) { stoneSlotIndices.push(slotPlan.length); slotPlan.push({ kind: 'stone', size: slotSizes[index] }); }
      slotPlan.push({ kind: 'charm', component: charm });
      for (let index = 0; index < side; index += 1) { stoneSlotIndices.push(slotPlan.length); slotPlan.push({ kind: 'stone', size: slotSizes[side + index] }); }
      const result = buildSequence(slotPlan, stoneSlotIndices, { ...partition, ids, roleOf, sourceOf });
      if (!result) continue;
      const builtSizes = result.filter((part) => part.componentType === 'stone').map((part) => Number(part.sizeMm));
      const stoneMm = builtSizes.reduce((sum, value) => sum + value, 0);
      return Object.freeze({
        applied: true,
        reason: null,
        sequence: result,
        diagnostics: Object.freeze({
          layoutVersion: LUMI_SIX_GOAL_LAYOUT_VERSION,
          case: 'SIX_GOAL_WITH_TALISMAN',
          sideMotif: Object.freeze([...perSide]),
          baseGroupBeads: baseCount * 2,
          stoneCount: builtSizes.length,
          sizeTotals: sizeTotalsOf(builtSizes),
          stoneLengthMm: stoneMm,
          talismanFootprintMm: charmMm,
          usedLengthMm: stoneMm + extraLengthMm + charmMm,
          targetLengthMm,
          distinctIdentities: ids.length,
          materialBlockCount: partition.blocks.length
        })
      });
    }
  }
  return Object.freeze({ applied: false, reason: 'SIX_GOAL_LAYOUT_BLOCK_INFEASIBLE', sequence: null });
}