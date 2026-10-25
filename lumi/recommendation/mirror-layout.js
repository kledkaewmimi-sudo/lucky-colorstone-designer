// Mixed-size mirror-symmetry layout (ALL goal counts - independent of Rainbow Mode).
//
// This is a PHYSICAL ARRANGEMENT post-processor: it only permutes which already-legal bead instance
// occupies which already-legal stone slot, so the stone identity set, sizes, counts, talisman,
// goal coverage, weekday legality and physical fit are all preserved. It never changes selection.
export const LUMI_MIRROR_LAYOUT_VERSION = '1.0.0';

const stonesOf = (sequence) => (Array.isArray(sequence) ? sequence : []).filter((item) => item?.componentType === 'stone');
const distinctSizes = (sequence) => new Set(stonesOf(sequence).map((item) => Number(item.sizeMm))).size;

// The mirror axis is the physical anchor of the bracelet: the LUCK clover loop charm when present
// (it is the visual anchor), otherwise the centre stone of the mirrored stone run.
export function mirrorAnchorIndex(sequence) {
  const list = Array.isArray(sequence) ? sequence : [];
  const charm = list.findIndex((item) => item?.componentType === 'loop_charm');
  if (charm >= 0) return charm;
  const slots = list.map((item, index) => (item?.componentType === 'stone' ? index : -1)).filter((index) => index >= 0);
  if (!slots.length) return -1;
  return slots[Math.floor((slots.length - 1) / 2)];
}

// Comparable opposite-side size pairs around the anchor.
// Comparable opposite-side size pairs around the real physical axis. WITH_TALISMAN uses the loop
// charm (the visual anchor); STONES_ONLY uses the centre stone (odd count) or the axis BETWEEN the
// two centre stones (even count), which is where the renderer's mirrored geometry actually folds.
export function mirrorPairs(sequence) {
  const list = Array.isArray(sequence) ? sequence : [];
  const stones = list.map((item, index) => (item?.componentType === 'stone' ? index : -1)).filter((index) => index >= 0);
  if (stones.length < 3) return [];
  const charm = list.findIndex((item) => item?.componentType === 'loop_charm');
  const pairs = [];
  if (charm >= 0) {
    for (let distance = 1; charm - distance >= 0 && charm + distance < list.length; distance += 1) {
      const left = list[charm - distance];
      const right = list[charm + distance];
      if (left?.componentType !== 'stone' || right?.componentType !== 'stone') continue;
      pairs.push({ left, right, distance });
    }
    return pairs;
  }
  const count = stones.length;
  const centre = Math.floor(count / 2);
  if (count % 2 === 1) {
    for (let offset = 1; centre - offset >= 0 && centre + offset < count; offset += 1) {
      pairs.push({ left: list[stones[centre - offset]], right: list[stones[centre + offset]], distance: offset });
    }
    return pairs;
  }
  for (let offset = 0; centre - 1 - offset >= 0 && centre + offset < count; offset += 1) {
    pairs.push({ left: list[stones[centre - 1 - offset]], right: list[stones[centre + offset]], distance: offset + 1 });
  }
  return pairs;
}
export function mirrorSymmetry(sequence) {
  const pairs = mirrorPairs(sequence);
  const matches = pairs.filter((pair) => Number(pair.left.sizeMm) === Number(pair.right.sizeMm)).length;
  return Object.freeze({
    anchorIndex: mirrorAnchorIndex(sequence),
    mirrorPairMatches: matches,
    mirrorPairMismatches: pairs.length - matches,
    comparablePairs: pairs.length,
    mirrorSymmetryScore: pairs.length ? Number((matches / pairs.length).toFixed(4)) : null
  });
}

function assign(sequence, slots, instances) {
  const next = [...sequence];
  slots.forEach((slot, index) => { next[slot] = instances[index]; });
  return Object.freeze(next);
}

