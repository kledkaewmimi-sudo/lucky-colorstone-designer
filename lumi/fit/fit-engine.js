import{createBraceletGeometry,getBraceletCompletionEligibility}from '../../bracelet-geometry.js';
import{LUMI_FIT_VERSION}from './fit-version.js';import{LUMI_FIT_CONFIG}from './fit-config.js';import{resolveLumiPhysicalComponent}from './footprint-resolver.js';import{LUMI_FIT_ERROR_CODES,lumiFitError}from './fit-errors.js';
const freeze=Object.freeze;const round=x=>Number(x.toFixed(6));const hash=s=>{let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return(h>>>0).toString(16)};const token=(role,assignment,index)=>({instanceId:`${role}-${index}`,componentType:'stone',materialId:assignment.materialId,role,sizeMm:assignment.selectedSizeMm,sourcePatternToken:role});
function sequenceFor(plan,repeatCount,edgePairs,focalClosureStoneCount=2,centerStoneCount=1,edgeClosureRole=null){const a=plan.sizeAssignment;const motif=plan.pattern.repeatMotif.map((x,i)=>token(x.role,a[x.role],`motif-${i}`));const left=Array.from({length:repeatCount},()=>motif).flat().reverse();const right=Array.from({length:repeatCount},()=>motif).flat();const edge=Array.from({length:edgePairs},(_,i)=>token('filler',a.filler,`edge-${i}`));const center=plan.focalCharmPlan?.placementType==='loop'?[...Array.from({length:focalClosureStoneCount},(_,i)=>token('primary',a.primary,'center-'+i)),{instanceId:'focal-loop',componentType:'loop_charm',materialId:plan.focalCharmPlan.materialId,role:'focal',sourcePatternToken:'center'}]:plan.focalCharmPlan?.placementType==='anchored'?Array.from({length:focalClosureStoneCount},(_,i)=>token('primary',a.primary,'center-'+i)):Array.from({length:centerStoneCount},(_,i)=>token('primary',a.primary,'center-'+i));const leftSpacer=plan.spacerPlan?[{instanceId:'spacer-left',componentType:'spacer',materialId:plan.spacerPlan.materialId,role:'spacer',sourcePatternToken:'center-left'}]:[];const rightSpacer=plan.spacerPlan?[{instanceId:'spacer-right',componentType:'spacer',materialId:plan.spacerPlan.materialId,role:'spacer',sourcePatternToken:'center-right'}]:[];const recoveryEdge=edgeClosureRole?[token(edgeClosureRole,a[edgeClosureRole],'recovery-edge')]:[];const decorative=plan.decorativeCharmPlan?.placementType==='loop'?[{instanceId:'decorative-loop',componentType:'loop_charm',materialId:plan.decorativeCharmPlan.materialId,role:plan.decorativeCharmPlan.role||'decorative',sourcePatternToken:'center'}]:[];return [...edge,...left,...leftSpacer,...center,...decorative,...rightSpacer,...right,...edge,...recoveryEdge];}
function anchoredFor(plan){return[plan.focalCharmPlan,plan.decorativeCharmPlan].filter(x=>x?.placementType==='anchored').map((x,i)=>({instanceId:`anchored-${i}-${x.materialId}`,componentType:'anchored_charm',materialId:x.materialId,role:x===plan.focalCharmPlan?'focal':(x.role||'decorative'),sourcePatternToken:'anchored'}));}
function represented(sequence,plan,allowCloverFixedClosure=false){const roles=new Set(sequence.filter(x=>x.componentType==='stone').map(x=>x.role));if(!roles.has('primary')||!roles.has('secondary'))return false;if(plan.pattern.symmetry==='mirror'&&!allowCloverFixedClosure){const stones=sequence.filter(x=>x.componentType==='stone');if(stones.length<3)return false;for(let i=0,j=stones.length-1;i<j;i+=1,j-=1)if(stones[i].role!==stones[j].role||stones[i].sizeMm!==stones[j].sizeMm)return false;}return true;}
function geometryComponents(items){return items.map(x=>x.componentType==='stone'?{type:'stone',sizeMm:x.sizeMm}:x.componentType==='spacer'?{type:'spacer',effectiveLengthMm:x.footprintMm}:{type:'charm',footprintMm:x.footprintMm});}
const rainbowSplitCache = new Map();
function splitCircularRuns(values) {
  const list = Array.isArray(values) ? values : [];
  const total = list.length;
  if (!total) return [];
  let first = 0;
  for (let index = 1; index < total; index += 1) { if (list[index] !== list[0]) { first = index; break; } }
  const rotated = list.slice(first).concat(list.slice(0, first));
  const runs = [];
  let begin = 0;
  for (let index = 1; index <= rotated.length; index += 1) {
    if (index === rotated.length || rotated[index] !== rotated[begin]) {
      runs.push({ value: rotated[begin], length: index - begin });
      begin = index;
    }
  }
  return runs;
}
// Rainbow WITH_TALISMAN v3: material IDENTITY and SIZE symmetry are independent. The hue-ordered
// material blocks are laid out ONCE around the ring and the loop-charm anchor sits at the exact
// centre of the stone ring, so the SIZE of every opposite bead pair still mirrors while material
// identities are never duplicated for symmetry. Feasibility comes from the real stone slots around
// the talisman, not from the legacy mirrored-material motif cap.
function rainbowSplitTokens(plan, snapshot, targetLengthMm) {
  const motif = plan.pattern.repeatMotif;
  const count = motif.length;
  if (!(count >= 6) || count % 2 !== 0) return null;
  if (plan.focalCharmPlan?.placementType !== 'anchored' || plan.decorativeCharmPlan?.placementType !== 'loop') return null;
  const signature = motif.map((entry) => entry.role).join(',') + '|' + motif.map((entry) => plan.sizeAssignment[entry.role]?.materialId).join(',') + '|' + targetLengthMm + '|' + (snapshot?.catalogVersion || '');
  if (rainbowSplitCache.has(signature)) return rainbowSplitCache.get(signature);
  rainbowSplitCache.set(signature, null);
  const stones = snapshot?.stones || [];
  const charmMm = (materialId) => Number((snapshot?.charms || []).find((item) => String(item.id) === String(materialId))?.footprintMm) || 0;
  const allowedFor = (role) => {
    const materialId = plan.sizeAssignment[role]?.materialId;
    const item = stones.find((entry) => String(entry.id) === String(materialId));
    return [...new Set((item?.supportedSizesMm || []).map(Number).filter((size) => [4, 6, 10].includes(size)))].sort((left, right) => left - right);
  };
  const pairCount = count / 2;
  const options = [];
  for (let index = 0; index < pairCount; index += 1) {
    const left = allowedFor(motif[index].role);
    const right = allowedFor(motif[count - 1 - index].role);
    const shared = left.filter((size) => right.includes(size));
    if (!shared.length) return null;
    options.push(shared);
  }
  const fixedMm = charmMm(plan.focalCharmPlan.materialId) + charmMm(plan.decorativeCharmPlan.materialId);
  const minStoneMm = targetLengthMm - 5 - fixedMm;
  const maxStoneMm = Math.floor(targetLengthMm - fixedMm);
  if (!(maxStoneMm > 0) || minStoneMm > maxStoneMm) return null;
  const beadSizes = (picks) => {
    const list = [];
    for (let index = 0; index < count; index += 1) {
      const pairIndex = index < pairCount ? index : count - 1 - index;
      const pick = picks[pairIndex];
      for (let bead = 0; bead < pick.blocks; bead += 1) list.push(pick.size);
    }
    return list;
  };
  const better = (candidate, incumbent) => {
    if (!incumbent) return true;
    const tenGap = Math.max(0, candidate.run10 - 2) - Math.max(0, incumbent.run10 - 2);
    if (tenGap !== 0) return tenGap < 0;
    const longGap = Math.max(0, candidate.maxRun - 6) - Math.max(0, incumbent.maxRun - 6);
    if (longGap !== 0) return longGap < 0;
    if (candidate.distinctSizes !== incumbent.distinctSizes) return candidate.distinctSizes > incumbent.distinctSizes;
    const fitGap = (maxStoneMm - candidate.length) - (maxStoneMm - incumbent.length);
    if (fitGap !== 0) return fitGap < 0;
    return candidate.beads < incumbent.beads;
  };
  let best = null;
  const consider = (picks) => {
    const length = picks.reduce((sum, pick) => sum + 2 * pick.blocks * pick.size, 0);
    if (length < minStoneMm - 1e-9 || length > maxStoneMm + 1e-9) return;
    const list = beadSizes(picks);
    const runs = splitCircularRuns(list);
    const candidate = {
      picks: picks.map((pick) => ({ size: pick.size, blocks: pick.blocks })), length, beads: list.length,
      distinctSizes: new Set(list).size,
      maxRun: runs.reduce((bestRun, run) => Math.max(bestRun, run.length), 0),
      run10: runs.filter((run) => run.value === 10).reduce((bestRun, run) => Math.max(bestRun, run.length), 0)
    };
    if (better(candidate, best)) best = candidate;
  };
  const sizes = new Array(pairCount).fill(0);
  const walk = (index) => {
    if (index === pairCount) {
      let states = new Map([[0, []]]);
      for (let pair = 0; pair < pairCount && states.size; pair += 1) {
        const next = new Map();
        for (const [length, picks] of states) {
          const first = pair === 0 ? 3 : 1;
          for (let blocks = first; blocks <= 4; blocks += 1) {
            const total = length + 2 * blocks * sizes[pair];
            if (total > maxStoneMm) continue;
            if (!next.has(total)) next.set(total, [...picks, { size: sizes[pair], blocks }]);
          }
        }
        states = next;
      }
      for (const picks of states.values()) consider(picks);
      return;
    }
    for (const size of options[index]) { sizes[index] = size; walk(index + 1); }
  };
  walk(0);
  if (!best) return null;
  const picks = best.picks;
  const tokens = [];
  for (let index = 0; index < count; index += 1) {
    const pairIndex = index < pairCount ? index : count - 1 - index;
    const pick = picks[pairIndex];
    const blocks = index === 0 ? pick.blocks - 2 : pick.blocks;
    const role = motif[index].role;
    const materialId = plan.sizeAssignment[role].materialId;
    for (let bead = 0; bead < blocks; bead += 1) tokens.push(token(role, { materialId, selectedSizeMm: pick.size }, 'split-' + index + '-' + bead));
  }
  const half = (tokens.length + 2) / 2;
  const closureAssignment = { materialId: plan.sizeAssignment.primary.materialId, selectedSizeMm: picks[0].size };
  const closure = [token('primary', closureAssignment, 'split-center-0'), token('primary', closureAssignment, 'split-center-1')];
  const loop = { instanceId: 'split-decorative-loop', componentType: 'loop_charm', materialId: plan.decorativeCharmPlan.materialId, role: plan.decorativeCharmPlan.role || 'decorative', sourcePatternToken: 'center' };
  const result = [...tokens.slice(0, half - 2), ...closure, loop, ...tokens.slice(half - 2)];
  rainbowSplitCache.set(signature, result);
  return result;
}
export function expandLumiPatternPlan({patternPlan,profile,snapshot,config=LUMI_FIT_CONFIG}){if(!patternPlan?.patternPlanId||!profile?.braceletContext||!snapshot)throw lumiFitError(LUMI_FIT_ERROR_CODES.INVALID_INPUT,'Pattern plan, normalized profile, and catalog snapshot required.');const wrist=Number(profile.braceletContext.wristSizeCm),targetLengthMm=(wrist+config.targetAllowanceCm)*10;if(!(targetLengthMm>0))throw lumiFitError(LUMI_FIT_ERROR_CODES.INVALID_INPUT,'Valid wrist size required.');const mode=profile.braceletContext.beadMode==='mixed'?'mixed':'fixed',fixed=mode==='fixed'?Number(profile.braceletContext.beadMode):0,results=[],anchored=anchoredFor(patternPlan),constraint=patternPlan.step3CharmConstraints||{};if(anchored.length>Number(constraint.maxAnchoredCharms??2))throw lumiFitError(LUMI_FIT_ERROR_CODES.CHARM_CONSTRAINT,'Anchored charm limit exceeded.');const loopPlans=[patternPlan.focalCharmPlan,patternPlan.decorativeCharmPlan].filter(x=>x?.placementType==='loop');if(loopPlans.length&&!constraint.loopAllowedStoneSizesMm?.includes(Number(profile.braceletContext.mixedPlacingSize||fixed)))throw lumiFitError(LUMI_FIT_ERROR_CODES.CHARM_CONSTRAINT,'Loop charm cannot be represented in this size context.');const recovery=Boolean(config.bounds?.recoveryClosureLattice);const hasFocal=Boolean(patternPlan.focalCharmPlan);const focalClosureCounts=recovery&&hasFocal?[1,2,3]:mode==='fixed'&&patternPlan.decorativeCharmPlan?.materialId==='cl01'?[2,1]:mode==='fixed'&&fixed===10&&patternPlan.focalCharmPlan?.placementType==='loop'&&patternPlan.focalCharmPlan.materialId==='cl01'?[2,1]:[2];const centerStoneCounts=recovery&&!hasFocal?[0,1,2]:[1];const edgeClosureRoles=recovery?[null,...Object.keys(patternPlan.sizeAssignment)]:[null];for(let repeatCount=0;repeatCount<=config.bounds.maxRepeatCount;repeatCount++)for(let edgePairs=0;edgePairs<=config.bounds.maxEdgeFillersPerSide;edgePairs++)for(const focalClosureStoneCount of focalClosureCounts)for(const centerStoneCount of centerStoneCounts)for(const edgeClosureRole of edgeClosureRoles){const sequence=sequenceFor(patternPlan,repeatCount,edgePairs,focalClosureStoneCount,centerStoneCount,edgeClosureRole).map(x=>resolveLumiPhysicalComponent(x,snapshot)),anchoredCharms=anchored.map(x=>resolveLumiPhysicalComponent(x,snapshot));const recoveryClosure=recovery&&((hasFocal&&focalClosureStoneCount!==2)||(!hasFocal&&centerStoneCount!==1)||edgeClosureRole!==null);const cloverFixedClosure=focalClosureStoneCount===1&&(patternPlan.decorativeCharmPlan?.materialId==='cl01'||patternPlan.focalCharmPlan?.materialId==='cl01');if(!represented(sequence,patternPlan,recoveryClosure||cloverFixedClosure))continue;const geometry=createBraceletGeometry({components:geometryComponents([...sequence,...anchoredCharms]),targetLengthMm});const completion=getBraceletCompletionEligibility({mode,usedLengthMm:geometry.usedLengthMm,targetLengthMm,fixedComponentLengthMm:fixed,supportedComponentLengthsMm:[4,6,10]});if(!completion.eligible)continue;const key=`${patternPlan.patternPlanId}|${JSON.stringify(sequence.map(x=>[x.componentType,x.materialId,x.sizeMm]))}|${JSON.stringify(anchoredCharms.map(x=>x.materialId))}`,counts=freeze({totalSequenceComponents:sequence.length,stoneCount:sequence.filter(x=>x.componentType==='stone').length,loopCharmCount:sequence.filter(x=>x.componentType==='loop_charm').length,spacerCount:sequence.filter(x=>x.componentType==='spacer').length,anchoredCharmCount:anchoredCharms.length});results.push(freeze({fitVersion:LUMI_FIT_VERSION,profileFingerprint:profile.profileFingerprint,catalogFingerprint:snapshot.catalogVersion,patternPlanId:patternPlan.patternPlanId,compositionCandidateId:patternPlan.compositionCandidateId,physicalCandidateId:`lumi-fit1-${hash(key)}`,targetLengthMm:round(targetLengthMm),actualLengthMm:round(geometry.usedLengthMm),fitDeltaMm:round(geometry.differenceMm),fitStatus:'VALID',sequence:freeze(sequence),anchoredCharms:freeze(anchoredCharms),componentCounts:counts,repeatCount,edgeFillerPairs:edgePairs,patternPreservation:freeze({archetype:patternPlan.pattern.archetype,symmetry:patternPlan.pattern.symmetry,valid:true}),geometry:freeze({...geometry,completion}),diagnostics:freeze({canonicalKey:key})}));}if(patternPlan.pattern.rainbowSplit===true&&mode==='mixed'){const splitTokens=rainbowSplitTokens(patternPlan,snapshot,targetLengthMm);if(splitTokens){const resolved=splitTokens.map(x=>resolveLumiPhysicalComponent(x,snapshot)),splitAnchored=anchored.map(x=>resolveLumiPhysicalComponent(x,snapshot)),splitGeometry=createBraceletGeometry({components:geometryComponents([...resolved,...splitAnchored]),targetLengthMm}),splitCompletion=getBraceletCompletionEligibility({mode,usedLengthMm:splitGeometry.usedLengthMm,targetLengthMm,fixedComponentLengthMm:fixed,supportedComponentLengthsMm:[4,6,10]});if(represented(resolved,patternPlan,true)&&splitCompletion.eligible){const splitKey=patternPlan.patternPlanId+'|split|'+JSON.stringify(resolved.map(x=>[x.componentType,x.materialId,x.sizeMm]))+'|'+JSON.stringify(splitAnchored.map(x=>x.materialId)),splitCounts=freeze({totalSequenceComponents:resolved.length,stoneCount:resolved.filter(x=>x.componentType==='stone').length,loopCharmCount:resolved.filter(x=>x.componentType==='loop_charm').length,spacerCount:0,anchoredCharmCount:splitAnchored.length});results.push(freeze({fitVersion:LUMI_FIT_VERSION,profileFingerprint:profile.profileFingerprint,catalogFingerprint:snapshot.catalogVersion,patternPlanId:patternPlan.patternPlanId,compositionCandidateId:patternPlan.compositionCandidateId,physicalCandidateId:'lumi-fit2-'+hash(splitKey),targetLengthMm:round(targetLengthMm),actualLengthMm:round(splitGeometry.usedLengthMm),fitDeltaMm:round(splitGeometry.differenceMm),fitStatus:'VALID',sequence:freeze(resolved),anchoredCharms:freeze(splitAnchored),componentCounts:splitCounts,repeatCount:0,edgeFillerPairs:0,patternPreservation:freeze({archetype:patternPlan.pattern.archetype,symmetry:patternPlan.pattern.symmetry,valid:true}),geometry:freeze({...splitGeometry,completion:splitCompletion}),diagnostics:freeze({canonicalKey:splitKey})}));}}}
const unique=[...new Map(results.map(x=>[x.diagnostics.canonicalKey,x])).values()].sort((a,b)=>(patternPlan.pattern.rainbowSplit===true?new Set(b.sequence.filter(x=>x.componentType==='stone').map(x=>x.materialId)).size-new Set(a.sequence.filter(x=>x.componentType==='stone').map(x=>x.materialId)).size:0)||Math.abs(a.fitDeltaMm)-Math.abs(b.fitDeltaMm)||a.physicalCandidateId.localeCompare(b.physicalCandidateId)).slice(0,config.bounds.maxRetained);if(!unique.length)throw lumiFitError(LUMI_FIT_ERROR_CODES.NO_LEGAL_EXPANSION,'No legal physical expansion.');return freeze({fitVersion:LUMI_FIT_VERSION,patternPlanId:patternPlan.patternPlanId,targetLengthMm:round(targetLengthMm),candidates:freeze(unique),diagnostics:freeze({rawAttempts:(config.bounds.maxRepeatCount+1)*(config.bounds.maxEdgeFillersPerSide+1),retained:unique.length})});}









