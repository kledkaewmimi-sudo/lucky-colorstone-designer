import { buildLumiCustomerProfile } from '../profile/index.js';
import { scoreLumiCatalogMaterials } from '../scoring/index.js';
import { composeLumiMaterials } from '../composition/index.js';
import { generateLumiPatternPlans } from '../pattern/index.js';
import { expandLumiPatternPlan, LUMI_FIT_CONFIG } from '../fit/index.js';
import { rankLumiRecommendations, isLumiRainbowMode, rainbowDistinctStoneTarget, rainbowMotifCapacity, rainbowFeasibleTarget, rainbowDistinctStoneCapacity, rainbowStoneSlotBudget, optimizeLumiBlockSizes, blockSizeFallbackReason, alignLumiRingMirrorSizes, ringMirrorFallbackReason, optimizeLumiSizeRhythm, mirrorSymmetry, materialBlocks, analyzeLumiRainbowLayout, sizeRhythmMetrics } from '../recommendation/index.js';
import { buildSixGoalStonesOnlyMixed, buildSixGoalWithTalisman } from '../recommendation/six-goal-layout.js';
import { buildFiveGoalStonesOnlyMixed } from '../recommendation/five-goal-layout.js';
import { buildLumiDesignContract } from '../integration/index.js';
import { prepareLumiStep3Import } from '../import/step3-import.js';
import { LUMI_INTEGRATION_VERSION } from './service-version.js';
export { LUMI_INTEGRATION_VERSION } from './service-version.js';
const stateFor = (context) => ({ wristSize: context.wristSizeCm, beadSize: String(context.beadMode), mixedPlacingSize: context.mixedPlacingSize });
const importable = (recommendation, context, catalogSnapshot) => {
  const contract = buildLumiDesignContract(recommendation, context);
  return prepareLumiStep3Import({ contract, state: stateFor(context), snapshot: catalogSnapshot });
};
export function generateLumiRecommendation({ answers, context, catalogSnapshot }) {
  try {
    const profile = buildLumiCustomerProfile({ answers, braceletContext: context });
        const scored = scoreLumiCatalogMaterials(profile, catalogSnapshot);
    const recoveryFitConfig = { ...LUMI_FIT_CONFIG, bounds: { ...LUMI_FIT_CONFIG.bounds, maxEdgeFillersPerSide: 8, recoveryClosureLattice: true } };
    const expandPlans = (composition, recovery) => { const plans = []; for (const candidate of composition.candidates) try { plans.push(...generateLumiPatternPlans(candidate, recovery ? { recoveryMixedSizeFallback: true, bounds: { retained: 12 } } : undefined)); } catch {} return plans; };
    const expandPhysicals = (plans, recovery) => { const physicals = []; for (const patternPlan of plans) try { physicals.push(...expandLumiPatternPlan({ patternPlan, profile, snapshot: catalogSnapshot, ...(recovery ? { config: recoveryFitConfig } : {}) }).candidates); } catch {} return physicals; };
    const runLumiPipeline = (composition, allowRecovery = true) => {
      const plans = expandPlans(composition, false);
      const normalPhysical = expandPhysicals(plans, false);
      if (normalPhysical.length) return { composition, plans, normalPhysical, recoveryInvoked: false, recoveryPlans: plans, recoveryPhysical: [] };
      if (!allowRecovery) return { composition, plans, normalPhysical, recoveryInvoked: false, recoveryPlans: plans, recoveryPhysical: [] };
      const recoveryPlans = expandPlans(composition, true);
      return { composition, plans, normalPhysical, recoveryInvoked: true, recoveryPlans, recoveryPhysical: expandPhysicals(recoveryPlans, true) };
    };
    const supportedSizes = new Map((catalogSnapshot?.stones || []).map((stone) => [String(stone.id), Array.isArray(stone.supportedSizesMm) ? stone.supportedSizesMm.map(Number) : []]));
    const attemptRanking = (candidate, options = {}) => {
      try {
        let recommendation = rankLumiRecommendations({ profile, compositionResult: candidate.composition, patternPlans: candidate.normalPhysical.length ? candidate.plans : candidate.recoveryPlans, physicalCandidates: candidate.normalPhysical.length ? candidate.normalPhysical : candidate.recoveryPhysical, ...options });
        let ringMirror = null;
        if (options.blockSizes !== false && profile.braceletContext.beadMode === 'mixed') {
          const rainbow = isLumiRainbowMode(profile);
          const allowedSizesFor = (materialId) => supportedSizes.get(String(materialId)) || [];
          const withSequence = (sequence) => {
            const current = recommendation.selected;
            const updated = Object.freeze({ ...recommendation, selected: Object.freeze({ ...current, sequence }) });
            const prepared = importable(updated, context, catalogSnapshot);
            return Object.freeze({ ...updated, selected: Object.freeze({ ...updated.selected, actualLengthMm: prepared.geometry.usedLengthMm, fitDeltaMm: prepared.geometry.differenceMm }) });
          };
          const selected = recommendation.selected;
          const preLayoutSequence = selected.sequence;
          const rhythmValues = (list) => (Array.isArray(list) ? list : []).map((item) => (item?.componentType === 'stone' ? Number(item.sizeMm) : 0));
          const physicals = candidate.normalPhysical.length ? candidate.normalPhysical : candidate.recoveryPhysical;
          const plans = candidate.normalPhysical.length ? candidate.plans : candidate.recoveryPlans;
          const physical = physicals.find((item) => item.physicalCandidateId === selected.physicalCandidateId) || null;
          const patternPlan = plans.find((item) => item.patternPlanId === selected.patternPlanId) || null;
          const motifLength = patternPlan ? patternPlan.pattern.repeatMotif.length : null;
          const extraLengthMm = (selected.anchoredCharms || []).reduce((sum, item) => sum + (Number(item.footprintMm) || 0), 0);
          let usedSequence = selected.sequence;
          let alignmentApplied = false;
          let alignment = null;
          let rhythm = null;
          let sixGoalLayout = null;
          if (profile.goals.length === 6) {
            const sixGoalTargetMm = (Number(profile.braceletContext.wristSizeCm) + LUMI_FIT_CONFIG.targetAllowanceCm) * 10;
            let sixGoalCandidate = null;
            if (profile.style === 'stones_only' || profile.style === 'with_charm') {
              try {
                sixGoalCandidate = profile.style === 'stones_only'
                  ? buildSixGoalStonesOnlyMixed(selected.sequence, allowedSizesFor, { targetLengthMm: sixGoalTargetMm, windowBelowMm: 5 })
                  : buildSixGoalWithTalisman(selected.sequence, allowedSizesFor, { targetLengthMm: sixGoalTargetMm, windowBelowMm: 5, extraLengthMm });
              } catch { sixGoalCandidate = Object.freeze({ applied: false, reason: 'SIX_GOAL_LAYOUT_ERROR', sequence: null }); }
            }
            if (sixGoalCandidate && sixGoalCandidate.applied) {
              try { recommendation = withSequence(sixGoalCandidate.sequence); usedSequence = sixGoalCandidate.sequence; sixGoalLayout = sixGoalCandidate; }
              catch { sixGoalLayout = Object.freeze({ applied: false, reason: 'SIX_GOAL_LAYOUT_IMPORT_REJECTED', diagnostics: sixGoalCandidate.diagnostics }); }
            } else if (sixGoalCandidate) sixGoalLayout = sixGoalCandidate;
          }
          // The FIVE-goal dedicated layout is dispatched for exactly one configuration:
          // 5 goals + STONES_ONLY + MIXED. It re-arranges the already-selected stones only, and when
          // it applies it replaces the generic alignment/rhythm passes exactly like the six-goal layer.
          let fiveGoalLayout = null;
          if (profile.goals.length === 5 && profile.style === 'stones_only' && profile.braceletContext.beadMode === 'mixed') {
            const fiveGoalTargetMm = (Number(profile.braceletContext.wristSizeCm) + LUMI_FIT_CONFIG.targetAllowanceCm) * 10;
            let fiveGoalCandidate = null;
            try { fiveGoalCandidate = buildFiveGoalStonesOnlyMixed(selected.sequence, allowedSizesFor, { targetLengthMm: fiveGoalTargetMm, windowBelowMm: 5 }); }
            catch { fiveGoalCandidate = Object.freeze({ applied: false, reason: 'FIVE_GOAL_LAYOUT_ERROR', sequence: null }); }
            if (fiveGoalCandidate && fiveGoalCandidate.applied) {
              try { recommendation = withSequence(fiveGoalCandidate.sequence); usedSequence = fiveGoalCandidate.sequence; fiveGoalLayout = fiveGoalCandidate; }
              catch { fiveGoalLayout = Object.freeze({ applied: false, reason: 'FIVE_GOAL_LAYOUT_IMPORT_REJECTED', diagnostics: fiveGoalCandidate.diagnostics }); }
            } else if (fiveGoalCandidate) fiveGoalLayout = fiveGoalCandidate;
          }
          const fiveGoalApplied = Boolean(fiveGoalLayout && fiveGoalLayout.applied);
          // The six-goal layouts are a presentation layer only: if either builder cannot produce a
          // legal ring, the ordinary mixed passes below still run so the recommendation is never lost.
          // The failure is recorded (sixGoalLayoutFailure) instead of being silently hidden.
          const sixGoalApplied = Boolean(sixGoalLayout && sixGoalLayout.applied);
          if (!sixGoalApplied && !fiveGoalApplied && rainbow) {
            // 1. 5/6 rainbow: per-slot size alignment to the ACTUAL rendered ring (closure + edge fillers).
            alignment = alignLumiRingMirrorSizes(selected.sequence, allowedSizesFor, {
              targetLengthMm: (Number(profile.braceletContext.wristSizeCm) + LUMI_FIT_CONFIG.targetAllowanceCm) * 10,
              windowBelowMm: 5,
              extraLengthMm
            });
            if (alignment.applied) {
              try { recommendation = withSequence(alignment.sequence); usedSequence = alignment.sequence; alignmentApplied = true; } catch { /* keep the un-aligned sequence */ }
            }
          }
          // 2. ALL mixed goal counts: distribute the size rhythm around the ring. The rhythm pass keeps
          //    the size multiset (length/fit) and the mirror pairing identical; for 1-4 goals the stone
          //    instance moves with its size, for 5/6 rainbow the material blocks stay locked in place.
          if (!sixGoalApplied && !fiveGoalApplied) rhythm = optimizeLumiSizeRhythm(usedSequence, allowedSizesFor, {
            maxSteps: 32,
            mode: rainbow ? 'size' : 'instance',
            targetLengthMm: (Number(profile.braceletContext.wristSizeCm) + LUMI_FIT_CONFIG.targetAllowanceCm) * 10,
            windowBelowMm: 5,
            extraLengthMm
          });
          if (rhythm && rhythm.applied) {
            try { recommendation = withSequence(rhythm.sequence); usedSequence = rhythm.sequence; } catch { rhythm = null; }
          }
          if (!sixGoalApplied && !fiveGoalApplied && !alignmentApplied && !(rhythm && rhythm.applied) && rainbow) {
            const optimized = optimizeLumiBlockSizes(selected.sequence, allowedSizesFor);
            if (optimized !== selected.sequence) {
              try { recommendation = withSequence(optimized); usedSequence = optimized; } catch { /* keep the un-optimised sequence */ }
            }
          }
          const symmetry = mirrorSymmetry(usedSequence);
          const layout = analyzeLumiRainbowLayout(recommendation.selected);
          const blocks = materialBlocks(usedSequence);
          const closureCount = physical && motifLength ? physical.componentCounts.stoneCount - 2 * physical.edgeFillerPairs - 2 * physical.repeatCount * motifLength : null;
          ringMirror = Object.freeze({
            alignmentApplied,
            rhythmApplied: (sixGoalApplied || fiveGoalApplied) ? true : Boolean(rhythm && rhythm.applied),
            rhythmMode: rainbow ? 'size' : 'instance',
            rhythmSteps: rhythm ? rhythm.steps : 0,
            rhythmChangedSlots: rhythm ? rhythm.changedCount : 0,
            rhythmCostBefore: rhythm ? rhythm.costBefore : null,
            rhythmCostAfter: rhythm ? rhythm.costAfter : null,
            rhythmBefore: (sixGoalApplied || fiveGoalApplied) ? sizeRhythmMetrics(rhythmValues(preLayoutSequence)) : rhythm ? rhythm.before : null,
            rhythmAfter: (sixGoalApplied || fiveGoalApplied) ? sizeRhythmMetrics(rhythmValues(usedSequence)) : rhythm ? rhythm.after : null,
            mirrorPairMatches: symmetry.mirrorPairMatches,
            mirrorPairMismatches: symmetry.mirrorPairMismatches,
            comparablePairs: symmetry.comparablePairs,
            mirrorSymmetryScore: symmetry.mirrorSymmetryScore,
            actualMirrorAxis: symmetry.anchorIndex,
            finalStoneSlotCount: layout.stoneBeadCount,
            edgeFillerCount: (sixGoalApplied || fiveGoalApplied) ? 0 : physical ? physical.edgeFillerPairs * 2 : null,
            closureCount: (sixGoalApplied || fiveGoalApplied) ? 0 : closureCount,
            motifRepeatCount: (sixGoalApplied || fiveGoalApplied) ? 1 : physical ? physical.repeatCount : null,
            materialBlockCount: blocks.length,
            materialBlockSizePatterns: Object.freeze(blocks.map((block) => block.materialId + ':' + block.sizes.join('/'))),
            sizeTotals: layout.sizeTotals,
            sizeCountsByQuadrant: layout.sizeCountsByQuadrant,
            largestSizeQuadrantShare: layout.largestSizeQuadrantShare,
            changedSlotCount: rhythm ? rhythm.changedCount : 0,
            sixGoalLayoutApplied: sixGoalApplied,
            sixGoalLayoutDiagnostics: sixGoalLayout && sixGoalLayout.diagnostics ? sixGoalLayout.diagnostics : null,
            sixGoalLayoutFailure: sixGoalLayout && !sixGoalLayout.applied ? sixGoalLayout.reason : null,
            fiveGoalLayoutApplied: fiveGoalApplied,
            fiveGoalLayoutDiagnostics: fiveGoalLayout && fiveGoalLayout.diagnostics ? fiveGoalLayout.diagnostics : null,
            fiveGoalLayoutFailure: fiveGoalLayout && !fiveGoalLayout.applied ? fiveGoalLayout.reason : null,
            fallbackReason: rainbow && alignment ? alignment.reason : null,
            rhythmFallbackReason: rhythm && rhythm.applied && rhythm.after && rhythm.after.longestRun > 3 ? 'SIZE_RHYTHM_PARTIAL' : null
          });
        }        importable(recommendation, context, catalogSnapshot);
        const reason = isLumiRainbowMode(profile) && profile.braceletContext.beadMode === 'mixed' ? blockSizeFallbackReason(recommendation.selected.sequence) : null;
        const diagnostics = Object.freeze({ ...recommendation.diagnostics, ...(reason ? { blockSizeFallbackReason: reason } : {}), ...(ringMirror ? { ringMirror } : {}) });
        return Object.freeze({ ...recommendation, diagnostics });
      } catch { return null; }
    };
    // The mixed-size mirror layout is a presentation improvement only: if the redesigned sequence ever
    // fails the Step 3 import, fall back to the un-rearranged sequence so the recommendation is kept.
    const rankCandidate = (candidate, options = {}) => {
      const direct = attemptRanking(candidate, options);
      if (direct) return direct;
      return options.mirrorLayout === false ? null : attemptRanking(candidate, { ...options, mirrorLayout: false });
    };
    const finish = (candidate, ranked, extra) => {
      const diagnostics = Object.freeze({ recoveryInvoked: candidate ? candidate.recoveryInvoked : false, rainbowSelectionFallback: Boolean(extra.rainbowSelectionFallback), rainbowDistinctTargetRequested: extra.rainbowDistinctTargetRequested ?? null, rainbowDistinctTargetUsed: extra.rainbowDistinctTargetUsed ?? null, rainbowDistinctCapacity: extra.rainbowDistinctCapacity ?? null, rainbowFallbackReason: extra.rainbowFallbackReason ?? null, normalCandidateCount: candidate ? candidate.normalPhysical.length : 0, recoveryCandidateCount: candidate ? candidate.recoveryPhysical.length : 0 });
      if (ranked) return Object.freeze({ status: 'RECOMMENDED', recommendation: ranked, profile, diagnostics });
      return Object.freeze({ status: 'NO_RECOMMENDATION', code: 'LUMI_RECOMMENDATION_NO_VALID_CANDIDATE', profile, diagnostics });
    };
    const rainbow = isLumiRainbowMode(profile);
    if (!rainbow) {
      const pipeline = runLumiPipeline(composeLumiMaterials(profile, scored));
      return finish(pipeline, rankCandidate(pipeline), {});
    }
    // Rainbow Mode (exactly 5 or 6 goals) may only RE-RANK legal stones and RE-ORDER legal beads.
    // The distinct-stone target is a bounded, deterministic ladder: the requested target is capped by
    // the physical motif capacity of this envelope, and each step down is a full legal pipeline run.
    const envelope = { wristSizeCm: profile.braceletContext.wristSizeCm, beadMode: profile.braceletContext.beadMode, mixedPlacingSize: profile.braceletContext.mixedPlacingSize || Number(profile.braceletContext.beadMode) || 6 };
    const rainbowRequested = rainbowDistinctStoneTarget(profile) || 0;
    const floorTarget = profile.goals.length;
    // The talisman footprint consumes part of the wrist budget, so the stone-slot capacity (and with
    // it the feasible motif length) is derived from a cheap composition probe before ranking runs.
    const charmFootprints = new Map((scored.charms.eligible || []).map((charm) => [charm.materialId, Number(charm.footprintMm) || 0]));
    let charmMm = 0;
    try {
      const probeCandidate = composeLumiMaterials(profile, scored, undefined, { rainbow: true, distinctTarget: rainbowRequested }).candidates[0];
      charmMm = [probeCandidate?.focalCharm?.materialId, probeCandidate?.luckCloverCharm?.materialId].filter(Boolean).reduce((total, id) => total + (charmFootprints.get(id) || 0), 0);
    } catch { charmMm = 0; }
    const shapedEnvelope = { ...envelope, charmMm, closureCounts: profile.style === 'stones_only' ? [1] : [1, 2] };
    const rainbowLegalIdentityCount = (scored.stones.eligible || []).filter((stone) => (stone.supportedSizes || stone.supportedSizesMm || []).map(Number).some((size) => [4, 6, 10].includes(size))).length;
    // The split grammar (independent material identity + mirrored SIZE) only exists for MIXED sizes.
    const rainbowSplitFeasible = profile.style === 'with_charm' && String(profile.braceletContext.beadMode) === 'mixed';
    const rainbowDistinctCapacity = rainbowSplitFeasible
      ? rainbowDistinctStoneCapacity({ stoneSlots: rainbowStoneSlotBudget(shapedEnvelope), legalIdentityCount: rainbowLegalIdentityCount })
      : rainbowMotifCapacity(shapedEnvelope);
    const feasibleTarget = rainbowSplitFeasible
      ? Math.max(floorTarget, Math.min(rainbowRequested, rainbowDistinctCapacity || rainbowRequested))
      : (rainbowFeasibleTarget(shapedEnvelope, rainbowRequested) || rainbowDistinctCapacity || rainbowRequested);
    // Prefer the richest feasible motif (it also minimises the repeated edge-filler block); the
    // owner target stays the minimum acceptance bar, and the wallet is capped by the eligible pool.
    const rainbowRichTarget = rainbowSplitFeasible ? feasibleTarget : (rainbowFeasibleTarget(shapedEnvelope, rainbowDistinctCapacity) || feasibleTarget || rainbowRequested);
    const startTarget = Math.max(floorTarget, rainbowRichTarget);
    let chosen = null;
    let attempts = 0;
    for (let target = startTarget; target >= floorTarget && attempts < 4 && !chosen; target -= 1, attempts += 1) {
      // First try the mirror-balanced motif size assignment; if that motif cannot be expanded by the
      // NORMAL fit path (for example because a talisman footprint shrinks the wrist budget), retry the
      // same target with the natural sizes so a legal bracelet is still produced.
      for (const mirrorSizes of [true, false]) {
        const candidate = runLumiPipeline(composeLumiMaterials(profile, scored, undefined, { rainbow: true, distinctTarget: target, mirrorSizes }), false);
        const ranked = rankCandidate(candidate);
        if (ranked) { chosen = { candidate, ranked, target }; break; }
      }
    }
    if (chosen) {
      const used = chosen.target;
      return finish(chosen.candidate, chosen.ranked, { rainbowDistinctTargetRequested: rainbowRequested, rainbowDistinctTargetUsed: used, rainbowDistinctCapacity, rainbowFallbackReason: used < rainbowRequested ? 'PHYSICAL_OR_LEGAL_MOTIF_LIMIT' : null });
    }
    // Structural safety net: never lose a recommendation Rainbow Mode did not create.
    const legacyCandidate = runLumiPipeline(composeLumiMaterials(profile, scored, undefined, { rainbow: false }));
    const legacyRanked = attemptRanking(legacyCandidate);
    return finish(legacyCandidate, legacyRanked, { rainbowSelectionFallback: true, rainbowDistinctTargetRequested: rainbowRequested, rainbowDistinctTargetUsed: null, rainbowDistinctCapacity, rainbowFallbackReason: legacyRanked ? 'RAINBOW_SELECTION_NOT_RENDERABLE' : 'NO_LEGAL_CANDIDATE' });
  } catch (error) {
    return Object.freeze({ status: 'INVALID_INPUT', code: error.code || 'LUMI_SERVICE_INVALID_INPUT' });
  }
}


