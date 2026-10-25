const hash = (value) => { let result = 2166136261; for (const character of value) { result ^= character.charCodeAt(0); result = Math.imul(result, 16777619); } return (result >>> 0).toString(16).padStart(8, '0'); };
export const compositionCanonicalKey = ({ primary, secondary, accent = null, filler, charm = null }) => [primary, secondary, accent || '-', filler, charm || '-'].join('|');
export const compositionCandidateId = (profileFingerprint, canonicalKey, version) => `lumi-comp1-${hash(`${profileFingerprint}|${canonicalKey}|${version}`)}`;
export const residualTieKey = (profileFingerprint, canonicalKey) => hash(`${profileFingerprint}|${canonicalKey}`);
