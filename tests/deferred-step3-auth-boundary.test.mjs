import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createDeferredStep3AuthBoundary } from '../deferred-step3-auth-boundary.js';
import { parseCustomizationLoginIntent } from '../line-redirect-restore.js';

const token = 'a'.repeat(43);
const snapshot = {
  version: 1,
  savedAt: 1_760_000_000_000,
  expiresAt: 1_760_007_200_000,
  step: 3,
  design: {
    wristSize: 18,
    beadSize: '10',
    selectedCharmIds: ['gold-anchor'],
    components: [{ type: 'stone', id: 'beryl' }, { type: 'spacer', id: 'silver-spacer' }]
  }
};

function createControlledBoundary(overrides = {}) {
  const order = [];
  const boundary = createDeferredStep3AuthBoundary({
    resolveFeatureEnabled: () => true,
    requiresLineLogin: () => true,
    isAuthenticated: () => false,
    saveSnapshot: () => {
      order.push('snapshot');
      return { ok: true, snapshot };
    },
    createHandoff: async (payload) => {
      order.push('handoff');
      assert.equal(payload.targetStep, 4);
      assert.deepEqual(payload.designSnapshot, snapshot);
      return { token };
    },
    persistIntent: (intent) => {
      order.push('intent');
      assert.equal(intent.version, 2);
      assert.equal(intent.step, 3);
      assert.equal(intent.targetStep, 4);
      assert.equal(intent.handoffToken, token);
      return true;
    },
    startLineLogin: async () => {
      order.push('login');
      return true;
    },
    getAnalyticsContinuity: () => ({
      visitorId: 'visitor_12345678',
      sessionId: 'session_12345678',
      attribution: { source: 'instagram', medium: 'paid', campaign: 'launch' }
    }),
    ...overrides
  });
  return { boundary, order };
}

test('guest sequence saves snapshot, creates handoff, persists V2 intent, then starts LINE login', async () => {
  const { boundary, order } = createControlledBoundary();
  const result = await boundary();
  assert.equal(result.ok, true);
  assert.equal(result.handled, true);
  assert.equal(result.intent.mode, 'guest_design_handoff');
  assert.deepEqual(order, ['snapshot', 'handoff', 'intent', 'login']);
});

test('disabled flag, authenticated mobile, and desktop retain their direct legacy path', async () => {
  for (const overrides of [
    { resolveFeatureEnabled: () => false },
    { isAuthenticated: () => true },
    { requiresLineLogin: () => false }
  ]) {
    const { boundary, order } = createControlledBoundary(overrides);
    assert.deepEqual(await boundary(), { handled: false, ok: true });
    assert.deepEqual(order, []);
  }
});

test('an asynchronously recovered LIFF identity skips handoff creation and login', async () => {
  const { boundary, order } = createControlledBoundary({
    isAuthenticated: async () => true
  });
  assert.deepEqual(await boundary(), { handled: false, ok: true });
  assert.deepEqual(order, []);
});

test('snapshot, handoff, and intent failures never invoke LINE login', async () => {
  const scenarios = [
    {
      overrides: { saveSnapshot: () => ({ ok: false }) },
      reason: 'snapshot_unavailable',
      expected: []
    },
    {
      overrides: { createHandoff: async () => null },
      reason: 'handoff_unavailable',
      expected: ['snapshot']
    },
    {
      overrides: { persistIntent: () => false },
      reason: 'intent_unavailable',
      expected: ['snapshot', 'handoff']
    }
  ];

  for (const scenario of scenarios) {
    const { boundary, order } = createControlledBoundary(scenario.overrides);
    const result = await boundary();
    assert.equal(result.handled, true);
    assert.equal(result.ok, false);
    assert.equal(result.reason, scenario.reason);
    assert.deepEqual(order, scenario.expected);
  }
});

test('a LINE-start failure clears the just-persisted V2 intent and does not advance', async () => {
  let cleared = 0;
  const { boundary, order } = createControlledBoundary({
    startLineLogin: async () => false,
    clearIntent: () => { cleared += 1; }
  });
  assert.deepEqual(await boundary(), { handled: true, ok: false, reason: 'login_start_failed' });
  assert.deepEqual(order, ['snapshot', 'handoff', 'intent']);
  assert.equal(cleared, 1);
});

test('legacy intent parsing remains compatible', () => {
  assert.deepEqual(
    parseCustomizationLoginIntent(JSON.stringify({ ts: 1_760_000_000_000, step: 1 }), { now: 1_760_000_000_001 }),
    { version: 1, ts: 1_760_000_000_000, step: 1, targetStep: 1, mode: 'legacy' }
  );
});

test('the real Step 3 handler invokes the production boundary before navigation', async () => {
  const appSource = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const navigationStart = appSource.indexOf('function setupNavigationEvents()');
  const navigationEnd = appSource.indexOf('function clearShippingValidation', navigationStart);
  const navigation = appSource.slice(navigationStart, navigationEnd);
  assert.ok(navigation.indexOf('const deferredAuth = await beginDeferredStep3AuthBoundary()') > navigation.indexOf('const hasStock = await validateCurrentDesignStockWithLatestCatalog()'));
  assert.ok(navigation.indexOf('if (deferredAuth.handled)') < navigation.indexOf('await goToStep(State.currentStep + 1)'));
  assert.match(appSource, /async function resolveExistingLineIdentityForDeferredStep3Auth\(\)/);
  assert.match(appSource, /return isLiffLoggedIn\(\) \? await syncLineProfileFromLiff\(\) : false/);
  assert.match(appSource, /if \(isLiffLoggedIn\(\)\) return false;[\s\S]*canUseLiffLoginFromCurrentBrowser/);
});
