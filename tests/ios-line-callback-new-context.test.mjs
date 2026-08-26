import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createGuestDesignSnapshot } from '../guest-design-state.js';
import { createLineCallbackRestoreGuard, planLineCallbackBootstrap, runDormantV2CallbackRestore } from '../line-callback-bootstrap.js';
import { createLineCallbackResumeUrl, parseLineCallbackResumeIntent } from '../line-redirect-restore.js';

const require = createRequire(import.meta.url);
const { normalizeHandoffPayload } = require('../line-auth-handoff.js');
const NOW = 1_760_000_000_000;
const TOKEN = 'i'.repeat(43);
const mixedState = {
  currentStep: 3,
  wristSize: 16.5,
  beadSize: 'mixed',
  mixedPlacingSize: 10,
  selectedCharmIds: ['gold-anchor'],
  selectedStones: [
    { componentType: 'stone', stoneId: 'amethyst', size: 4, uniqueId: 31 },
    { componentType: 'spacer', spacerId: 'silver-spacer', uniqueId: 32 },
    { componentType: 'stone', stoneId: 'quartz', size: 10, uniqueId: 33 },
    { componentType: 'charm', charmId: 'bee-heart', uniqueId: 34 },
    { componentType: 'stone', stoneId: 'amethyst', size: 6, uniqueId: 35 }
  ]
};

function createCallbackIntent() {
  const callbackUrl = createLineCallbackResumeUrl('https://www.luckycolorstone.com/', {
    handoffToken: TOKEN,
    targetStep: 4,
    now: NOW,
    featureEnabled: true
  });
  assert.ok(callbackUrl);
  assert.equal(callbackUrl.includes('amethyst'), false);
  const intent = parseLineCallbackResumeIntent(callbackUrl, { now: NOW + 1, featureEnabled: true });
  assert.equal(intent?.handoffToken, TOKEN);
  return JSON.stringify(intent);
}

test('same-context LINE callback remains compatible with the persisted V2 intent', async () => {
  const snapshot = createGuestDesignSnapshot(mixedState, { now: NOW });
  const applied = [];
  const rawIntent = createCallbackIntent();
  const restored = await runDormantV2CallbackRestore({
    rawIntent,
    hasLineIdentity: true,
    featureEnabled: true,
    guard: createLineCallbackRestoreGuard(),
    consumeServerHandoff: async () => ({ ok: true, snapshot }),
    applyCanonicalDesign: async (value, options) => applied.push({ value, options }),
    now: NOW + 1
  });
  assert.equal(restored.ok, true);
  assert.equal(restored.targetStep, 4);
  assert.equal(applied.length, 1);
});

test('new iOS browsing context restores the server handoff before a fresh reset', async () => {
  const snapshot = createGuestDesignSnapshot(mixedState, { now: NOW });
  const handoffPayload = normalizeHandoffPayload({ targetStep: 4, designSnapshot: snapshot }, NOW);
  assert.equal(handoffPayload.designSnapshot.design.beadSize, 'mixed');
  assert.equal(handoffPayload.designSnapshot.design.mixedPlacingSize, 10);
  assert.deepEqual(handoffPayload.designSnapshot.design.components.filter((item) => item.type === 'stone').map((item) => [item.size, item.uniqueId]), [[4, 31], [10, 33], [6, 35]]);

  // New iOS context: no State, no sessionStorage, and no localStorage intent.
  const rawIntent = createCallbackIntent();
  assert.equal(planLineCallbackBootstrap({ rawIntent, hasLineIdentity: false, featureEnabled: true, now: NOW + 1 }).kind, 'v2-wait-for-identity');
  assert.equal(planLineCallbackBootstrap({ rawIntent, hasLineIdentity: true, featureEnabled: true, now: NOW + 1 }).kind, 'v2-restore-before-reset');

  const order = [];
  const applied = [];
  const restored = await runDormantV2CallbackRestore({
    rawIntent,
    hasLineIdentity: true,
    featureEnabled: true,
    guard: createLineCallbackRestoreGuard(),
    retrieveServerHandoff: async () => {
      order.push('server_read');
      return { ok: true, snapshot: handoffPayload.designSnapshot };
    },
    finalizeServerHandoff: async () => { order.push('server_ack'); return true; },
    restoreLocalSnapshot: async () => { throw new Error('new context has no local snapshot'); },
    applyCanonicalDesign: async (value, options) => { order.push('apply'); applied.push({ value, options }); },
    now: NOW + 1
  });

  assert.equal(restored.ok, true);
  assert.equal(restored.source, 'server');
  assert.deepEqual(order, ['server_read', 'apply', 'server_ack']);
  assert.equal(applied[0].options.targetStep, 4);
  assert.equal(applied[0].value.design.wristSize, 16.5);
  assert.equal(applied[0].value.design.beadSize, 'mixed');
  assert.equal(applied[0].value.design.mixedPlacingSize, 10);
  assert.deepEqual(applied[0].value.design.components.map((item) => [item.type, item.id ?? null, item.size ?? null, item.uniqueId ?? null]), [
    ['stone', 'amethyst', 4, 31], ['spacer', 'silver-spacer', null, 32], ['stone', 'quartz', 10, 33], ['charm', 'bee-heart', null, 34], ['stone', 'amethyst', 6, 35]
  ]);
});

