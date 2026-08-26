// Production rollout switch. Set this to false and deploy to immediately restore
// the legacy mobile LINE-before-Step-1 flow.
export const DEFER_LINE_LOGIN_TO_STEP4 = true;
export const LINE_REDIRECT_INTENT_VERSION = 2;
export const LINE_CALLBACK_HANDOFF_PARAM = 'line_handoff';
export const LINE_CALLBACK_RESUME_PARAM = 'line_resume';
export const LINE_CALLBACK_RESUME_VALUE = 'guest_design_handoff';

// Test injection only: callers must pass this value directly in memory. It never
// reads a URL, local/session storage, DOM, or user-controlled production input.
export function resolveDeferredLineLoginFlag({ testOverride } = {}) {
  return testOverride === true ? true : DEFER_LINE_LOGIN_TO_STEP4;
}

// Pure Phase 3B.2A decision helper. It is intentionally not wired into app.js yet.
export function shouldDeferInitialLineLogin({ featureEnabled = false, requiresLineLogin = false, isAuthenticated = false, isCustomization = false } = {}) {
  if (!featureEnabled || !isCustomization || !requiresLineLogin) return false;
  // An authenticated user already passes the legacy guard; no deferred bypass is needed.
  if (isAuthenticated) return false;
  return true;
}

const HANDOFF_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const ALLOWED_TARGET_STEPS = new Set([1, 4]);

export function parseCustomizationLoginIntent(rawIntent, { now = Date.now(), ttlMs = 10 * 60 * 1000 } = {}) {
  if (typeof rawIntent !== 'string') return null;
  try {
    const intent = JSON.parse(rawIntent);
    const ts = Number(intent?.ts);
    if (!Number.isFinite(ts) || now - ts < 0 || now - ts > ttlMs) return null;
    if (!intent.version) return Number(intent.step) === 1 ? { version: 1, ts, step: 1, targetStep: 1, mode: 'legacy' } : null;
    if (intent.version !== LINE_REDIRECT_INTENT_VERSION) return null;
    const targetStep = Number(intent.targetStep);
    if (!ALLOWED_TARGET_STEPS.has(targetStep) || !HANDOFF_TOKEN_PATTERN.test(String(intent.handoffToken || ''))) return null;
    return { version: 2, ts, step: Number(intent.step) || 1, targetStep, handoffToken: intent.handoffToken, mode: 'guest_design_handoff' };
  } catch {
    return null;
  }
}

export function createLineRedirectIntent({ handoffToken, targetStep = 4, now = Date.now(), featureEnabled = DEFER_LINE_LOGIN_TO_STEP4 } = {}) {
  if (featureEnabled !== true || !ALLOWED_TARGET_STEPS.has(targetStep) || !HANDOFF_TOKEN_PATTERN.test(String(handoffToken || ''))) return null;
  return { version: LINE_REDIRECT_INTENT_VERSION, ts: Number(now), step: 3, targetStep, handoffToken, mode: 'guest_design_handoff' };
}

// The URL contains only the opaque, short-lived server handoff token. It never
// carries customer design data and cannot authorize Step 4 by itself.
export function createLineCallbackResumeUrl(baseUrl, { handoffToken, targetStep = 4, now = Date.now(), featureEnabled = DEFER_LINE_LOGIN_TO_STEP4 } = {}) {
  const intent = createLineRedirectIntent({ handoffToken, targetStep, now, featureEnabled });
  if (!intent || typeof baseUrl !== 'string') return null;
  try {
    const url = new URL(baseUrl);
    url.searchParams.set(LINE_CALLBACK_HANDOFF_PARAM, intent.handoffToken);
    url.searchParams.set(LINE_CALLBACK_RESUME_PARAM, LINE_CALLBACK_RESUME_VALUE);
    return url.toString();
  } catch {
    return null;
  }
}

export function parseLineCallbackResumeIntent(urlValue, { now = Date.now(), featureEnabled = DEFER_LINE_LOGIN_TO_STEP4 } = {}) {
  if (typeof urlValue !== 'string') return null;
  try {
    const url = new URL(urlValue);
    if (url.searchParams.get(LINE_CALLBACK_RESUME_PARAM) !== LINE_CALLBACK_RESUME_VALUE) return null;
    return createLineRedirectIntent({
      handoffToken: url.searchParams.get(LINE_CALLBACK_HANDOFF_PARAM),
      targetStep: 4,
      now,
      featureEnabled
    });
  } catch {
    return null;
  }
}

export async function restoreLineRedirectHandoff({ intent, consumeServerHandoff, restoreLocalSnapshot } = {}) {
  if (!intent || intent.version !== 2 || intent.mode !== 'guest_design_handoff') return { ok: false, reason: 'no_handoff_intent' };
  try {
    const serverResult = await consumeServerHandoff?.(intent.handoffToken);
    if (serverResult?.ok) return { ...serverResult, source: 'server', targetStep: intent.targetStep };
    // A server-confirmed missing/expired/consumed token is terminal. Do not
    // resurrect an old local design after an explicitly invalid callback.
    if (serverResult?.reason === 'not_found') return { ok: false, reason: 'handoff_not_found' };
  } catch {
    // A same-context local snapshot is the deliberately safe fallback.
  }
  try {
    const localResult = await restoreLocalSnapshot?.();
    if (localResult?.ok) return { ...localResult, source: 'local', targetStep: intent.targetStep };
  } catch {
    // Normal current-flow fallback is selected below.
  }
  return { ok: false, reason: 'handoff_unavailable' };
}
