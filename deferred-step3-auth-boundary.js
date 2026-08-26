import { createLineRedirectIntent, resolveDeferredLineLoginFlag } from './line-redirect-restore.js';

// This controller owns only the pre-redirect recovery sequence. It deliberately
// does not consume a handoff, restore design state, or navigate to Step 4.
export function createDeferredStep3AuthBoundary({
  resolveFeatureEnabled = resolveDeferredLineLoginFlag,
  requiresLineLogin = () => false,
  isAuthenticated = () => false,
  saveSnapshot = () => ({ ok: false }),
  createHandoff = async () => null,
  persistIntent = () => false,
  clearIntent = () => {},
  startLineLogin = async () => false,
  getAnalyticsContinuity = () => ({})
} = {}) {
  return async function beginDeferredStep3Auth() {
    if (resolveFeatureEnabled() !== true || !requiresLineLogin()) {
      return { handled: false, ok: true };
    }
    const authenticated = await isAuthenticated();
    if (authenticated) {
      return { handled: false, ok: true };
    }

    const savedSnapshot = saveSnapshot();
    if (!savedSnapshot?.ok || !savedSnapshot.snapshot) {
      return { handled: true, ok: false, reason: 'snapshot_unavailable' };
    }

    let handoff;
    try {
      handoff = await createHandoff({
        targetStep: 4,
        designSnapshot: savedSnapshot.snapshot,
        analyticsContinuity: getAnalyticsContinuity()
      });
    } catch {
      return { handled: true, ok: false, reason: 'handoff_unavailable' };
    }
    if (!handoff?.token) return { handled: true, ok: false, reason: 'handoff_unavailable' };

    const intent = createLineRedirectIntent({
      handoffToken: handoff.token,
      targetStep: 4,
      featureEnabled: true
    });
    if (!intent || !persistIntent(intent)) {
      return { handled: true, ok: false, reason: 'intent_unavailable' };
    }

    try {
      const started = await startLineLogin(intent);
      if (started === true) return { handled: true, ok: true, intent };
      clearIntent();
      return { handled: true, ok: false, reason: 'login_start_failed' };
    } catch {
      clearIntent();
      return { handled: true, ok: false, reason: 'login_start_failed' };
    }
  };
}
