const freeze = (value) => Object.freeze(value);
export const LUMI_COMPOSITION_CONFIG = freeze({
  rolePoolLimits:freeze({ primary:10, secondary:12, accent:12, filler:12, charm:8, spacer:3 }),
  candidateBounds:freeze({ rawAttempts:500, retainedIntermediate:100, finalCandidates:24, preferredDiversityCandidates:16, fallbackCandidates:8 }),
  scoreWeights:freeze({ personalRelevance:.40, goalCoverage:.25, visualHarmony:.20, semanticComplementarity:.10, compositionBalance:.05 }),
  personalRoleWeights:freeze({ stones_only:freeze({ primary:.50, secondary:.30, accent:.20 }), with_charm:freeze({ primary:.35, secondary:.25, accent:.15, charm:.25 }) }),
  uniqueStoneBounds:freeze({ stones_only:freeze({ min:2, max:4 }), with_charm:freeze({ min:2, max:4 }) }),
  stoneDiversity:freeze({ targetDistinctStoneCount:4, fallbackReason:'NO_VALID_MIN_4_STONE_CANDIDATE' })
});
export function validateLumiCompositionConfig(config = LUMI_COMPOSITION_CONFIG) {
  const total = Object.values(config.scoreWeights).reduce((sum, value) => sum + value, 0);
  if (Math.abs(total - 1) > 1e-9) throw new TypeError('Lumi composition weights must sum to 1.');
  if (config.stoneDiversity.targetDistinctStoneCount !== 4) throw new TypeError('Lumi V2 owner rule requires a four-stone target.');
  return true;
}
validateLumiCompositionConfig();