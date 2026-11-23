import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createGuestDesignSnapshot, parseGuestDesignSnapshot, reconcileGuestDesignSnapshot } from '../guest-design-state.js';
import { createLineCallbackRestoreGuard, runDormantV2CallbackRestore } from '../line-callback-bootstrap.js';

const NOW = 1_760_000_000_000;
const token = 'z'.repeat(43);
const rawIntent = JSON.stringify({ version: 2, ts: NOW, step: 3, targetStep: 4, handoffToken: token, mode: 'guest_design_handoff' });
const catalog = { stones: ['amethyst', 'quartz'], charms: ['bee-heart', 'gold-anchor'], spacers: ['silver-spacer'], slotPlaceableCharms: ['bee-heart'] };
const mixedState = {
  currentStep: 3,
  wristSize: 16,
  beadSize: 'mixed',
  mixedPlacingSize: 10,
  selectedCharmIds: ['gold-anchor'],
  selectedStones: [
    { componentType: 'stone', stoneId: 'amethyst', size: 4, uniqueId: 11 },
    { componentType: 'spacer', spacerId: 'silver-spacer', uniqueId: 12 },
    { componentType: 'stone', stoneId: 'quartz', size: 10, uniqueId: 13 },
    { componentType: 'charm', charmId: 'bee-heart', uniqueId: 14 },
    { componentType: 'stone', stoneId: 'amethyst', size: 6, uniqueId: 15 }
  ]
};

test('mixed session snapshot preserves mode, placement size, ordered components, and physical sizes', () => {
  const snapshot = createGuestDesignSnapshot(mixedState, { now: NOW });
  assert.equal(snapshot.design.beadSize, 'mixed');
  assert.equal(snapshot.design.mixedPlacingSize, 10);
  assert.deepEqual(snapshot.design.components.map((component) => [component.type, component.id, component.size ?? null]), [
    ['stone', 'amethyst', 4], ['spacer', 'silver-spacer', null], ['stone', 'quartz', 10], ['charm', 'bee-heart', null], ['stone', 'amethyst', 6]
  ]);
  assert.equal(snapshot.design.components.every((component) => component.uniqueId === undefined), true);
  assert.equal(JSON.stringify(snapshot).includes('resolvedLayout'), false);
  assert.equal(JSON.stringify(snapshot).includes('unitPrice'), false);
});

test('mixed snapshots without an explicit physical stone size fail instead of falling back to 6mm', () => {
  assert.equal(createGuestDesignSnapshot({ ...mixedState, selectedStones: [{ componentType: 'stone', stoneId: 'amethyst', uniqueId: 1 }] }, { now: NOW }), null);
  const malformedMixed = { version: 1, savedAt: NOW, expiresAt: NOW + 1000, step: 3, design: { ...mixedState, components: [{ type: 'stone', id: 'amethyst', size: 'mixed' }] } };
  assert.deepEqual(parseGuestDesignSnapshot(JSON.stringify(malformedMixed), { now: NOW + 1 }), { ok: false, reason: 'invalid' });
});

test('legacy fixed snapshots derive their fixed physical size and remain compatible', () => {
  for (const size of ['4', '6', '10']) {
    const snapshot = { version: 1, savedAt: NOW, expiresAt: NOW + 1000, step: 3, design: { wristSize: 16, beadSize: size, selectedCharmIds: [], components: [{ type: 'stone', id: 'amethyst' }] } };
    const restored = reconcileGuestDesignSnapshot(snapshot, catalog);
    assert.equal(restored.ok, true);
    assert.equal(restored.snapshot.design.components[0].size, Number(size));
  }
});

test('existing LINE callback controller carries the canonical mixed snapshot to the authorized Step 4 resume', async () => {
  const snapshot = createGuestDesignSnapshot(mixedState, { now: NOW });
  const applied = [];
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
  assert.equal(applied[0].value.design.beadSize, 'mixed');
  assert.deepEqual(applied[0].value.design.components.filter((component) => component.type === 'stone').map((component) => component.size), [4, 10, 6]);
});

test('production restore keeps fresh entry reset and canonical derived recalculation contracts', async () => {
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(app, /State\.beadSize = null;/);
  assert.match(app, /if \(State\.beadSize === MIXED_BEAD_SIZE_MODE\) return;/);
  assert.match(app, /mixedPlacingSize: State\.mixedPlacingSize/);
  assert.match(app, /if \(component\.type === 'stone'\) return \{ componentType: 'stone', stoneId: component\.id, size: Number\(component\.size \|\| getCurrentBeadSizeMm\(\)\) \};/);
  assert.match(app, /State\.selectedStones\.forEach\(\(item, index\) => \{ item\.uniqueId = index \+ 1; \}\);/);
  assert.doesNotMatch(app, /resolvedLayout:\s*createCurrentBraceletResolvedLayout/);
  assert.doesNotMatch(app, /trustedPrice/);
});