test('realistic logged-out iPhone auth carries the handoff through a new context and restores before friendship gating', async () => {
  const snapshot = createGuestDesignSnapshot(mixedState, { now: NOW });
  const handoffPayload = normalizeHandoffPayload({ targetStep: 4, designSnapshot: snapshot }, NOW);
  const redirectUri = createLineCallbackResumeUrl('https://customize.luckycolorstone.com/', {
    handoffToken: TOKEN,
    targetStep: 4,
    now: NOW,
    featureEnabled: true
  });
  const callbackIntent = parseLineCallbackResumeIntent(redirectUri, { now: NOW + 1, featureEnabled: true });
  assert.equal(new URL(redirectUri).searchParams.get('line_handoff'), TOKEN);
  assert.equal(new URL(redirectUri).searchParams.get('line_resume'), 'guest_design_handoff');
  assert.equal(planLineCallbackBootstrap({ rawIntent: JSON.stringify(callbackIntent), hasLineIdentity: false, featureEnabled: true, now: NOW + 1 }).kind, 'v2-wait-for-identity');

  const order = [];
  let restoredDesign = null;
  let freshResetAttempts = 0;
  const restored = await runDormantV2CallbackRestore({
    rawIntent: JSON.stringify(callbackIntent),
    hasLineIdentity: true,
    featureEnabled: true,
    guard: createLineCallbackRestoreGuard(),
    retrieveServerHandoff: async () => { order.push('handoff_read'); return { ok: true, snapshot: handoffPayload.designSnapshot }; },
    finalizeServerHandoff: async () => { order.push('handoff_consume'); return true; },
    restoreLocalSnapshot: async () => { throw new Error('new iPhone context has no local snapshot'); },
    applyCanonicalDesign: async (value) => { order.push('design_apply'); restoredDesign = value; },
    now: NOW + 1
  });

  assert.equal(restored.ok, true);
  assert.deepEqual(order, ['handoff_read', 'design_apply', 'handoff_consume']);
  assert.equal(freshResetAttempts, 0);
  assert.equal(restoredDesign.design.beadSize, 'mixed');
  assert.equal(restoredDesign.design.mixedPlacingSize, 10);
  assert.deepEqual(restoredDesign.design.components.filter((item) => item.type === 'stone').map((item) => item.size), [4, 10, 6]);

  const appSource = await (await import('node:fs/promises')).readFile(new URL('../app.js', import.meta.url), 'utf8');
  const restoreStart = appSource.indexOf('async function restoreDeferredLineCallbackBeforeReset');
  const restore = appSource.slice(restoreStart, appSource.indexOf('function persistLandingDismissed', restoreStart));
  assert.ok(restore.indexOf('runDormantV2CallbackRestore') < restore.indexOf('await canEnterOperationalStep4'));
  assert.ok(restore.indexOf('runDormantV2CallbackRestore') < restore.indexOf('clearLineCallbackResumeParams'));
  assert.ok(restore.indexOf('runDormantV2CallbackRestore') < restore.indexOf('await canEnterOperationalStep4'));
});

