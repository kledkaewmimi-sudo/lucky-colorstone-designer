import { createLineRedirectIntent, resolveDeferredLineLoginFlag } from './line-redirect-restore.js';
import { classifyLineLoginStarterResult } from './line-login-start-diagnostic.js';

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
      return {
        handled: true,
        ok: false,
        reason: savedSnapshot?.reason === 'storage_unavailable' ? 'LOCAL_SNAPSHOT_UNAVAILABLE' : 'SNAPSHOT_CREATE_FAILED'
      };
    }

    let handoff;
    try {
      handoff = await createHandoff({
        targetStep: 4,
        designSnapshot: savedSnapshot.snapshot,
        analyticsContinuity: getAnalyticsContinuity()
      });
    } catch {
      return { handled: true, ok: false, reason: 'HANDOFF_POST_NETWORK_FAILED' };
    }
    if (!handoff?.token) {
      return {
        handled: true,
        ok: false,
        reason: handoff?.reason || 'HANDOFF_TOKEN_MISSING',
        ...(Number.isInteger(handoff?.status) ? { status: handoff.status } : {})
      };
    }

    const intent = createLineRedirectIntent({
      handoffToken: handoff.token,
      targetStep: 4,
      featureEnabled: true
    });
    if (!intent) return { handled: true, ok: false, reason: 'UNKNOWN_BOUNDARY_FAILURE' };

    // The opaque intent is passed directly to the login redirect. Persisting it
    // locally is a same-context optimization, not a prerequisite for the
    // server-first recovery path after an iOS browser-context replacement.
    let intentPersisted = false;
    try {
      intentPersisted = persistIntent(intent) === true;
    } catch {
      intentPersisted = false;
    }

    try {
      const started = await startLineLogin(intent);
      if (started === true || started?.ok === true) return { handled: true, ok: true, intent, intentPersisted };
      clearIntent();
      return { handled: true, ok: false, reason: classifyLineLoginStarterResult(started) };
    } catch {
      clearIntent();
      return { handled: true, ok: false, reason: 'LIFF_LOGIN_THROW' };
    }
  };
}
