export const LUMI_FLAG_KEY = 'lumiEnabled';
export function isLumiEnabled(settings = {}) {
  // Fail closed for Lumi; normal Step 3 deliberately has no dependency on this flag.
  return settings?.[LUMI_FLAG_KEY] === true || settings?.lumi_enabled === true;
}
export function getLumiFeatureFlag(settings = {}) { return Object.freeze({ key: LUMI_FLAG_KEY, enabled: isLumiEnabled(settings) }); }
