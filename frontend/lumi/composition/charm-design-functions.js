import { CHARM_KNOWLEDGE } from '../knowledge/profiles.js';
const functionFor = (charm) => Object.freeze({ materialId:charm.materialId, focalEligible:charm.centerpieceEligible === true, decorativeEligible:true, rationale:charm.centerpieceEligible ? 'existing_centerpiece_eligibility_reviewed' : 'decorative_only_pending_focal_review', placementType:charm.placement, existingStep3Representation:charm.placement });
export const LUMI_CHARM_DESIGN_FUNCTIONS = Object.freeze(CHARM_KNOWLEDGE.map(functionFor));
const byId = new Map(LUMI_CHARM_DESIGN_FUNCTIONS.map((entry) => [entry.materialId, entry]));
export const getLumiCharmDesignFunction = (materialId) => byId.get(materialId) || null;