// Free mirror layout: instances may move anywhere, so each mirror pair can receive an equal size.
// Sizes are consumed largest-first so the visual mass steps down from the anchor (owner reference).
function layoutFreeMirror(sequence) {
  const list = Array.isArray(sequence) ? sequence : [];
  const slots = list.map((item, index) => (item?.componentType === 'stone' ? index : -1)).filter((index) => index >= 0);
  if (slots.length < 3) return sequence;
  const buckets = new Map();
  for (const slot of slots) {
    const size = Number(list[slot].sizeMm);
    if (!buckets.has(size)) buckets.set(size, []);
    buckets.get(size).push(list[slot]);
  }
  const sizeKeys = [...buckets.keys()].sort((left, right) => right - left);
  const take = (size) => buckets.get(size).pop();
  const anchorPosition = slots.indexOf(mirrorAnchorIndex(list));
  const ordered = new Array(slots.length).fill(null);
  const pairs = [];
  for (let offset = 1; ; offset += 1) {
    const left = anchorPosition - offset;
    const right = anchorPosition + offset;
    if (left < 0 || right >= slots.length) break;
    pairs.push([left, right]);
  }
  for (const [left, right] of pairs) {
    const shared = sizeKeys.find((size) => buckets.get(size).length >= 2);
    if (shared != null) { ordered[left] = take(shared); ordered[right] = take(shared); continue; }
    const available = sizeKeys.filter((size) => buckets.get(size).length > 0);
    if (available.length) ordered[left] = take(available[0]);
    if (available.length > 1) ordered[right] = take(available[1]);
    else if (available.length === 1 && buckets.get(available[0]).length > 0) ordered[right] = take(available[0]);
  }
  // Strictly consume the remaining pool - the assignment stays an exact permutation of the beads.
  const leftovers = [];
  for (const size of sizeKeys) while (buckets.get(size).length > 0) leftovers.push(take(size));
  const fillOrder = [anchorPosition, ...ordered.map((_, index) => index).filter((index) => index !== anchorPosition)];
  for (const index of fillOrder) if (ordered[index] == null && leftovers.length) ordered[index] = leftovers.shift();
  const instances = ordered.map((item, index) => (item == null ? list[slots[index]] : item));
  // (the pool always has exactly slots.length entries, so every slot is filled from the pool)
  return assign(list, slots, instances);
}
// Locked mirror layout: material blocks must stay contiguous (Rainbow Mode priority), so sizes can
// only be re-ordered between equal-material instances inside the same block.
function layoutLockedMirror(sequence) {
  const list = Array.isArray(sequence) ? sequence : [];
  const slots = list.map((item, index) => (item?.componentType === 'stone' ? index : -1)).filter((index) => index >= 0);
  if (slots.length < 3) return sequence;
  const next = [...list];
  let start = 0;
  const blocks = [];
  for (let index = 0; index <= slots.length; index += 1) {
    if (index === slots.length || list[slots[index]].materialId !== list[slots[start]].materialId) {
      blocks.push(slots.slice(start, index));
      start = index;
    }
  }
  const pairs = mirrorPairs(list).map((pair) => [slots.indexOf(list.indexOf(pair.left)), slots.indexOf(list.indexOf(pair.right))]);
  const paired = new Map(pairs);
  for (const [left, right] of pairs) {
    const leftItem = next[slots[left]];
    const rightItem = next[slots[right]];
    if (Number(leftItem.sizeMm) === Number(rightItem.sizeMm)) continue;
    // Find an equal-material swap inside the right block that matches the left size.
    const rightBlock = blocks.find((block) => block.includes(slots[right]));
    if (!rightBlock) continue;
    const candidate = rightBlock.find((slot) => Number(next[slot].sizeMm) === Number(leftItem.sizeMm) && Number(next[slot].sizeMm) !== Number(rightItem.sizeMm));
    if (candidate == null) continue;
    const leftBlock = blocks.find((block) => block.includes(slots[left]));
    const donor = leftBlock ? leftBlock.find((slot) => Number(next[slot].sizeMm) === Number(rightItem.sizeMm)) : null;
    if (donor == null) continue;
    const tmp = next[slots[left]];
    next[slots[left]] = next[candidate];
    next[candidate] = tmp;
    if (donor !== slots[left]) { const tmp2 = next[donor]; next[donor] = next[slots[right]]; next[slots[right]] = tmp2; }
  }
  return Object.freeze(next);
}

export function layoutLumiMirrorSequence(sequence, { lockedMaterialBlocks = false } = {}) {
  const list = Array.isArray(sequence) ? sequence : [];
  if (distinctSizes(list) < 2) return sequence;
  const before = mirrorSymmetry(list);
  if (before.mirrorSymmetryScore === 1) return sequence;
  const candidate = lockedMaterialBlocks ? layoutLockedMirror(list) : layoutFreeMirror(list);
  // Safety contract: the layout is a PERMUTATION of the existing beads, so the (material, size)
  // multiset must be byte-identical; otherwise keep the original sequence untouched.
  const multisetKey = (value) => value.filter((item) => item?.componentType === 'stone').map((item) => item.materialId + '@' + item.sizeMm).sort().join(',');
  if (multisetKey(candidate) !== multisetKey(list)) return sequence;
  const after = mirrorSymmetry(candidate);
  if (after.mirrorSymmetryScore == null) return sequence;
  if (before.mirrorSymmetryScore == null || after.mirrorSymmetryScore >= before.mirrorSymmetryScore) return candidate;
  return sequence;
}

export function layoutLumiMirrorPhysical(physical, options) {
  if (!physical || !Array.isArray(physical.sequence)) return physical;
  const ordered = layoutLumiMirrorSequence(physical.sequence, options);
  if (ordered === physical.sequence) return physical;
  return Object.freeze({ ...physical, sequence: ordered });
}

// ---------------------------------------------------------------------------
// 5/6-goal Rainbow MIXED-SIZE refinement.
//
// Material blocks stay contiguous and the rainbow hue order is untouched. Only the bead SIZE inside
// each block is reassigned, from the SAME global size multiset (so the total bracelet length, and
// therefore the physical fit, is unchanged), subject to each stone's own supported sizes.
// ---------------------------------------------------------------------------
export function materialBlocks(sequence) {
  const list = Array.isArray(sequence) ? sequence : [];
  const slots = list.map((item, index) => (item?.componentType === 'stone' ? index : -1)).filter((index) => index >= 0);
  const blocks = [];
  let start = 0;
  for (let index = 0; index <= slots.length; index += 1) {
    if (index === slots.length || list[slots[index]].materialId !== list[slots[start]].materialId) {
      blocks.push({ materialId: list[slots[start]].materialId, slots: slots.slice(start, index), sizes: slots.slice(start, index).map((slot) => Number(list[slot].sizeMm)) });
      start = index;
    }
  }
  return blocks.filter((block) => block.slots.length > 0);
}

