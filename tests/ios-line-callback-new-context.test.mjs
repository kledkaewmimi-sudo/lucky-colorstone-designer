import assert from 'node:assert/strict';
import test from 'node:test';
import { createGuestDesignSnapshot } from '../guest-design-state.js';
import { createLineCallbackRestoreGuard, planLineCallbackBootstrap, runDormantV2CallbackRestore } from '../line-callback-bootstrap.js';
import { createLineRedirectIntent, parseCustomizationLoginIntent } from '../line-redirect-restore.js';

const NOW = 1_760_000_000_000;
const TOKEN = 'i'.repeat(43);
const snapshot = createGuestDesignSnapshot({
  currentStep: 3, wristSize: 16.5, beadSize: 'mixed', mixedPlacingSize: 10,
  selectedCharmIds: ['gold-anchor'],
  selectedStones: [
    { componentType: 'stone', stoneId: 'amethyst', size: 4, uniqueId: 31 },
    { componentType: 'spacer', spacerId: 'silver-spacer', uniqueId: 32 },
    { componentType: 'stone', stoneId: 'quartz', size: 10, uniqueId: 33 }
  ]
}, { now: NOW });

function rawIntent() {
  return JSON.stringify(createLineRedirectIntent({ handoffToken: TOKEN, targetStep: 4, now: NOW, featureEnabled: true }));
}

test('a fresh iOS context waits for LINE identity before a valid opaque handoff can restore', () => {
  const intent = parseCustomizationLoginIntent(rawIntent(), { now: NOW + 1 });
  assert.equal(intent.handoffToken, TOKEN);
  assert.equal(planLineCallbackBootstrap({ rawIntent: rawIntent(), hasLineIdentity: false, featureEnabled: true, now: NOW + 1 }).kind, 'v2-wait-for-identity');
  assert.equal(planLineCallbackBootstrap({ rawIntent: rawIntent(), hasLineIdentity: true, featureEnabled: true, now: NOW + 1 }).kind, 'v2-restore-before-reset');
});

test('authenticated callback restores the server handoff before applying its design', async () => {
  const order = [];
  const restored = await runDormantV2CallbackRestore({
    rawIntent: rawIntent(), hasLineIdentity: true, featureEnabled: true,
    guard: createLineCallbackRestoreGuard(),
    consumeServerHandoff: async () => { order.push('read'); return { ok: true, snapshot }; },
    applyCanonicalDesign: async (value, options) => { order.push('apply'); assert.equal(value, snapshot); assert.equal(options.targetStep, 4); },
    now: NOW + 1
  });
  assert.equal(restored.ok, true);
  assert.equal(restored.source, 'server');
  assert.deepEqual(order, ['read', 'apply']);
});

test('invalid server handoff cannot resurrect a local design or authorize a callback', async () => {
  const restored = await runDormantV2CallbackRestore({
    rawIntent: rawIntent(), hasLineIdentity: true, featureEnabled: true,
    guard: createLineCallbackRestoreGuard(),
    consumeServerHandoff: async () => ({ ok: false, reason: 'not_found' }),
    restoreLocalSnapshot: async () => { throw new Error('must not run'); },
    now: NOW + 1
  });
  assert.deepEqual(restored, { ok: false, reason: 'handoff_not_found' });
});
