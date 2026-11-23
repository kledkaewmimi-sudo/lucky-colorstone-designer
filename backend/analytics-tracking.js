export const ANALYTICS_SCHEMA_VERSION = 2;
export const ANALYTICS_FUNNEL_VERSION = 2;
export const ANALYTICS_SESSION_TIMEOUT_MS = 30 * 60 * 1000;

export const ANALYTICS_FUNNEL_STAGES = Object.freeze([
  'landing_view',
  'start_design',
  'step_1_view',
  'step_2_view',
  'step_3_view',
  'line_connected',
  'step_4_view',
  'checkout_started',
  'payment_success'
]);

export const ANALYTICS_STAGE_RANK = Object.freeze({
  landing_view: 1,
  start_design: 2,
  step_1_view: 3,
  step_2_view: 4,
  step_3_view: 5,
  line_connected: 6,
  step_4_view: 7,
  checkout_started: 8,
  payment_success: 9
});

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const VISITOR_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ATTRIBUTION_FIELDS = ['source', 'medium', 'campaign', 'content', 'term', 'platform'];

function parseTimestamp(value) {
  const time = Date.parse(String(value || ''));
  return Number.isFinite(time) ? time : 0;
}

export function resolveAnalyticsSession({ sessionId = '', startedAt = '', lastSeenAt = '', now = Date.now(), createSessionId } = {}) {
  const seenAt = parseTimestamp(lastSeenAt);
  const canContinue = SESSION_ID_PATTERN.test(String(sessionId))
    && seenAt > 0
    && now >= seenAt
    && now - seenAt < ANALYTICS_SESSION_TIMEOUT_MS;
  const nextSessionId = canContinue ? String(sessionId) : createSessionId?.();
  const nextStartedAt = canContinue && parseTimestamp(startedAt) ? String(startedAt) : new Date(now).toISOString();
  return {
    sessionId: nextSessionId || '',
    startedAt: nextStartedAt,
    lastSeenAt: new Date(now).toISOString(),
    continued: canContinue
  };
}

export function normalizeAnalyticsContinuity(value = {}, { now = Date.now() } = {}) {
  const sessionId = SESSION_ID_PATTERN.test(String(value?.sessionId || '')) ? String(value.sessionId) : '';
  const visitorId = VISITOR_ID_PATTERN.test(String(value?.visitorId || '')) ? String(value.visitorId).toLowerCase() : '';
  const startedAt = parseTimestamp(value?.startedAt);
  const lastSeenAt = parseTimestamp(value?.lastSeenAt);
  if (!sessionId || !visitorId || !startedAt || !lastSeenAt || now < lastSeenAt || now - lastSeenAt >= ANALYTICS_SESSION_TIMEOUT_MS) return null;
  const attribution = {};
  ATTRIBUTION_FIELDS.forEach((key) => {
    const text = typeof value?.attribution?.[key] === 'string' ? value.attribution[key].trim() : '';
    if (text && text.length <= 160) attribution[key] = text;
  });
  return {
    sessionId,
    visitorId,
    startedAt: new Date(startedAt).toISOString(),
    lastSeenAt: new Date(lastSeenAt).toISOString(),
    attribution
  };
}

export function isCanonicalFunnelStage(eventName) {
  return ANALYTICS_FUNNEL_STAGES.includes(String(eventName || ''));
}

export function createFunnelStageKey(sessionId, eventName) {
  if (!SESSION_ID_PATTERN.test(String(sessionId)) || !isCanonicalFunnelStage(eventName)) return '';
  return `v${ANALYTICS_FUNNEL_VERSION}:${sessionId}:${eventName}`;
}

export function createAnalyticsEventProperties({ sessionId, eventName, startedAt, currentStage, properties = {} } = {}) {
  const safeProperties = {
    ...properties,
    started_at: startedAt || '',
    schema_version: ANALYTICS_SCHEMA_VERSION,
    funnel_version: ANALYTICS_FUNNEL_VERSION,
    current_stage: currentStage || ''
  };
  if (isCanonicalFunnelStage(eventName)) {
    safeProperties.funnel_stage = eventName;
    safeProperties.funnel_stage_key = createFunnelStageKey(sessionId, eventName);
  }
  return safeProperties;
}

export function shouldTrackFunnelStage({ trackedStageKeys, sessionId, eventName } = {}) {
  const key = createFunnelStageKey(sessionId, eventName);
  if (!key) return { shouldTrack: true, key: '' };
  return { shouldTrack: !trackedStageKeys?.has(key), key };
}