test('an apply interruption leaves the server handoff recoverable for an iOS callback retry', async () => {
  const snapshot = createGuestDesignSnapshot(mixedState, { now: NOW });
  const rawIntent = createCallbackIntent();
  let acknowledgements = 0;
  await assert.rejects(runDormantV2CallbackRestore({
    rawIntent,
    hasLineIdentity: true,
    featureEnabled: true,
    guard: createLineCallbackRestoreGuard(),
    retrieveServerHandoff: async () => ({ ok: true, snapshot }),
    finalizeServerHandoff: async () => { acknowledgements += 1; return true; },
    applyCanonicalDesign: async () => { throw new Error('temporary apply failure'); },
    now: NOW + 1
  }));
  assert.equal(acknowledgements, 0);

  const retry = await runDormantV2CallbackRestore({
    rawIntent,
    hasLineIdentity: true,
    featureEnabled: true,
    guard: createLineCallbackRestoreGuard(),
    retrieveServerHandoff: async () => ({ ok: true, snapshot }),
    finalizeServerHandoff: async () => { acknowledgements += 1; return true; },
    applyCanonicalDesign: async () => {},
    now: NOW + 2
  });
  assert.equal(retry.ok, true);
  assert.equal(acknowledgements, 1);
});

test('true fresh visits and invalid callback tokens cannot restore or authorize Step 4', async () => {
  assert.equal(planLineCallbackBootstrap({ rawIntent: null, hasLineIdentity: false, featureEnabled: true, now: NOW }).kind, 'normal');
  const rawIntent = createCallbackIntent();
  const restored = await runDormantV2CallbackRestore({
    rawIntent,
    hasLineIdentity: true,
    featureEnabled: true,
    guard: createLineCallbackRestoreGuard(),
    retrieveServerHandoff: async () => ({ ok: false, reason: 'not_found' }),
    restoreLocalSnapshot: async () => { throw new Error('invalid server callback must not restore local data'); },
    now: NOW + 1
  });
  assert.deepEqual(restored, { ok: false, reason: 'handoff_not_found' });
});

test('production startup recognizes the URL handoff before fresh reset and retains auth gates', async () => {
  const [appSource, serverSource] = await Promise.all([
    readFile(new URL('../app.js', import.meta.url), 'utf8'),
    readFile(new URL('../server.js', import.meta.url), 'utf8')
  ]);
  assert.ok(appSource.indexOf('const startupRawCustomizationIntent = getStartupCustomizationLoginIntent();') < appSource.indexOf('resetCustomizationSessionForFreshEntry();'));
  assert.match(appSource, /liff\.login\(\{ redirectUri: getLiffRedirectUri\(\{ resumeIntent \}\) \}\)/);
  assert.match(appSource, /startLineLogin: startDeferredLineLoginWithPersistedIntent/);
  const restoreStart = appSource.indexOf('async function restoreDeferredLineCallbackBeforeReset');
  const restoreEnd = appSource.indexOf('function persistLandingDismissed', restoreStart);
  const restore = appSource.slice(restoreStart, restoreEnd);
  assert.ok(restore.indexOf('runDormantV2CallbackRestore') < restore.indexOf('await canEnterOperationalStep4'));
  assert.match(restore, /retrieveServerHandoff: readDeferredLineAuthHandoff/);
  assert.match(restore, /finalizeServerHandoff: consumeDeferredLineAuthHandoff/);
  assert.match(serverSource, /async function readLineAuthHandoff/);
  assert.match(serverSource, /async function consumeLineAuthHandoff/);
  assert.ok(serverSource.indexOf("if (readHandoffMatch && method === 'GET')") < serverSource.indexOf("if (consumeHandoffMatch && method === 'POST')"));
});
