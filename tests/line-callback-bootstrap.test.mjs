import assert from 'node:assert/strict';
import test from 'node:test';
import { createLineCallbackRestoreGuard, planLineCallbackBootstrap, runDormantV2CallbackRestore } from '../line-callback-bootstrap.js';
import { getBerylVisualImage } from '../beryl-visuals.js';

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

test('V2 recovery safely falls back to local or no-op without identity', async () => {
  const waiting = await runDormantV2CallbackRestore({ rawIntent: v2, hasLineIdentity: false, now });
  assert.equal(waiting.reason, 'v2-wait-for-identity');
  const local = await runDormantV2CallbackRestore({ rawIntent: v2, hasLineIdentity: true, guard: createLineCallbackRestoreGuard(), now, consumeServerHandoff: async () => null, restoreLocalSnapshot: async () => ({ ok: true, snapshot }) });
  assert.equal(local.source, 'local');
});
