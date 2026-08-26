import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  ANALYTICS_FUNNEL_VERSION,
  ANALYTICS_SESSION_TIMEOUT_MS,
  createAnalyticsEventProperties,
  createFunnelStageKey,
  normalizeAnalyticsContinuity,
  resolveAnalyticsSession,
  shouldTrackFunnelStage
} from '../analytics-tracking.js';

const NOW = Date.parse('2026-08-23T10:00:00.000Z');
const SESSION_ID = 'session_analytics_123456';
const VISITOR_ID = '11111111-1111-4111-8111-111111111111';

test('continues an active session and starts a new one after inactivity', () => {
  const active = resolveAnalyticsSession({
    sessionId: SESSION_ID,
    startedAt: '2026-08-23T09:00:00.000Z',
    lastSeenAt: new Date(NOW - 10 * 60 * 1000).toISOString(),
    now: NOW,
    createSessionId: () => 'unexpected'
  });
  assert.equal(active.sessionId, SESSION_ID);
  assert.equal(active.continued, true);

  const expired = resolveAnalyticsSession({
    sessionId: SESSION_ID,
    lastSeenAt: new Date(NOW - ANALYTICS_SESSION_TIMEOUT_MS).toISOString(),
    now: NOW,
    createSessionId: () => 'session_analytics_new_123'
  });
  assert.equal(expired.sessionId, 'session_analytics_new_123');
  assert.equal(expired.continued, false);
});

test('validated LINE callback continuity preserves session, visitor, and first touch', () => {
  const continuity = normalizeAnalyticsContinuity({
    sessionId: SESSION_ID,
    visitorId: VISITOR_ID,
    startedAt: '2026-08-23T09:30:00.000Z',
    lastSeenAt: new Date(NOW - 60 * 1000).toISOString(),
    attribution: { source: 'instagram', medium: 'paid', campaign: 'bracelet_launch', platform: 'instagram' }
  }, { now: NOW });
  assert.equal(continuity.sessionId, SESSION_ID);
  assert.equal(continuity.visitorId, VISITOR_ID);
  assert.equal(continuity.attribution.source, 'instagram');
  assert.equal(continuity.attribution.platform, 'instagram');
});

test('expired or malformed callback continuity fails closed', () => {
  assert.equal(normalizeAnalyticsContinuity({
    sessionId: SESSION_ID,
    visitorId: VISITOR_ID,
    startedAt: '2026-08-23T09:00:00.000Z',
    lastSeenAt: new Date(NOW - ANALYTICS_SESSION_TIMEOUT_MS).toISOString()
  }, { now: NOW }), null);
});

test('canonical stages have stable per-session keys and are only tracked once locally', () => {
  const tracked = new Set();
  const first = shouldTrackFunnelStage({ trackedStageKeys: tracked, sessionId: SESSION_ID, eventName: 'step_3_view' });
  assert.equal(first.shouldTrack, true);
  tracked.add(first.key);
  assert.equal(shouldTrackFunnelStage({ trackedStageKeys: tracked, sessionId: SESSION_ID, eventName: 'step_3_view' }).shouldTrack, false);
  assert.equal(createFunnelStageKey(SESSION_ID, 'line_connected'), `v${ANALYTICS_FUNNEL_VERSION}:${SESSION_ID}:line_connected`);
  const props = createAnalyticsEventProperties({ sessionId: SESSION_ID, eventName: 'line_connected', startedAt: '2026-08-23T09:30:00.000Z', currentStage: 'line_connected' });
  assert.equal(props.funnel_stage, 'line_connected');
  assert.equal(props.funnel_version, ANALYTICS_FUNNEL_VERSION);
});

test('real callback path applies handoff continuity before deferred analytics initialization', async () => {
  const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const restoreStart = source.indexOf('async function restoreDeferredLineCallbackBeforeReset');
  const restoreEnd = source.indexOf('function persistLandingDismissed', restoreStart);
  const restore = source.slice(restoreStart, restoreEnd);
  assert.match(restore, /applyDeferredLineAuthAnalyticsContinuity\(restored\.analyticsContinuity\)/);
  const startupStart = source.indexOf("document.addEventListener('DOMContentLoaded'");
  const startupEnd = source.indexOf("function createAnalyticsSessionId()", startupStart);
  const startup = source.slice(startupStart, startupEnd);
  assert.ok(startup.indexOf('const deferAnalyticsUntilCallbackRestore = shouldHoldForDeferredCallback') < startup.indexOf('await initLIFF()'));
  assert.ok(startup.indexOf('restored = await restoreDeferredLineCallbackBeforeReset(startupRawCustomizationIntent)') < startup.lastIndexOf('if (deferAnalyticsUntilCallbackRestore)'));
});

test('LINE/OA funnel tracking is emitted only by the verified-friend path', async () => {
  const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const helperStart = source.indexOf('function trackVerifiedLineOaConnection()');
  const helperEnd = source.indexOf('function setLineOaFriendshipResumePending()', helperStart);
  const helper = source.slice(helperStart, helperEnd);
  assert.match(helper, /if \(!isLineIdentityAvailable\(\)\) return/);
  assert.match(helper, /trackAnalyticsEvent\('oa_friend_verified'\)/);
  assert.match(helper, /trackAnalyticsEvent\('line_connected'\)/);
  const gateStart = source.indexOf('async function canEnterOperationalStep4');
  const gateEnd = source.indexOf('async function resumeLineOaFriendshipAfterReturn()', gateStart);
  const gate = source.slice(gateStart, gateEnd);
  assert.ok(gate.indexOf('trackVerifiedLineOaConnection()') > gate.indexOf('if (friendship.friendFlag)'));
  assert.match(gate, /trackAnalyticsEvent\('oa_friend_required'/);
});

test('landing start records the resolved Step 1 stage after rendering', async () => {
  const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const handlerStart = source.indexOf("function setupLandingEvents()");
  const handlerEnd = source.indexOf("function updateLiffProfileDisplay", handlerStart);
  const handler = source.slice(handlerStart, handlerEnd);
  assert.ok(handler.indexOf('await renderApp();') < handler.indexOf('trackStepView(1);'));
});
