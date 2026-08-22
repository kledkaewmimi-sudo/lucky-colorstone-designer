import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const serverHelperSource = (await readFile(new URL('../line-auth-handoff.js', import.meta.url), 'utf8'))
  .replace("const crypto = require('crypto');", "const crypto = { randomBytes: () => ({ toString: () => 'a'.repeat(43) }) };")
  .replace('module.exports = {', 'export default {');
const serverHelper = await import(`data:text/javascript,${encodeURIComponent(serverHelperSource)}`);
const { parseCustomizationLoginIntent, restoreLineRedirectHandoff, DEFER_LINE_LOGIN_TO_STEP4, resolveDeferredLineLoginFlag, shouldDeferInitialLineLogin } = await import(`data:text/javascript,${encodeURIComponent(await readFile(new URL('../line-redirect-restore.js', import.meta.url), 'utf8'))}`);
const helper = serverHelper.default;
const NOW = 1_760_000_000_000;
const snapshot = { version: 1, savedAt: NOW, expiresAt: NOW + 7_200_000, step: 3, design: { wristSize: 16, beadSize: '6', selectedCharmIds: [], components: [{ type: 'stone', id: 'beryl' }] } };

test('server handoff payload is minimized, token is opaque, and TTL is twenty minutes', () => {
  const payload = helper.normalizeHandoffPayload({ targetStep: 4, designSnapshot: snapshot, analyticsContinuity: { visitorId: 'visitor_12345678', sessionId: 'session_12345678', attribution: { source: 'instagram', campaign: 'launch', rawIp: 'blocked' } } }, NOW);
  assert.equal(helper.HANDOFF_TTL_MS, 20 * 60 * 1000);
  assert.equal(payload.targetStep, 4);
  assert.equal(payload.analyticsContinuity.attribution.rawIp, undefined);
  assert.match(helper.createHandoffToken(), helper.TOKEN_PATTERN);
  assert.equal(JSON.stringify(payload).includes('price'), false);
});

test('legacy and new intents parse safely while deferred login remains inactive', async () => {
  assert.equal(DEFER_LINE_LOGIN_TO_STEP4, false);
  assert.deepEqual(parseCustomizationLoginIntent(JSON.stringify({ ts: NOW, step: 1 }), { now: NOW }), { version: 1, ts: NOW, step: 1, targetStep: 1, mode: 'legacy' });
  const token = 'a'.repeat(43);
  const intent = parseCustomizationLoginIntent(JSON.stringify({ version: 2, ts: NOW, step: 3, targetStep: 4, handoffToken: token }), { now: NOW });
  assert.equal(intent.mode, 'guest_design_handoff');
  const restored = await restoreLineRedirectHandoff({ intent, consumeServerHandoff: async () => ({ ok: true, snapshot }), restoreLocalSnapshot: async () => ({ ok: true }) });
  assert.equal(restored.source, 'server');
});

test('server-first restore falls back to local and fails safely when both are unavailable', async () => {
  const intent = parseCustomizationLoginIntent(JSON.stringify({ version: 2, ts: NOW, step: 3, targetStep: 4, handoffToken: 'b'.repeat(43) }), { now: NOW });
  const local = await restoreLineRedirectHandoff({ intent, consumeServerHandoff: async () => { throw new Error('offline'); }, restoreLocalSnapshot: async () => ({ ok: true, snapshot }) });
  assert.equal(local.source, 'local');
  const unavailable = await restoreLineRedirectHandoff({ intent, consumeServerHandoff: async () => null, restoreLocalSnapshot: async () => null });
  assert.deepEqual(unavailable, { ok: false, reason: 'handoff_unavailable' });
});

test('deferred initial-login decision is pure and fails safe to legacy behavior', () => {
  assert.equal(shouldDeferInitialLineLogin({ featureEnabled: false, requiresLineLogin: true, isCustomization: true }), false);
  assert.equal(shouldDeferInitialLineLogin({ featureEnabled: true, requiresLineLogin: true, isCustomization: true }), true);
  assert.equal(shouldDeferInitialLineLogin({ featureEnabled: true, requiresLineLogin: true, isCustomization: true, isAuthenticated: true }), false);
  assert.equal(shouldDeferInitialLineLogin({ featureEnabled: true, requiresLineLogin: false, isCustomization: true }), false);
  assert.equal(shouldDeferInitialLineLogin(), false);
});

test('test-only flag resolver defaults false and accepts only explicit in-memory true', () => {
  assert.equal(DEFER_LINE_LOGIN_TO_STEP4, false);
  assert.equal(resolveDeferredLineLoginFlag(), false);
  assert.equal(resolveDeferredLineLoginFlag({ testOverride: true }), true);
  assert.equal(resolveDeferredLineLoginFlag({ testOverride: 'true' }), false);
  assert.equal(shouldDeferInitialLineLogin({ featureEnabled: resolveDeferredLineLoginFlag({ testOverride: true }), requiresLineLogin: true, isCustomization: true }), true);
});
