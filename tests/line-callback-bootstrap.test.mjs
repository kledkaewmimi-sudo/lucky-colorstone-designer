import assert from 'node:assert/strict';
import test from 'node:test';
import { createLineCallbackRestoreGuard, planLineCallbackBootstrap, runDormantV2CallbackRestore } from '../line-callback-bootstrap.js';
import { getBerylVisualImage } from '../beryl-visuals.js';
import { readFile } from 'node:fs/promises';

const now = 1_760_000_000_000;
const token = 'a'.repeat(43);
const legacy = JSON.stringify({ ts: now, step: 1 });
const v2 = JSON.stringify({ version: 2, ts: now, step: 3, targetStep: 4, handoffToken: token, mode: 'guest_design_handoff' });
const snapshot = { version: 1, design: { components: [{ type: 'stone', id: 'beryl' }, { type: 'stone', id: 'beryl' }, { type: 'stone', id: 'beryl' }, { type: 'stone', id: 'beryl' }] } };

test('legacy and normal startup plans remain unchanged while the production flag is off', () => {
  assert.equal(planLineCallbackBootstrap({ rawIntent: null, now }).kind, 'normal');
  assert.equal(planLineCallbackBootstrap({ rawIntent: legacy, now }).kind, 'legacy');
  assert.equal(planLineCallbackBootstrap({ rawIntent: v2, hasLineIdentity: true, now }).kind, 'legacy-safe-fallback');
});

test('dormant V2 path wins before reset and restores exactly once', async () => {
  const guard = createLineCallbackRestoreGuard();
  const applied = [];
  const first = await runDormantV2CallbackRestore({ rawIntent: v2, hasLineIdentity: true, guard, now, consumeServerHandoff: async () => ({ ok: true, snapshot }), applyCanonicalDesign: async (value) => applied.push(value) });
  assert.equal(first.ok, true);
  assert.equal(applied.length, 1);
  const refresh = await runDormantV2CallbackRestore({ rawIntent: v2, hasLineIdentity: true, guard, now, consumeServerHandoff: async () => ({ ok: true, snapshot }), applyCanonicalDesign: async () => applied.push('duplicate') });
  assert.equal(refresh.reason, 'v2-already-restored');
  assert.equal(applied.length, 1);
  assert.deepEqual(Array.from({ length: 4 }, (_, index) => getBerylVisualImage(index)), ['assets/Beryl.webp', 'assets/Beryl pink.webp', 'assets/Beryl blue.webp', 'assets/Beryl.webp']);
});

test('enabled V2 callback consumes the server handoff once and resumes the allowlisted Step 4 target', async () => {
  const guard = createLineCallbackRestoreGuard();
  const applied = [];
  let consumes = 0;
  const first = await runDormantV2CallbackRestore({
    rawIntent: v2,
    hasLineIdentity: true,
    featureEnabled: true,
    guard,
    consumeServerHandoff: async () => {
      consumes += 1;
      return { ok: true, snapshot };
    },
    restoreLocalSnapshot: async () => ({ ok: true, snapshot: { version: 1, design: { components: [] } } }),
    applyCanonicalDesign: async (value, options) => applied.push({ value, options }),
    now
  });
  assert.equal(first.ok, true);
  assert.equal(first.source, 'server');
  assert.equal(first.targetStep, 4);
  assert.equal(consumes, 1);
  assert.equal(applied.length, 1);
  assert.equal(applied[0].options.targetStep, 4);

  const refresh = await runDormantV2CallbackRestore({
    rawIntent: v2,
    hasLineIdentity: true,
    featureEnabled: true,
    guard,
    consumeServerHandoff: async () => {
      consumes += 1;
      return { ok: true, snapshot };
    },
    now
  });
  assert.equal(refresh.reason, 'v2-already-restored');
  assert.equal(consumes, 1);
  assert.equal(applied.length, 1);
});

test('V2 recovery safely falls back to local or no-op without identity', async () => {
  const waiting = await runDormantV2CallbackRestore({ rawIntent: v2, hasLineIdentity: false, now });
  assert.equal(waiting.reason, 'v2-wait-for-identity');
  const local = await runDormantV2CallbackRestore({ rawIntent: v2, hasLineIdentity: true, guard: createLineCallbackRestoreGuard(), now, consumeServerHandoff: async () => null, restoreLocalSnapshot: async () => ({ ok: true, snapshot }) });
  assert.equal(local.source, 'local');
});

test('enabled V2 callback waits for LINE identity and falls back to local snapshot on unavailable server handoff', async () => {
  const waiting = await runDormantV2CallbackRestore({ rawIntent: v2, hasLineIdentity: false, featureEnabled: true, now });
  assert.equal(waiting.reason, 'v2-wait-for-identity');
  const local = await runDormantV2CallbackRestore({
    rawIntent: v2,
    hasLineIdentity: true,
    featureEnabled: true,
    guard: createLineCallbackRestoreGuard(),
    consumeServerHandoff: async () => null,
    restoreLocalSnapshot: async () => ({ ok: true, snapshot }),
    now
  });
  assert.equal(local.ok, true);
  assert.equal(local.source, 'local');
});

test('app startup classifies the callback before the legacy destructive resume branch', async () => {
  const appSource = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.ok(appSource.indexOf('planLineCallbackBootstrap') < appSource.indexOf("resetStep3DesignState('customization-login-resume')"));
  assert.match(appSource, /startupCallbackPlan\.kind === 'legacy'/);
  assert.ok(appSource.indexOf('shouldHoldForDeferredCallback') < appSource.indexOf("resetStep3DesignState('normal-startup'"));
  const callbackInvocation = appSource.lastIndexOf('restoreDeferredLineCallbackBeforeReset(startupRawCustomizationIntent)');
  assert.ok(appSource.indexOf('await initLIFF()') < callbackInvocation);
  assert.ok(callbackInvocation < appSource.indexOf('restoreCustomizationIntentAfterLogin()'));
});
