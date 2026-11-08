import { ALL_MATERIAL_KNOWLEDGE } from '../knowledge/profiles.js';
import { LUMI_COMPOSITION_CONFIG } from './composition-config.js';
const knowledge = new Map(ALL_MATERIAL_KNOWLEDGE.map((entry) => [entry.materialId, entry]));
const score = (entry) => entry.score?.totalScore ?? -1;
const roleEligible = (entry, role) => Boolean((knowledge.get(entry.materialId)?.roleEligibility || entry.roleEligibility)?.[role]);
const sort = (entries) => [...entries].sort((left, right) => score(right) - score(left) || left.materialId.localeCompare(right.materialId));
export function buildLumiCompositionRolePools(scored, config = LUMI_COMPOSITION_CONFIG) {
  if (!scored?.stones?.eligible || !scored?.charms?.eligible || !scored?.spacers?.eligible) throw new TypeError('Phase 3 scored pools are required.');
  const stones = scored.stones.eligible;
  const role = (name) => Object.freeze(sort(stones.filter((entry) => roleEligible(entry, name))).slice(0, config.rolePoolLimits[name]));
  return Object.freeze({
    primary:role('primary'), secondary:role('secondary'), accent:role('accent'), filler:role('filler'),
    charm:Object.freeze(sort(scored.charms.eligible).slice(0, config.rolePoolLimits.charm)),
    spacer:Object.freeze([...scored.spacers.eligible].sort((left, right) => left.materialId.localeCompare(right.materialId)).slice(0, config.rolePoolLimits.spacer))
  });
}
export const getLumiCompositionKnowledge = (materialId) => knowledge.get(materialId) || null;
export const isLumiRoleEligible = roleEligible;
