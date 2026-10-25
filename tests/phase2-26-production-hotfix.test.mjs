import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  createGuestDesignSnapshot,
  parseGuestDesignSnapshot,
  reconcileGuestDesignSnapshot,
  serializeGuestDesignSnapshot
} from '../guest-design-state.js';
import {
  validateAuthoritativeOrder
} from '../../../reports/production/phase2-24b-release-preparation/backend-candidate/server-order-validation.js';

const root = path.resolve(import.meta.dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

test('guest design state accepts unlimited approved pendants while retaining two legacy anchors', () => {
  const selectedCharmIds = [
    'phase27-gold-heart-pendant',
    'phase27-gold-star-pendant',
    'phase27-gold-heart-pendant',
    'phase27-gold-star-pendant',
    'phase27-gold-heart-pendant'
  ];
  const snapshot = createGuestDesignSnapshot({
    currentStep: 3,
    wristSize: 16,
    beadSize: '10',
    mixedPlacingSize: 10,
    selectedCharmIds,
    approvedPendantAnchors: {
      'phase27-gold-heart-pendant': [1, 2, 3],
      'phase27-gold-star-pendant': [1, 2]
    },
    selectedStones: []
  });
  assert.ok(snapshot);
  const serialized = serializeGuestDesignSnapshot(snapshot);
  const parsed = parseGuestDesignSnapshot(serialized, { now: snapshot.savedAt });
  assert.equal(parsed.ok, true);
  const reconciled = reconcileGuestDesignSnapshot(parsed.snapshot, {
    stones: new Set(),
    charms: new Set([
      'phase27-gold-heart-pendant',
      'phase27-gold-star-pendant'
    ]),
    spacers: new Set(),
    slotPlaceableCharms: new Set()
  });
  assert.equal(reconciled.ok, true);
  assert.deepEqual(reconciled.snapshot.design.selectedCharmIds, selectedCharmIds);
  assert.deepEqual(reconciled.snapshot.design.approvedPendantAnchors, {
    'phase27-gold-heart-pendant': [1, 2, 3],
    'phase27-gold-star-pendant': [1, 2]
  });

  const invalidLegacy = createGuestDesignSnapshot({
    currentStep: 3,
    wristSize: 16,
    beadSize: '10',
    selectedCharmIds: ['legacy-a', 'legacy-b', 'legacy-c'],
    selectedStones: []
  });
  assert.equal(invalidLegacy, null);
});

test('server validation accepts more than two approved threaded pendants', () => {
  const stone = {
    id: 'test-stone',
    sizes: [10],
    p10: 10,
    availability: { isActive: true, inStock: true }
  };
  const star = {
    id: 'phase27-gold-star-pendant',
    type: 'pendant',
    pricing: { base: 120 },
    business: { threadingOccupancyMm: 2 },
    availability: { isActive: true, inStock: true }
  };
  const heart = {
    id: 'phase27-gold-heart-pendant',
    type: 'pendant',
    pricing: { base: 160 },
    business: { threadingOccupancyMm: 4 },
    availability: { isActive: true, inStock: true }
  };
  const sequence = [
    ...Array.from({ length: 14 }, () => ({ type: 'stone', stoneId: stone.id, size: 10 })),
    ...Array.from({ length: 5 }, () => ({ type: 'heart', id: heart.id })),
    ...Array.from({ length: 5 }, () => ({ type: 'star', id: star.id }))
  ].map((component) => {
    if (component.type === 'heart') return { type: 'charm', charmId: heart.id };
    if (component.type === 'star') return { type: 'charm', charmId: star.id };
    return component;
  });
  const result = validateAuthoritativeOrder({
    clientOrder: { wristSize: 16, beadSize: 'mixed', braceletSequence: sequence },
    catalogs: {
      stone: new Map([[stone.id, stone]]),
      charm: new Map([[star.id, star], [heart.id, heart]]),
      spacer: new Map()
    },
    settings: { discountEnabled: true, globalDiscountPercent: 20 }
  });
  assert.equal(result.itemizedBilling.filter((item) => item.type === 'charm').length, 10);
  assert.equal(result.geometry.usedLengthMm, 140 + (5 * 4) + (5 * 2));
});

test('unlimited limit is scoped to the two approved pendant IDs', () => {
  assert.match(app, /const APPROVED_PENDANT_VISUAL_FRAME_WIDTH_MM = Object\.freeze\(\{\s*'phase27-gold-heart-pendant': 7/);
  assert.match(app, /const isUnlimitedAnchoredPendant = isApprovedThreadedPendantId\(nextCharmId\)/);
  assert.match(app, /currentLegacyAnchoredCount = currentCharmIds\.filter/);
  assert.match(app, /State\.selectedCharmIds = \[\.\.\.currentCharmIds, nextCharmId\]/);
  assert.doesNotMatch(
    app.slice(app.indexOf('function normalizeSelectedCharmIds'), app.indexOf('function normalizeApprovedPendantAnchorList')),
    /\.slice\(0,\s*2\)/
  );
});

test('Step 3 pendant cards share one grid and Step 4 normalizes flat spacer artwork', () => {
  assert.match(app, /grid\.appendChild\(card\)/);
  assert.doesNotMatch(app, /pendantGrid\.appendChild\(card\)/);
  assert.doesNotMatch(app, /section\.append\(grid, pendantGrid\)/);
  assert.match(
    app,
    /const explicitBounds = Array\.isArray\(component\.visualBounds\) && component\.visualBounds\.length > 0\s*\? component\.visualBounds\[0\]\s*: \(imgObj \? getVisibleImageBounds\(imgObj, imgUrl\) : null\);/
  );
});
