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

test('guest design serialization preserves each pearl variant and the insertion cursor', () => {
  const selectedStones = [0, 1, 2, 0, 1, 2].map((visualVariantIndex, index) => ({
    componentType: 'stone',
    stoneId: 'phase27-freshwater-pearl',
    size: 10,
    visualVariantIndex,
    uniqueId: index + 1
  }));
  const snapshot = createGuestDesignSnapshot({
    currentStep: 3,
    wristSize: 16,
    beadSize: '10',
    mixedPlacingSize: 10,
    selectedCharmIds: [],
    selectedStones,
    pearlVariantCursor: 0
  });
  const serialized = serializeGuestDesignSnapshot(snapshot);
  const parsed = parseGuestDesignSnapshot(serialized, { now: snapshot.savedAt });
  assert.equal(parsed.ok, true);
  const reconciled = reconcileGuestDesignSnapshot(parsed.snapshot, {
    stones: new Set(['phase27-freshwater-pearl']),
    charms: new Set(),
    spacers: new Set(),
    slotPlaceableCharms: new Set()
  });
  assert.equal(reconciled.ok, true);
  assert.deepEqual(
    reconciled.snapshot.design.components.map((component) => component.variant),
    [0, 1, 2, 0, 1, 2]
  );
  assert.equal(reconciled.snapshot.design.pearlVariantCursor, 0);
});

test('server order validation ignores renderer-only pearl variant metadata', () => {
  const pearl = {
    id: 'phase27-freshwater-pearl',
    sizes: [10],
    p10: 75,
    selectionGroupMm: 10,
    nominalProductSizeMm: 12,
    braceletPackingMm: 12,
    availability: { isActive: true, inStock: true },
    pricing: { base: 75 }
  };
  const sequence = Array.from({ length: 14 }, (_, index) => ({
    type: 'stone',
    stoneId: 'phase27-freshwater-pearl',
    size: 10,
    visualVariantIndex: index % 3
  }));
  sequence.push({
    type: 'spacer',
    spacerId: 'test-2mm-spacer'
  });
  const spacer = {
    id: 'test-2mm-spacer',
    pricing: { base: 1 },
    packingLengthMm: 2,
    availability: { isActive: true, inStock: true }
  };
  const result = validateAuthoritativeOrder({
    clientOrder: {
      wristSize: 16,
      beadSize: 'mixed',
      braceletSequence: sequence
    },
    catalogs: {
      stone: new Map([[pearl.id, pearl]]),
      charm: new Map(),
      spacer: new Map([[spacer.id, spacer]])
    },
    settings: { discountEnabled: true, globalDiscountPercent: 20 }
  });
  assert.equal(result.geometry.usedLengthMm, 170);
  assert.equal(result.stoneVariants.length, 1);
  assert.equal(result.stoneVariants[0].quantity, 14);
  assert.equal(result.stoneVariants[0].selectionGroupMm, 10);
  assert.equal(result.stoneVariants[0].nominalProductSizeMm, 12);
  assert.equal(result.stoneVariants[0].braceletPackingMm, 12);
});

test('pendants use a presentation-only split while retaining charm order handling', () => {
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const crmHtml = fs.readFileSync(path.join(root, 'crm.html'), 'utf8');
  const crmJs = fs.readFileSync(path.join(root, 'crm.js'), 'utf8');
  assert.match(app, /const SPACER_TAB_CHARM_IDS = new Set\(\[[\s\S]*phase27-gold-star-pendant[\s\S]*phase27-gold-heart-pendant/);
  assert.match(app, /getVisibleCharmCatalog\(\)\.filter\(\(charm\) => !SPACER_TAB_CHARM_IDS\.has\(charm\.id\)\)/);
  assert.match(app, /getVisibleCharmCatalog\(\)\.filter\(\(charm\) => SPACER_TAB_CHARM_IDS\.has\(charm\.id\)\)/);
  assert.match(app, /getPendantCardThumbnailStyle[\s\S]*'--charm-thumb-scale': '0\.75'/);
  assert.match(crmHtml, /<div class="form-group" hidden>[\s\S]*crudCharmDisplayOrder/);
  assert.doesNotMatch(crmJs, /class="charm-inline-input charm-order-input"/);
  assert.match(crmJs, /displayOrder: Number\(DOM\.crudCharmDisplayOrder\.value \|\| 0\)/);
  assert.match(crmJs, /displayOrder: patch\.displayOrder !== undefined \? patch\.displayOrder : \(charm\.displayOrder \?\? 0\)/);
  assert.match(crmJs, /sortMode === 'displayOrder-desc'/);
  assert.match(crmJs, /\(a\.displayOrder \|\| 0\) - \(b\.displayOrder \|\| 0\)/);
});

