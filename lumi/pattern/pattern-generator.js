import {LUMI_PATTERN_VERSION}from './pattern-version.js';import {LUMI_PATTERN_CONFIG}from './pattern-config.js';import {LUMI_PATTERN_ARCHETYPES}from './pattern-archetypes.js';
const round=x=>Number(x.toFixed(6));const hash=s=>{let h=0x811c9dc5;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,0x01000193)}return(h>>>0).toString(16)};const freeze=Object.freeze;
export const scoreLumiPattern=(x,c=LUMI_PATTERN_CONFIG)=>round(x.visualHierarchy*c.weights.visualHierarchy+x.sizeCoherence*c.weights.sizeCoherence+x.patternBalance*c.weights.patternBalance+x.charmIntegration*c.weights.charmIntegration+x.paletteCoherence*c.weights.paletteCoherence);
// Rainbow Mode + MIXED sizes: assign each material's bead size so that the material blocks, laid out
// in canonical hue order, form a palindromic size sequence (positions i and K-1-i share one size).
// The sizes come from the intersection of the two materials' supported sizes, graded from the
// largest at the centre outward, and are attached to the motif roles BEFORE the physical candidate
// is built - so the design is legal by construction and the Step 3 import sees a native design.
function rainbowMirrorSizes(stones, assigned, defaults) {
  const count = stones.length;
  if (count < 2) return;
  const allowedFor = (stone) => [...(stone.allowedSizesMm || [])].map(Number).sort((left, right) => left - right);
  const current = (stone) => Number(assigned[stone.role]?.selectedSizeMm);
  const setSize = (stone, size) => { assigned[stone.role] = freeze({ materialId: stone.materialId, selectedSizeMm: size }); };
  const drift = [];
  for (let index = 0; index < Math.floor(count / 2); index += 1) {
    const leftStone = stones[index];
    const rightStone = stones[count - 1 - index];
    const common = allowedFor(leftStone).filter((size) => allowedFor(rightStone).includes(size));
    if (!common.length) continue;
    // Pick the legal shared size closest to the two materials' natural sizes, so the motif keeps its
    // physical length budget (and therefore still fits the wrist) while the pair matches exactly.
    const target = (current(leftStone) + current(rightStone)) / 2;
    const pick = common.reduce((best, size) => (Math.abs(size - target) < Math.abs(best - target) ? size : best), common[0]);
    drift.push((pick - current(leftStone)) + (pick - current(rightStone)));
    setSize(leftStone, pick);
    setSize(rightStone, pick);
  }
  if (count % 2 === 1) {
    const middle = stones[Math.floor(count / 2)];
    const sizes = allowedFor(middle);
    if (sizes.length) setSize(middle, sizes[0]);
  }
  const distinct = new Set(stones.map((stone) => Number(assigned[stone.role]?.selectedSizeMm)));
  const totalDrift = drift.reduce((sum, value) => sum + value, 0);
  // Guard rails: a mirrored pass that collapses the bracelet to one size, or that inflates the motif
  // length beyond what the wrist can host, is reverted (material continuity + legal fit win).
  if (distinct.size < 2 || totalDrift > Math.max(12, count * 2)) {
    for (const stone of stones) assigned[stone.role] = freeze({ materialId: stone.materialId, selectedSizeMm: defaults.get(stone.role) });
  }
}
function assignment(candidate,recoveryMixedSizeFallback=false){const byRole=Object.fromEntries(candidate.stones.map(s=>[s.role,s]));const choose=(s,kind)=>{const a=[...s.allowedSizesMm].sort((x,y)=>x-y);return candidate.sizePolicy.beadMode==='mixed'?(kind==='primary'?a.at(-1):kind==='secondary'?a[Math.min(1,a.length-1)]:a[0]):a[0]};const primary=choose(byRole.primary,'primary');let secondary=choose(byRole.secondary,'secondary');if(recoveryMixedSizeFallback&&candidate.sizePolicy.beadMode==='mixed'&&secondary===primary){const choices=[...byRole.secondary.allowedSizesMm].sort((x,y)=>x-y);secondary=choices.find(x=>x!==primary)||secondary;}let accent=choose(byRole.accent||byRole.filler,'accent');const filler=choose(byRole.filler,'filler');if(candidate.sizePolicy.beadMode==='mixed'&&new Set([primary,secondary,accent,filler]).size<2){const a=[...byRole.accent.allowedSizesMm].sort((x,y)=>x-y);accent=a.find(x=>x!==primary)||accent;}const assigned={primary:freeze({materialId:byRole.primary.materialId,selectedSizeMm:primary}),secondary:freeze({materialId:byRole.secondary.materialId,selectedSizeMm:secondary}),accent:freeze({materialId:byRole.accent.materialId,selectedSizeMm:accent}),filler:freeze({materialId:byRole.filler.materialId,selectedSizeMm:filler}),...Object.fromEntries((candidate.additionalStones||[]).map((stone,index)=>[stone.role,freeze({materialId:stone.materialId,selectedSizeMm:choose(stone,'filler')})]))};if(candidate.rainbowMode&&candidate.mirrorSizes!==false&&candidate.sizePolicy.beadMode==='mixed'){const defaults=new Map(candidate.stones.map(stone=>[stone.role,Number(assigned[stone.role]?.selectedSizeMm)]));rainbowMirrorSizes(candidate.stones,assigned,defaults);}return freeze(assigned);}
function motif(archetype,sizes){const token=(role)=>freeze({type:'stone_role',role,sizeMm:sizes[role].selectedSizeMm});if(archetype==='repeating_motif'||archetype==='curated_multi_stone')return freeze([token('primary'),token('primary'),token('secondary'),token('accent'),token('filler')]);if(archetype==='material_block')return freeze([token('primary'),token('primary'),token('secondary'),token('secondary'),token('accent'),token('filler')]);if(archetype==='duo_alternating'||archetype==='accent_interval')return freeze([token('primary'),token('secondary'),token('accent'),token('filler')]);if(archetype==='mixed_size_gradient'||archetype==='graduated_center')return freeze([token('filler'),token('accent'),token('secondary'),token('primary')]);return freeze([token('filler'),token('secondary'),token('accent')]);}
export function generateLumiPatternPlans(candidate,config=LUMI_PATTERN_CONFIG){if(!candidate?.sizePolicy||!candidate?.stones)throw new TypeError('Composition candidate required.');const sizes=assignment(candidate,config.recoveryMixedSizeFallback===true),distinct=new Set(Object.values(sizes).map(x=>x.selectedSizeMm));if(candidate.sizePolicy.beadMode==='mixed'&&distinct.size<2)throw new Error('LUMI_PATTERN_NO_VALID_MIXED_SIZE_ASSIGNMENT');const plans=[];for(const archetype of LUMI_PATTERN_ARCHETYPES){if(archetype.requiresFocal&&!candidate.focalCharm)continue;if(archetype.requiresMixedSizes&&candidate.sizePolicy.beadMode!=='mixed')continue;const values={visualHierarchy:sizes.primary.selectedSizeMm>=sizes.secondary.selectedSizeMm?.9:.7,sizeCoherence:distinct.size===3?.9:distinct.size===2?.85:.8,patternBalance:archetype.symmetry.includes('mirror')?.95:.88,charmIntegration:candidate.focalCharm?.9:1,paletteCoherence:.85};const key=`${candidate.candidateId}|${archetype.id}|${JSON.stringify(sizes)}`;plans.push(freeze({patternVersion:LUMI_PATTERN_VERSION,compositionCandidateId:candidate.candidateId,patternPlanId:`lumi-pattern2-${hash(key)}`,sizeAssignment:sizes,pattern:freeze({archetype:archetype.id,symmetry:archetype.symmetry,rainbowSplit:candidate.rainbowMode===true&&candidate.sizePolicy.beadMode==='mixed'&&Boolean(candidate.focalCharm),centerStructure:freeze(candidate.focalCharm?[{type:'focal_charm'}]:[{type:'stone_role',role:'primary',sizeMm:sizes.primary.selectedSizeMm}]),repeatMotif:freeze(candidate.rainbowMode?candidate.stones.map(stone=>freeze({type:'stone_role',role:stone.role,sizeMm:sizes[stone.role].selectedSizeMm})):[...motif(archetype.id,sizes),...(candidate.additionalStones||[]).map(stone=>freeze({type:'stone_role',role:stone.role,sizeMm:sizes[stone.role].selectedSizeMm}))]),edgeStrategy:'filler_repeat',specialSlots:freeze([])}),focalCharmPlan:candidate.focalCharm?freeze({materialId:candidate.focalCharm.materialId,placementType:candidate.focalCharm.placementType,representation:candidate.step3CharmConstraints.anchoredCharmRepresentation}):null,decorativeCharmPlan:candidate.luckCloverCharm?freeze({materialId:candidate.luckCloverCharm.materialId,placementType:candidate.luckCloverCharm.placementType,representation:candidate.step3CharmConstraints.loopCharmRepresentation,role:'luck_additional'}):null,spacerPlan:null,step3CharmConstraints:candidate.step3CharmConstraints,compositionScore:candidate.scores.compositionTotal,structuralScore:freeze({...values,patternScore:scoreLumiPattern(values)}),diagnostics:freeze({distinctStoneSizes:[...distinct].sort((a,b)=>a-b),canonicalKey:key,grammarVersion:'2.0.0'})}));}return freeze(plans.sort((a,b)=>b.structuralScore.patternScore-a.structuralScore.patternScore||a.patternPlanId.localeCompare(b.patternPlanId)).slice(0,config.bounds.retained));}
