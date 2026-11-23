import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GUEST_DESIGN_SNAPSHOT_STORAGE_KEY,
  GUEST_DESIGN_SNAPSHOT_TTL_MS,
  createGuestDesignSnapshot,
  parseGuestDesignSnapshot,
  restoreGuestDesignSnapshot,
  saveGuestDesignSnapshot
} from '../guest-design-state.js';
import { getBerylVisualImage } from '../beryl-visuals.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}

const NOW = 1_760_000_000_000;
const catalog = {
  stones: ['clear-quartz', 'beryl', 'amethyst'],
  charms: ['gold-anchor', 'bee-heart'],
  spacers: ['silver-spacer'],
  slotPlaceableCharms: ['bee-heart']
};

function restore(state, options = {}) {
  const storage = new MemoryStorage();
  const saved = saveGuestDesignSnapshot(state, { storage, now: NOW });
  assert.equal(saved.ok, true);
  return restoreGuestDesignSnapshot({ storage, now: NOW + 1, catalog, ...options });
}

test('guest design snapshot round-trips a simple canonical design without pricing or PII', () => {
  const result = restore({
    currentStep: 3, wristSize: 16, beadSize: '6', selectedCharmIds: [],
    selectedStones: [
      { componentType: 'stone', stoneId: 'clear-quartz', size: 6, uniqueId: 41 },
      { componentType: 'stone', stoneId: 'amethyst', size: 6, uniqueId: 42 }
    ],
    lineUserId: 'must-not-persist', ownerName: 'must-not-persist', shippingInfo: { phoneNumber: 'must-not-persist' }, total: 999
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.snapshot.design, {
    wristSize: 16, beadSize: '6', mixedPlacingSize: 6, selectedCharmIds: [],
    components: [{ type: 'stone', id: 'clear-quartz', size: 6 }, { type: 'stone', id: 'amethyst', size: 6 }]
  });
  assert.equal(JSON.stringify(result.snapshot).includes('must-not-persist'), false);
  assert.equal(Object.hasOwn(result.snapshot.design, 'total'), false);
});

test('guest design snapshot preserves complex component order and anchored charms', () => {
  const result = restore({
    currentStep: 3, wristSize: 18.5, beadSize: '10', selectedCharmIds: ['gold-anchor'],
    selectedStones: [
      { componentType: 'stone', stoneId: 'beryl', uniqueId: 1 },
      { componentType: 'spacer', spacerId: 'silver-spacer', uniqueId: 2 },
      { componentType: 'charm', charmId: 'bee-heart', uniqueId: 3 },
      null,
      { componentType: 'stone', stoneId: 'beryl', uniqueId: 4 },
      { componentType: 'stone', stoneId: 'amethyst', uniqueId: 5 }
    ]
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.snapshot.design.components, [
    { type: 'stone', id: 'beryl', size: 10 }, { type: 'spacer', id: 'silver-spacer' },
    { type: 'charm', id: 'bee-heart' }, { type: 'empty' },
    { type: 'stone', id: 'beryl', size: 10 }, { type: 'stone', id: 'amethyst', size: 10 }
  ]);
  assert.deepEqual(result.snapshot.design.selectedCharmIds, ['gold-anchor']);
});

test('Beryl occurrence order remains deterministic from restored normal stone identities', () => {
  const result = restore({
    currentStep: 3, wristSize: 16, beadSize: '6', selectedCharmIds: [],
    selectedStones: Array.from({ length: 4 }, () => ({ componentType: 'stone', stoneId: 'beryl' }))
  });
  assert.equal(result.ok, true);
  const berylCount = result.snapshot.design.components.filter((item) => item.type === 'stone' && item.id === 'beryl').length;
  assert.deepEqual(Array.from({ length: berylCount }, (_, index) => getBerylVisualImage(index)), [
    'assets/Beryl.webp', 'assets/Beryl pink.webp', 'assets/Beryl blue.webp', 'assets/Beryl.webp'
  ]);
});

test('corrupt, expired, unsupported, unknown, and unavailable-storage snapshots fail safely', () => {
  const storage = new MemoryStorage();
  storage.setItem(GUEST_DESIGN_SNAPSHOT_STORAGE_KEY, '{bad json');
  assert.deepEqual(restoreGuestDesignSnapshot({ storage, now: NOW, catalog }), { ok: false, reason: 'malformed' });

  const expired = createGuestDesignSnapshot({ currentStep: 3, wristSize: 16, beadSize: '6', selectedStones: [] }, { now: NOW, ttlMs: 1 });
  storage.setItem(GUEST_DESIGN_SNAPSHOT_STORAGE_KEY, JSON.stringify(expired));
  assert.deepEqual(restoreGuestDesignSnapshot({ storage, now: NOW + 1, catalog }), { ok: false, reason: 'expired' });

  storage.setItem(GUEST_DESIGN_SNAPSHOT_STORAGE_KEY, JSON.stringify({ version: 999 }));
  assert.deepEqual(restoreGuestDesignSnapshot({ storage, now: NOW, catalog }), { ok: false, reason: 'unsupported_version' });

  const unknown = restore({
    currentStep: 3, wristSize: 16, beadSize: '6', selectedCharmIds: ['missing-charm'],
    selectedStones: [{ componentType: 'stone', stoneId: 'missing-stone' }, { componentType: 'stone', stoneId: 'beryl' }]
  });
  assert.equal(unknown.ok, true);
  assert.deepEqual(unknown.snapshot.design.components, [{ type: 'stone', id: 'beryl', size: 6 }]);
  assert.deepEqual(unknown.snapshot.design.selectedCharmIds, []);
  assert.equal(unknown.skipped.length, 2);

  const brokenStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(saveGuestDesignSnapshot({ currentStep: 3, wristSize: 16, beadSize: '6', selectedStones: [] }, { storage: brokenStorage, now: NOW }), { ok: false, reason: 'storage_unavailable' });
  assert.deepEqual(restoreGuestDesignSnapshot({ storage: brokenStorage, now: NOW, catalog }), { ok: false, reason: 'storage_unavailable' });
});

test('snapshot TTL is two hours and representative complex payload stays lightweight', () => {
  assert.equal(GUEST_DESIGN_SNAPSHOT_TTL_MS, 2 * 60 * 60 * 1000);
  const snapshot = createGuestDesignSnapshot({
    currentStep: 3, wristSize: 18, beadSize: '10', selectedCharmIds: ['gold-anchor'],
    selectedStones: Array.from({ length: 30 }, (_, index) => (
      index % 5 === 0 ? { componentType: 'spacer', spacerId: 'silver-spacer' }
        : { componentType: 'stone', stoneId: index % 3 === 0 ? 'beryl' : 'amethyst' }
    ))
  }, { now: NOW });
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot)).length;
  assert.ok(bytes < 4096, `expected representative snapshot < 4 KiB, got ${bytes}`);
  assert.equal(parseGuestDesignSnapshot(JSON.stringify(snapshot), { now: NOW + 1 }).ok, true);
});