export function optimizeLumiBlockSizes(sequence, allowedSizesFor) {
  try { return optimizeLumiBlockSizesInner(sequence, allowedSizesFor); } catch { return sequence; }
}
function optimizeLumiBlockSizesInner(sequence, allowedSizesFor) {
  const list = Array.isArray(sequence) ? sequence : [];
  const slots = list.map((item, index) => (item?.componentType === 'stone' ? index : -1)).filter((index) => index >= 0);
  if (slots.length < 4) return sequence;
  const allows = (materialId, size) => { const supported = allowedSizesFor?.(materialId); return !Array.isArray(supported) || supported.length === 0 || supported.includes(size); };
  // Start from the current legal assignment; every improvement below is a SWAP, so the global size
  // multiset (and therefore the total bracelet length and the physical fit) never changes.
  const assigned = slots.map((slot) => Number(list[slot].sizeMm));
  const pool = new Map();
  for (const size of assigned) pool.set(size, (pool.get(size) || 0) + 1);
  const release = (size) => pool.set(size, (pool.get(size) || 0) + 1);
  const claim = (size) => pool.set(size, pool.get(size) - 1);
  const anchorIndex = mirrorAnchorIndex(list);
  const anchorPosition = slots.indexOf(anchorIndex);
  for (let offset = 1; ; offset += 1) {
    const left = anchorPosition - offset;
    const right = anchorPosition + offset;
    if (left < 0 || right >= slots.length) break;
    if (assigned[left] === assigned[right]) continue;
    const leftMaterial = list[slots[left]].materialId;
    const rightMaterial = list[slots[right]].materialId;
    const shared = [...pool.keys()].filter((size) => pool.get(size) >= 2 && allows(leftMaterial, size) && allows(rightMaterial, size)).sort((a, b) => b - a)[0];
    if (shared == null) continue;
    release(assigned[left]); release(assigned[right]);
    claim(shared); claim(shared);
    assigned[left] = shared; assigned[right] = shared;
  }
  const next = [...list];
  slots.forEach((slot, index) => {
    if (Number(list[slot].sizeMm) === assigned[index]) return;
    next[slot] = Object.freeze({ ...list[slot], sizeMm: assigned[index] });
  });
  return Object.freeze(next);
}
export function blockSizeFallbackReason(sequence, target = 0.9) {
  const symmetry = mirrorSymmetry(sequence);
  if (symmetry.mirrorSymmetryScore == null || symmetry.mirrorSymmetryScore >= target) return null;
  const sizes = new Map();
  for (const item of stonesOf(sequence)) sizes.set(Number(item.sizeMm), (sizes.get(Number(item.sizeMm)) || 0) + 1);
  const oddCount = [...sizes.values()].filter((count) => count < 2).length;
  if (oddCount > 0) return 'INSUFFICIENT_COMPATIBLE_SIZE_PAIRS';
  if (!distinctSizes(sequence) || distinctSizes(sequence) < 2) return 'PHYSICAL_SLOT_PARITY_CONSTRAINT';
  return 'MATERIAL_BLOCK_CONSTRAINT';
}

