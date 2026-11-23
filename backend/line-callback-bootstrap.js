import { DEFER_LINE_LOGIN_TO_STEP4, parseCustomizationLoginIntent, restoreLineRedirectHandoff } from './line-redirect-restore.js';

// The callback planner runs before the legacy reset path. V2 restoration is
// enabled only by the production rollout flag.
export function planLineCallbackBootstrap({ rawIntent, hasLineIdentity = false, restoreAlreadyApplied = false, allowDormantV2 = false, featureEnabled = DEFER_LINE_LOGIN_TO_STEP4, now = Date.now() } = {}) {
  const intent = parseCustomizationLoginIntent(rawIntent, { now });
  if (!intent) return { kind: 'normal' };
  if (intent.version === 1) return { kind: 'legacy', intent };
  if (featureEnabled !== true && !allowDormantV2) return { kind: 'legacy-safe-fallback', intent };
  if (!hasLineIdentity) return { kind: 'v2-wait-for-identity', intent };
  if (restoreAlreadyApplied) return { kind: 'v2-already-restored', intent };
  return { kind: 'v2-restore-before-reset', intent };
}

export function createLineCallbackRestoreGuard() {
  const appliedTokens = new Set();
  return {
    has(token) { return appliedTokens.has(token); },
    mark(token) { appliedTokens.add(token); },
    clear() { appliedTokens.clear(); }
  };
}

export async function runDormantV2CallbackRestore({ rawIntent, hasLineIdentity, guard, consumeServerHandoff, restoreLocalSnapshot, applyCanonicalDesign, featureEnabled = DEFER_LINE_LOGIN_TO_STEP4, allowDormantV2 = true, now = Date.now() } = {}) {
  const plan = planLineCallbackBootstrap({ rawIntent, hasLineIdentity, restoreAlreadyApplied: guard?.has(parseCustomizationLoginIntent(rawIntent, { now })?.handoffToken), featureEnabled, allowDormantV2, now });
  if (plan.kind !== 'v2-restore-before-reset') return { ok: false, reason: plan.kind };
  const restored = await restoreLineRedirectHandoff({ intent: plan.intent, consumeServerHandoff, restoreLocalSnapshot });
  if (!restored.ok) return restored;
  await applyCanonicalDesign?.(restored.snapshot, { targetStep: restored.targetStep, source: restored.source });
  guard?.mark(plan.intent.handoffToken);
  return { ...restored, restoredOnce: true };
}
