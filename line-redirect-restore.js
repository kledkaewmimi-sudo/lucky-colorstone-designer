export const DEFER_LINE_LOGIN_TO_STEP4 = false;
export const LINE_REDIRECT_INTENT_VERSION = 2;

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

export function createLineRedirectIntent({ handoffToken, targetStep = 4, now = Date.now() } = {}) {
  if (!DEFER_LINE_LOGIN_TO_STEP4 || !ALLOWED_TARGET_STEPS.has(targetStep) || !HANDOFF_TOKEN_PATTERN.test(String(handoffToken || ''))) return null;
  return { version: LINE_REDIRECT_INTENT_VERSION, ts: Number(now), step: 3, targetStep, handoffToken, mode: 'guest_design_handoff' };
}

export async function restoreLineRedirectHandoff({ intent, consumeServerHandoff, restoreLocalSnapshot } = {}) {
  if (!intent || intent.version !== 2 || intent.mode !== 'guest_design_handoff') return { ok: false, reason: 'no_handoff_intent' };
  try {
    const serverResult = await consumeServerHandoff?.(intent.handoffToken);
    if (serverResult?.ok) return { ...serverResult, source: 'server', targetStep: intent.targetStep };
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