// ---------------------------------------------------------------------------
// 5/6-goal Rainbow MIXED-SIZE ring alignment (owner review: "actual ring positions").
//
// The motif pass above pairs MOTIF slots (i vs K-1-i). The visible bracelet is the EXPANDED ring:
// the fit engine adds the centre closure stone(s) and the repeated edge fillers, so the motif axis
// is offset from the rendered axis. This pass re-assigns the bead SIZE PER PHYSICAL SLOT - material
// blocks and the rainbow hue order are untouched - so the rendered ring is palindromic around the
// REAL axis: mirror pairs come from the actual ring distance to the LUCK clover loop-charm anchor
// (WITH_TALISMAN) or from the true centre slot / slot midpoint (STONES_ONLY).
//
// Only catalog-supported sizes are used, only stone components change, and the running total must
// stay inside the existing mixed completion window. The caller re-validates the design through
// prepareLumiStep3Import and keeps the original sequence when the import rejects the result.
const RING_SIZES_MM = Object.freeze([4, 6, 10]);
const ringComponentLengthMm = (component) => {
  if (!component) return 0;
  const raw = component.componentType === 'stone'
    ? component.sizeMm
    : (component.footprintMm ?? component.effectiveLengthMm ?? component.sizeMm);
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : 0;
};
function ringSupportedSizes(component, allowed) {
  const usable = (Array.isArray(allowed) ? allowed : []).map(Number).filter((size) => RING_SIZES_MM.includes(size));
  if (usable.length) return [...new Set(usable)].sort((left, right) => left - right);
  const current = Number(component?.sizeMm);
  return RING_SIZES_MM.includes(current) ? [current] : [];
}
function ringPreference(options, target) {
  return [...options].sort((left, right) => Math.abs(left - target) - Math.abs(right - target) || right - left);
}
export function ringMirrorFallbackReason({ forcedMismatchPairs = 0, relaxedPairs = 0, mirrorSymmetryScore = null } = {}) {
  if (mirrorSymmetryScore != null && mirrorSymmetryScore >= 0.9) return null;
  if (forcedMismatchPairs > 0) return 'INSUFFICIENT_COMPATIBLE_SIZE_PAIRS';
  if (relaxedPairs > 0) return 'FIT_PLAN_CONSTRAINT';
  if (mirrorSymmetryScore == null) return 'PHYSICAL_SLOT_PARITY_CONSTRAINT';
  return 'MATERIAL_BLOCK_CONSTRAINT';
}
// Deterministic, bounded (<= a few dozen mirror pairs, sizes in {4,6,10}) per-slot size assignment.
// Returns the original sequence untouched whenever the aligned design is not strictly better,
// is out of the mixed completion window, or has no legal supported size.
export function alignLumiRingMirrorSizes(sequence, allowedSizesFor, options = {}) {
  const list = Array.isArray(sequence) ? sequence : [];
  const targetLengthMm = Number(options.targetLengthMm) || 0;
  const windowBelowMm = Number.isFinite(Number(options.windowBelowMm)) ? Number(options.windowBelowMm) : 5;
  const extraLengthMm = Number(options.extraLengthMm) || 0;
  const keep = (reason, plan = null) => Object.freeze({
    sequence: list, applied: false, reason,
    changedCount: 0,
    relaxedPairs: plan?.relaxedPairs ?? 0,
    forcedMismatchPairs: plan?.forcedMismatchPairs ?? 0,
    totalLengthMm: plan?.totalLengthMm ?? null,
    previousLengthMm: plan?.previousLengthMm ?? null,
    mirrorPairs: mirrorSymmetry(list)
  });
  const stoneSlots = list.map((item, index) => (item?.componentType === 'stone' ? index : -1)).filter((index) => index >= 0);
  if (stoneSlots.length < 4) return keep('PHYSICAL_SLOT_PARITY_CONSTRAINT');
  if (!(targetLengthMm > 0)) return keep('FIT_PLAN_CONSTRAINT');
  const pairSlots = mirrorPairs(list)
    .map((pair) => [list.indexOf(pair.left), list.indexOf(pair.right)])
    .filter(([left, right]) => left >= 0 && right >= 0 && left !== right);
  if (!pairSlots.length) return keep('PHYSICAL_SLOT_PARITY_CONSTRAINT');
  const pairedSlots = new Set();
  for (const [left, right] of pairSlots) { pairedSlots.add(left); pairedSlots.add(right); }
  const current = new Map(stoneSlots.map((slot) => [slot, Number(list[slot].sizeMm)]));
  const fixedLengthMm = list.reduce((sum, item) => sum + (item?.componentType === 'stone' ? 0 : ringComponentLengthMm(item)), 0) + extraLengthMm;
  const currentTotalMm = fixedLengthMm + stoneSlots.reduce((sum, slot) => sum + ringComponentLengthMm(list[slot]), 0);
  const items = [];
  let forcedMismatchPairs = 0;
  for (const [left, right] of pairSlots) {
    const leftOptions = ringSupportedSizes(list[left], allowedSizesFor?.(list[left].materialId));
    const rightOptions = ringSupportedSizes(list[right], allowedSizesFor?.(list[right].materialId));
    const shared = leftOptions.filter((size) => rightOptions.includes(size));
    if (!shared.length) forcedMismatchPairs += 1;
    const choices = [];
    if (shared.length) {
      const natural = (current.get(left) + current.get(right)) / 2;
      for (const size of ringPreference(shared, natural)) choices.push({ sizes: [[left, size], [right, size]], relaxed: 0 });
    }
    // Relaxed choices (one size per side) are only needed to reach the fit window; each one costs a
    // compared-but-unequal mirror pair, so the search prefers matched pairs first.
    for (const leftSize of ringPreference(leftOptions, current.get(left))) {
      for (const rightSize of ringPreference(rightOptions, current.get(right))) {
        if (leftSize === rightSize && shared.includes(leftSize)) continue;
        choices.push({ sizes: [[left, leftSize], [right, rightSize]], relaxed: 1 });
      }
    }
    items.push(choices);
  }
  for (const slot of stoneSlots) {
    if (pairedSlots.has(slot)) continue;
    items.push(ringPreference(ringSupportedSizes(list[slot], allowedSizesFor?.(list[slot].materialId)), current.get(slot)).map((size) => ({ sizes: [[slot, size]], relaxed: 0 })));
  }
  const choiceCost = (choice) => choice.sizes.reduce((sum, [slot, size]) => sum + (current.get(slot) === size ? 0 : 1), 0);
  const layers = [new Map([[0, { relaxed: 0, changes: 0, previousTotal: null, choiceIndex: null }]])];
  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const previous = layers[itemIndex];
    const next = new Map();
    for (const [total, state] of previous) {
      items[itemIndex].forEach((choice, choiceIndex) => {
        const step = choice.sizes.reduce((sum, [, size]) => sum + size, 0);
        const candidate = { relaxed: state.relaxed + choice.relaxed, changes: state.changes + choiceCost(choice), previousTotal: total, choiceIndex };
        const existing = next.get(total + step);
        if (!existing || candidate.relaxed < existing.relaxed || (candidate.relaxed === existing.relaxed && candidate.changes < existing.changes)) next.set(total + step, candidate);
      });
    }
    layers.push(next);
  }
  const within = [];
  for (const [total, state] of layers[layers.length - 1]) {
    const totalLengthMm = total + fixedLengthMm;
    if (totalLengthMm < targetLengthMm - windowBelowMm || totalLengthMm > targetLengthMm) continue;
    within.push({ total, totalLengthMm, state });
  }
  if (!within.length) return keep('FIT_PLAN_CONSTRAINT');
  within.sort((left, right) => left.state.relaxed - right.state.relaxed
    || Math.abs(left.totalLengthMm - currentTotalMm) - Math.abs(right.totalLengthMm - currentTotalMm)
    || left.state.changes - right.state.changes
    || right.totalLengthMm - left.totalLengthMm);
  const chosen = within[0];
  const sizes = new Map();
  let cursor = chosen.total;
  for (let layerIndex = layers.length - 1; layerIndex > 0; layerIndex -= 1) {
    const state = layers[layerIndex].get(cursor);
    for (const [slot, size] of items[layerIndex - 1][state.choiceIndex].sizes) sizes.set(slot, size);
    cursor = state.previousTotal;
  }
  const next = [...list];
  let changedCount = 0;
  for (const [slot, size] of sizes) {
    if (Number(list[slot].sizeMm) === size) continue;
    next[slot] = Object.freeze({ ...list[slot], sizeMm: size });
    changedCount += 1;
  }
  const before = mirrorSymmetry(list);
  const after = mirrorSymmetry(Object.freeze(next));
  const reason = ringMirrorFallbackReason({ forcedMismatchPairs, relaxedPairs: chosen.state.relaxed, mirrorSymmetryScore: after.mirrorSymmetryScore });
  const plan = { relaxedPairs: chosen.state.relaxed, forcedMismatchPairs, totalLengthMm: chosen.totalLengthMm, previousLengthMm: currentTotalMm };
  if (changedCount === 0 || after.mirrorSymmetryScore == null) return keep(reason, plan);
  if (before.mirrorSymmetryScore != null && after.mirrorSymmetryScore <= before.mirrorSymmetryScore) return keep(reason, plan);
  return Object.freeze({
    sequence: Object.freeze(next), applied: true, reason,
    changedCount, relaxedPairs: chosen.state.relaxed, forcedMismatchPairs,
    totalLengthMm: chosen.totalLengthMm, previousLengthMm: currentTotalMm, mirrorPairs: after
  });
}

