import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import { createDeferredStep3AuthBoundary } from '../deferred-step3-auth-boundary.js';
import { parseCustomizationLoginIntent } from '../line-redirect-restore.js';

const require = createRequire(import.meta.url);
const { normalizeHandoffPayload } = require('../line-auth-handoff.js');

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

test('snapshot and handoff failures never invoke LINE login', async () => {
  const scenarios = [
    {
      overrides: { saveSnapshot: () => ({ ok: false }) },
      reason: 'SNAPSHOT_CREATE_FAILED',
      expected: []
    },
    {
      overrides: { createHandoff: async () => null },
      reason: 'HANDOFF_TOKEN_MISSING',
      expected: ['snapshot']
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

test('a valid server handoff proceeds when iOS local intent persistence is unavailable', async () => {
  const { boundary, order } = createControlledBoundary({
    persistIntent: () => false
  });
  const result = await boundary();
  assert.equal(result.ok, true);
  assert.equal(result.intentPersisted, false);
  assert.deepEqual(order, ['snapshot', 'handoff', 'login']);
});

test('mixed Step 3 snapshot passes server handoff normalization and proceeds to deferred LINE auth', async () => {
  const mixedSnapshot = {
    version: 1,
    savedAt: 1_760_000_000_000,
    expiresAt: 1_760_007_200_000,
    step: 3,
    design: {
      wristSize: 16.5,
      beadSize: 'mixed',
      mixedPlacingSize: 10,
      selectedCharmIds: ['gold-anchor'],
      components: [
        { type: 'stone', id: 'amethyst', size: 4, uniqueId: 1 },
        { type: 'spacer', id: 'silver-spacer', uniqueId: 2 },
        { type: 'stone', id: 'amethyst', size: 10, uniqueId: 3 },
        { type: 'charm', id: 'heart-charm', uniqueId: 4 },
        { type: 'stone', id: 'amethyst', size: 6, uniqueId: 5 }
      ]
    }
  };
  const normalized = normalizeHandoffPayload({ targetStep: 4, designSnapshot: mixedSnapshot }, 1_760_000_000_100);
  assert.ok(normalized);
  assert.equal(normalized.designSnapshot.design.beadSize, 'mixed');
  assert.equal(normalized.designSnapshot.design.mixedPlacingSize, 10);
  assert.deepEqual(normalized.designSnapshot.design.components.filter((item) => item.type === 'stone').map((item) => item.size), [4, 10, 6]);

  const order = [];
  const boundary = createDeferredStep3AuthBoundary({
    resolveFeatureEnabled: () => true,
    requiresLineLogin: () => true,
    isAuthenticated: () => false,
    saveSnapshot: () => ({ ok: true, snapshot: mixedSnapshot }),
    createHandoff: async (payload) => {
      order.push('handoff');
      assert.ok(normalizeHandoffPayload(payload, 1_760_000_000_100));
      return { token };
    },
    persistIntent: () => false,
    startLineLogin: async (intent) => {
      order.push('login');
      assert.equal(intent.handoffToken, token);
      return true;
    }
  });
  const result = await boundary();
  assert.equal(result.ok, true);
  assert.equal(result.intentPersisted, false);
  assert.deepEqual(order, ['handoff', 'login']);
});

test('fixed 4mm, 6mm, and 10mm snapshots remain valid server handoffs', () => {
  for (const beadSize of ['4', '6', '10']) {
    const fixedSnapshot = {
      version: 1,
      savedAt: 1_760_000_000_000,
      expiresAt: 1_760_007_200_000,
      step: 3,
      design: {
        wristSize: 16,
        beadSize,
        selectedCharmIds: [],
        components: [{ type: 'stone', id: 'amethyst', uniqueId: 1 }]
      }
    };
    const normalized = normalizeHandoffPayload({ targetStep: 4, designSnapshot: fixedSnapshot }, 1_760_000_000_100);
    assert.ok(normalized, `${beadSize}mm handoff must normalize`);
    assert.equal(normalized.designSnapshot.design.components[0].size, Number(beadSize));
  }
});

test('a LINE-start failure clears the just-persisted V2 intent and does not advance', async () => {
  let cleared = 0;
  const { boundary, order } = createControlledBoundary({
    startLineLogin: async () => false,
    clearIntent: () => { cleared += 1; }
  });
  assert.deepEqual(await boundary(), { handled: true, ok: false, reason: 'LOGIN_START_UNEXPECTED_RETURN' });
  assert.deepEqual(order, ['snapshot', 'handoff', 'intent']);
  assert.equal(cleared, 1);
});

test('a LIFF readiness failure is preserved as a safe F05 subtype', async () => {
  const { boundary } = createControlledBoundary({
    startLineLogin: async () => ({ ok: false, reason: 'LIFF_INIT_FAILED' })
  });
  assert.deepEqual(await boundary(), { handled: true, ok: false, reason: 'LIFF_INIT_FAILED' });
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
  assert.match(appSource, /await ensureLiffInitializedForDeferredLogin\(\);[\s\S]*if \(isLiffLoggedIn\(\)\) return \{ ok: false, reason: 'LOGIN_START_UNEXPECTED_RETURN' \};/);
  assert.match(appSource, /createGuestDesignSnapshot\(canonicalState\)/);
  assert.match(appSource, /return persisted\.ok \? persisted : \{ ok: true, snapshot, persistence: 'unavailable' \};/);
  assert.match(appSource, /await ensureLiffInitializedForDeferredLogin\(\)/);
  assert.match(appSource, /liff\.login\(\{ redirectUri \}\)/);
  assert.match(appSource, /hasLineHandoff: url\.searchParams\.has\('line_handoff'\)/);
});