// ---------------------------------------------------------------------------
// Mixed-size RHYTHM distribution (ALL goal counts, mixed bead mode only).
//
// After selection and hue ordering are decided, the size multiset must be SPREAD around the ring:
// 10mm accents belong in a few balanced groups (never one long lower-arc band), 4mm beads must
// separate instead of forming one strip, and no half/quadrant may carry the visual mass alone.
//
// This pass only MOVES sizes between equal-sized mirror units (a mirror pair is one unit, an
// unpaired slot is one unit). It therefore:
//   - keeps the size multiset, so the bracelet length and the physical fit are byte-identical,
//   - keeps every mirror pair equal, so the measured mirror symmetry cannot regress,
//   - keeps every material in place, so material blocks and the hue order are untouched,
//   - only uses sizes the stone's own catalog record supports.
const RHYTHM_RUN_CAP = Object.freeze({ 4: 3, 6: 4, 10: 3 });
const RHYTHM_SEPARATOR = 0;
function circularRunsOf(values) {
  const list = Array.isArray(values) ? values : [];
  const length = list.length;
  if (!length) return [];
  if (list.every((value) => value === list[0])) return [{ value: list[0], length, start: 0 }];
  let first = 0;
  for (let index = 1; index < length; index += 1) if (list[index] !== list[0]) { first = index; break; }
  const rotated = list.slice(first).concat(list.slice(0, first));
  const runs = [];
  let begin = 0;
  for (let index = 1; index <= rotated.length; index += 1) {
    if (index === rotated.length || rotated[index] !== rotated[begin]) {
      runs.push({ value: rotated[begin], length: index - begin, start: (first + begin) % length });
      begin = index;
    }
  }
  return runs;
}
const rhythmCount = (list, size) => list.filter((value) => value === size).length;
const rhythmSum = (list) => list.reduce((total, value) => total + value, 0);
export function sizeRhythmMetrics(values) {
  const list = Array.isArray(values) ? values : [];
  const length = list.length;
  const runs = circularRunsOf(list).filter((run) => run.value !== RHYTHM_SEPARATOR);
  const stones = list.filter((value) => value !== RHYTHM_SEPARATOR).length;
  const quadrantOf = (index) => Math.min(3, Math.floor((index / Math.max(1, length)) * 4));
  const quadrants = [0, 1, 2, 3].map((quadrant) => list.filter((value, index) => value !== RHYTHM_SEPARATOR && quadrantOf(index) === quadrant));
  const maxRun = (size) => runs.filter((run) => run.value === size).reduce((best, run) => Math.max(best, run.length), 0);
  const quadShare = (size) => {
    const count = rhythmCount(list, size);
    if (!count) return null;
    return Number((Math.max(...quadrants.map((quadrant) => rhythmCount(quadrant, size))) / count).toFixed(3));
  };
  const lowerArc = [...quadrants[1], ...quadrants[2]];
  const upperArc = [...quadrants[3], ...quadrants[0]];
  const mass = rhythmSum(list);
  const groups = (size) => runs.filter((run) => run.value === size && run.length > 0).map((run) => run.start + (run.length - 1) / 2).sort((left, right) => left - right);
  const gapDeviation = (size) => {
    const centres = groups(size);
    if (centres.length < 2) return null;
    const gaps = centres.map((centre, index) => ((index + 1 < centres.length ? centres[index + 1] : centres[0] + length) - centre));
    const ideal = length / gaps.length;
    return Number((gaps.reduce((total, gap) => total + Math.abs(gap - ideal), 0) / length).toFixed(3));
  };
  return Object.freeze({
    stoneBeadCount: stones,
    sizeTotals: Object.freeze({ 4: rhythmCount(list, 4), 6: rhythmCount(list, 6), 10: rhythmCount(list, 10) }),
    longestRun: runs.reduce((best, run) => Math.max(best, run.length), 0),
    maxRunBySize: Object.freeze({ 4: maxRun(4), 6: maxRun(6), 10: maxRun(10) }),
    runsOverCap: runs.filter((run) => run.length > (RHYTHM_RUN_CAP[run.value] ?? 3)).length,
    quadrantShare: Object.freeze({ 4: quadShare(4), 6: quadShare(6), 10: quadShare(10) }),
    lowerArcShare: Object.freeze({
      4: rhythmCount(list, 4) ? Number((rhythmCount(lowerArc, 4) / rhythmCount(list, 4)).toFixed(3)) : null,
      10: rhythmCount(list, 10) ? Number((rhythmCount(lowerArc, 10) / rhythmCount(list, 10)).toFixed(3)) : null
    }),
    lowerArcMassShare: Number((rhythmSum(lowerArc) / Math.max(1, mass)).toFixed(3)),
    accentGroupGapDeviation: Object.freeze({ 4: gapDeviation(4), 10: gapDeviation(10) }),
    distinctSizes: Object.freeze([...new Set(list.filter((value) => value !== RHYTHM_SEPARATOR))].sort((left, right) => left - right))
  });
}
// Lower is better. Penalises long same-size runs, quadrant/arc concentration and un-even accent
// spacing; the 10mm accent terms carry the largest weight (owner priority).
export function sizeRhythmCost(values) {
  const list = Array.isArray(values) ? values : [];
  const length = list.length;
  const stones = list.filter((value) => value !== RHYTHM_SEPARATOR).length;
  if (stones < 4) return 0;
  const runs = circularRunsOf(list).filter((run) => run.value !== RHYTHM_SEPARATOR);
  const quadrantOf = (index) => Math.min(3, Math.floor((index / Math.max(1, length)) * 4));
  const quadrants = [0, 1, 2, 3].map((quadrant) => list.filter((value, index) => value !== RHYTHM_SEPARATOR && quadrantOf(index) === quadrant));
  const lowerArc = [...quadrants[1], ...quadrants[2]];
  let cost = 0;
  for (const run of runs) {
    const cap = RHYTHM_RUN_CAP[run.value] ?? 3;
    if (run.length > cap) cost += (run.length - cap) * 6;
  }
  for (const size of [4, 6, 10]) {
    const count = rhythmCount(list, size);
    if (!count) continue;
    const weight = size === 10 ? 1 : size === 4 ? 0.7 : 0.35;
    if (count >= 4) {
      const counts = quadrants.map((quadrant) => rhythmCount(quadrant, size));
      cost += weight * 8 * ((Math.max(...counts) - count / 4) / count);
      if (Math.min(...counts) === 0) cost += weight * 4;
    }
    cost += weight * 12 * (Math.abs(rhythmCount(lowerArc, size) - count / 2) / count);
  }
  const mass = rhythmSum(list);
  cost += Math.abs(rhythmSum(lowerArc) - mass / 2) / Math.max(1, mass) * 8;
  for (const [size, weight] of [[10, 1.2], [4, 0.6]]) {
    const centres = runs.filter((run) => run.value === size).map((run) => run.start + (run.length - 1) / 2).sort((left, right) => left - right);
    if (centres.length < 2) continue;
    const gaps = centres.map((centre, index) => ((index + 1 < centres.length ? centres[index + 1] : centres[0] + length) - centre));
    const ideal = length / gaps.length;
    cost += weight * 6 * (gaps.reduce((total, gap) => total + Math.abs(gap - ideal), 0) / length);
  }
  return Number(cost.toFixed(6));
}
// Realise as much of the balanced template as the material size support allows: for each unit kind
// the per-size unit counts are fixed (so the bead multiset stays identical), and units that cannot
// host a size keep a legal one. Deterministic scarcity-first assignment.
// Deterministic bounded steepest descent over equal-size mirror units. Because a move exchanges the
// sizes of two units, the multiset (length), the mirror pairing and every material stay untouched.
// Evenly spaced template for the unit sizes (accent sizes first, the most common size fills the
// gaps). Used as a second deterministic seed so the descent can escape the radial gradient that the
// legacy largest-first layout produces.
export function rhythmUnitTemplate(unitSizes, unitKinds) {
  const result = unitSizes.slice();
  // Sizes may only move between units of the SAME kind: a mirror pair consumes two beads of a size
  // and an unpaired slot consumes one, so mixing kinds would change the size multiset (and therefore
  // the bracelet length).
  for (const kind of ['pair', 'single']) {
    const indices = unitSizes.map((value, index) => (unitKinds[index] === kind ? index : -1)).filter((index) => index >= 0);
    if (indices.length < 2) continue;
    const sizes = indices.map((index) => unitSizes[index]);
    const occurrences = [...new Set(sizes)];
    const order = occurrences.slice().sort((left, right) => sizes.filter((size) => size === left).length - sizes.filter((size) => size === right).length || right - left);
    const arrangement = new Array(indices.length).fill(null);
    for (const size of order) {
      const members = sizes.map((value, index) => (value === size ? index : -1)).filter((index) => index >= 0);
      const free = arrangement.map((value, index) => (value == null ? index : -1)).filter((index) => index >= 0);
      if (!members.length) continue;
      if (members.length >= free.length) { free.forEach((position) => { arrangement[position] = size; }); continue; }
      const chosen = [];
      for (let step = 0; step < members.length; step += 1) {
        let pick = Math.min(free.length - 1, Math.round(((step + 0.5) * free.length) / members.length));
        while (chosen.includes(pick)) pick = (pick + 1) % free.length;
        chosen.push(pick);
      }
      chosen.sort((left, right) => left - right).forEach((pick) => { arrangement[free[pick]] = size; });
    }
    indices.forEach((unitIndex, position) => { if (arrangement[position] != null) result[unitIndex] = arrangement[position]; });
  }
  return result.every((value) => value != null) ? result : null;
}
// Realise as much of the balanced template as the material size support allows: for each unit kind
// the per-size unit counts are fixed (so the bead multiset stays identical), and units that cannot
// host a size keep a legal one. Deterministic scarcity-first assignment.
// Realise as much of the balanced template as the material size support allows. For each unit kind
// the per-size unit counts are fixed (so the bead multiset stays identical); an exact DP then picks
// the legal assignment closest to the template.
export function rhythmProjectTemplate(units, template, accepts) {
  const result = units.map((unit) => unit.size);
  for (const kind of ['pair', 'single']) {
    const indices = units.map((unit, index) => (unit.kind === kind ? index : -1)).filter((index) => index >= 0);
    if (!indices.length) continue;
    const want = indices.map((index) => template[index]);
    const need = new Map();
    for (const index of indices) need.set(units[index].size, (need.get(units[index].size) || 0) + 1);
    const sizes = [4, 6, 10].filter((size) => (need.get(size) || 0) > 0);
    const keyOf = (used4, used6) => used4 * 64 + used6;
    let states = new Map([[keyOf(0, 0), { cost: 0, back: null, choice: null }]]);
    const layers = [states];
    for (let step = 0; step < indices.length; step += 1) {
      const next = new Map();
      for (const [key, state] of states) {
        const used4 = Math.floor(key / 64);
        const used6 = key % 64;
        for (const size of sizes) {
          const used = size === 4 ? used4 : size === 6 ? used6 : step - used4 - used6;
          if (used >= (need.get(size) || 0)) continue;
          if (!accepts(units[indices[step]], size)) continue;
          const cost = state.cost + (want[step] === size ? 0 : 1);
          const nextKey = keyOf(used4 + (size === 4 ? 1 : 0), used6 + (size === 6 ? 1 : 0));
          const existing = next.get(nextKey);
          if (!existing || cost < existing.cost) next.set(nextKey, { cost, back: key, choice: size });
        }
      }
      if (!next.size) return null;
      states = next;
      layers.push(states);
    }
    let bestKey = null;
    let bestCost = Infinity;
    for (const [key, state] of states) {
      const used4 = Math.floor(key / 64);
      const used6 = key % 64;
      if (used4 !== (need.get(4) || 0) || used6 !== (need.get(6) || 0) || indices.length - used4 - used6 !== (need.get(10) || 0)) continue;
      if (state.cost < bestCost) { bestCost = state.cost; bestKey = key; }
    }
    if (bestKey == null) return null;
    let key = bestKey;
    for (let step = indices.length - 1; step >= 0; step -= 1) {
      const state = layers[step + 1].get(key);
      result[indices[step]] = state.choice;
      key = state.back;
    }
  }
  return result;
}
// Deterministic bounded steepest descent over equal-size mirror units.
//  - mode 'instance' (1-4 goals / free mirror layout): a unit takes any size and the stone INSTANCE
//    moves with it, so the (material,size) multiset, the fit and the mirror pairing are all preserved.
//  - mode 'size'     (5/6 rainbow, locked material blocks): only the size value moves, and only when
//    every stone in the unit supports the incoming size, so material blocks and hue order stay put.
export function optimizeLumiSizeRhythm(sequence, allowedSizesFor, options = {}) {
  const list = Array.isArray(sequence) ? sequence : [];
  const instanceMode = options.mode === 'instance';
  const targetLengthMm = Number(options.targetLengthMm) || 0;
  const windowBelowMm = Number.isFinite(Number(options.windowBelowMm)) ? Number(options.windowBelowMm) : 5;
  const extraLengthMm = Number(options.extraLengthMm) || 0;
  const maxSteps = Math.max(0, Math.min(64, Number(options.maxSteps ?? 32)));
  const valuesOf = (items) => items.map((item) => (item?.componentType === 'stone' ? Number(item.sizeMm) : RHYTHM_SEPARATOR));
  const metricList = valuesOf(list);
  const costBefore = sizeRhythmCost(metricList);
  const before = sizeRhythmMetrics(metricList);
  const keep = (reason) => Object.freeze({ sequence: list, applied: false, reason, changedCount: 0, before, after: before, costBefore, costAfter: costBefore, steps: 0 });
  const stoneSlots = list.map((item, index) => (item?.componentType === 'stone' ? index : -1)).filter((index) => index >= 0);
  if (stoneSlots.length < 4) return keep('PHYSICAL_SLOT_PARITY_CONSTRAINT');
  if (costBefore === 0) return keep(null);
  const supported = new Map(stoneSlots.map((slot) => [slot, ringSupportedSizes(list[slot], allowedSizesFor?.(list[slot].materialId))]));
  const pairSlots = mirrorPairs(list)
    .map((pair) => [list.indexOf(pair.left), list.indexOf(pair.right)])
    .filter(([left, right]) => left >= 0 && right >= 0 && left !== right);
  const paired = new Set();
  for (const [left, right] of pairSlots) { paired.add(left); paired.add(right); }
  const units = [];
  for (const [left, right] of pairSlots) {
    if (Number(list[left].sizeMm) !== Number(list[right].sizeMm)) continue;
    units.push({ kind: 'pair', slots: [left, right], size: Number(list[left].sizeMm) });
  }
  for (const slot of stoneSlots) if (!paired.has(slot)) units.push({ kind: 'single', slots: [slot], size: Number(list[slot].sizeMm) });
  if (!units.length) return keep('PHYSICAL_SLOT_PARITY_CONSTRAINT');
  const accepts = (unit, size) => instanceMode || unit.slots.every((slot) => supported.get(slot).includes(size));
  const movableSlotList = units.reduce((total, unit) => total.concat(unit.slots), []);
  if (instanceMode && movableSlotList.length !== stoneSlots.length) return keep('RHYTHM_FROZEN_SLOTS');
  // A size swap is legal when both units can host the other's size and, for a pair/single exchange,
  // when the moved slot counts match (otherwise the size multiset would change).
  // Length budget: in 'size' mode a unit may take a different size when the bracelet total stays
  // inside the existing mixed completion window (the caller re-validates with the Step 3 import).
  const windowMinMm = targetLengthMm > 0 ? targetLengthMm - windowBelowMm : -Infinity;
  const windowMaxMm = targetLengthMm > 0 ? targetLengthMm : Infinity;
  const baseTotalMm = list.reduce((sum, item) => sum + ringComponentLengthMm(item), 0) + extraLengthMm;
  const descend = (seed) => {
    const unitSizes = seed.slice();
    const working = metricList.slice();
    const apply = () => {
      for (let index = 0; index < units.length; index += 1) for (const slot of units[index].slots) working[slot] = unitSizes[index];
    };
    apply();
    let cost = sizeRhythmCost(working);
    let total = baseTotalMm;
    let steps = 0;
    const scan = (compound) => {
      const candidates = [];
      const push = (changes) => {
        let delta = 0;
        for (const change of changes) {
          if (change.size === unitSizes[change.index]) return;
          if (!accepts(units[change.index], change.size)) return;
          delta += units[change.index].slots.length * (change.size - unitSizes[change.index]);
        }
        if (total + delta < windowMinMm || total + delta > windowMaxMm) return;
        candidates.push({ changes, delta });
      };
      if (instanceMode) {
        for (let left = 0; left < units.length; left += 1) {
          for (let right = left + 1; right < units.length; right += 1) {
            if (units[left].kind !== units[right].kind) continue;
            push([{ index: left, size: unitSizes[right] }, { index: right, size: unitSizes[left] }]);
          }
        }
        return candidates;
      }
      for (let index = 0; index < units.length; index += 1) for (const size of [4, 6, 10]) push([{ index, size }]);
      if (!compound) return candidates;
      // Compensation pass: the mixed completion window is tight, so a single unit change is often
      // impossible; pair it with one opposite change so the bracelet length stays inside the window.
      for (let left = 0; left < units.length; left += 1) {
        for (const leftSize of [4, 6, 10]) {
          if (leftSize === unitSizes[left] || !accepts(units[left], leftSize)) continue;
          const leftDelta = units[left].slots.length * (leftSize - unitSizes[left]);
          if (total + leftDelta >= windowMinMm && total + leftDelta <= windowMaxMm) continue;
          for (let right = 0; right < units.length; right += 1) {
            if (right === left) continue;
            for (const rightSize of [4, 6, 10]) {
              const rightDelta = units[right].slots.length * (rightSize - unitSizes[right]);
              if (rightDelta === 0 || Math.sign(rightDelta) === Math.sign(leftDelta)) continue;
              push([{ index: left, size: leftSize }, { index: right, size: rightSize }]);
            }
          }
        }
      }
      return candidates;
    };
    const runPass = (compound, budget) => {
      let passes = 0;
      while (steps < maxSteps && passes < budget) {
        let move = null;
        for (const candidate of scan(compound)) {
          const previous = candidate.changes.map((change) => unitSizes[change.index]);
          for (const change of candidate.changes) unitSizes[change.index] = change.size;
          apply();
          const trial = sizeRhythmCost(working);
          candidate.changes.forEach((change, position) => { unitSizes[change.index] = previous[position]; });
          if (trial < cost - 1e-9 && (!move || trial < move.cost - 1e-9)) move = { candidate, cost: trial };
        }
        if (!move) break;
        for (const change of move.candidate.changes) unitSizes[change.index] = change.size;
        total += move.candidate.delta;
        cost = move.cost;
        steps += 1;
        passes += 1;
      }
    };
    runPass(false, maxSteps);
    if (!instanceMode) runPass(true, 8);
    apply();
    return { unitSizes, working, cost, steps };
  };  const starts = [units.map((unit) => unit.size)];
  const template = rhythmUnitTemplate(units.map((unit) => unit.size), units.map((unit) => unit.kind));
  const projected = template ? rhythmProjectTemplate(units, template, accepts) : null;
  if (projected && projected.some((size, index) => size !== units[index].size)) starts.push(projected);
  let best = null;
  for (const seed of starts) {
    const result = descend(seed);
    if (!best || result.cost < best.cost - 1e-9) best = result;
  }
  if (!best || !(best.cost < costBefore - 1e-9)) return keep(null);
  let next = [...list];
  let changedCount = 0;
  if (instanceMode) {
    const buckets = new Map();
    for (const slot of movableSlotList) {
      const size = Number(list[slot].sizeMm);
      if (!buckets.has(size)) buckets.set(size, []);
      buckets.get(size).push(list[slot]);
    }
    const orderedUnits = units
      .map((unit, index) => ({ slots: unit.slots, target: best.unitSizes[index] }))
      .sort((left, right) => left.slots[0] - right.slots[0]);
    for (const unit of orderedUnits) {
      for (const slot of unit.slots) {
        const bucket = buckets.get(unit.target);
        const item = bucket && bucket.length ? bucket.shift() : null;
        if (!item) return keep('RHYTHM_INSTANCE_POOL');
        next[slot] = item;
      }
    }
  } else {
    for (let index = 0; index < units.length; index += 1) for (const slot of units[index].slots) next[slot] = Object.freeze({ ...list[slot], sizeMm: best.unitSizes[index] });
  }
  for (const slot of stoneSlots) if (Number(next[slot].sizeMm) !== Number(list[slot].sizeMm)) changedCount += 1;
  const frozen = Object.freeze(next);
  const beforeMirror = mirrorSymmetry(list);
  const afterMirror = mirrorSymmetry(frozen);
  const after = sizeRhythmMetrics(valuesOf(next));
  if (beforeMirror.mirrorSymmetryScore != null && afterMirror.mirrorSymmetryScore != null && afterMirror.mirrorSymmetryScore < beforeMirror.mirrorSymmetryScore) return keep('RHYTHM_MIRROR_GUARD');
  if (!(best.cost < costBefore - 1e-9) || changedCount === 0) return keep(null);
  return Object.freeze({
    sequence: frozen, applied: true, reason: null, changedCount,
    before, after, costBefore, costAfter: best.cost, steps: best.steps, mirrorPairs: afterMirror
  });
}