import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  BUILTIN_BANNER_PRESETS,
  PRODUCT_CARD_BADGES,
  getBadgeAssignmentKey,
  getProductCardBadge,
  normalizeBadgeAssignments,
  normalizeCustomBannerPresets
} from '../product-card-badges.js';

const root = path.resolve(import.meta.dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const crm = fs.readFileSync(path.join(root, 'crm.js'), 'utf8');
const crmHtml = fs.readFileSync(path.join(root, 'crm.html'), 'utf8');
const indexCss = fs.readFileSync(path.join(root, 'index.css'), 'utf8');

test('Layout uses the Inventory presentation category for spacer-presented pendants', () => {
  assert.match(crm, /function getLayoutPresentationType\(item\)/);
  assert.match(crm, /filter\(\(item\) => getLayoutPresentationType\(item\) === itemType\)/);
  assert.match(crm, /getCatalogLayoutOrder\(\)/);
  assert.match(crm, /saveSharedCatalogLayoutOrder\(getCatalogLayoutDraft\(\)\)/);
  assert.match(app, /const visibleSpacerPresentationItems = applyCatalogLayoutOrder\(\[/);
  assert.match(app, /\.\.\.visibleSpacers\.map\(\(item\) => \(\{ kind: 'spacer', item \}\)\)/);
  assert.match(app, /\.\.\.visiblePendants\.map\(\(item\) => \(\{ kind: 'charm', item \}\)\)/);
  assert.match(app, /\], 'spacers', \(entry\) => entry\.item\.id\);/);
  assert.doesNotMatch(app, /visibleSpacers\.forEach\(/);
  assert.doesNotMatch(app, /visiblePendants\.forEach\(/);
});

test('Only the two approved pendants change Layout category', () => {
  const overrideBlock = crm.match(/const CRM_SPACER_PRESENTED_CHARM_IDS = new Set\(\[([\s\S]*?)\]\);/)?.[1] || '';
  const overrideIds = Array.from(overrideBlock.matchAll(/'([^']+)'/g), (match) => match[1]).sort();
  assert.deepEqual(overrideIds, [
    'phase27-gold-heart-pendant',
    'phase27-gold-star-pendant'
  ]);
  assert.match(crm, /return item\?\.inventoryType === 'spacer' \? 'spacer' : item\?\.type;/);
  assert.match(app, /const SPACER_TAB_CHARM_IDS = new Set\(\[[\s\S]*?'phase27-gold-star-pendant',[\s\S]*?'phase27-gold-heart-pendant'[\s\S]*?\]\);/);
});

test('Built-in banner presets preserve the existing labels and exact Thai text', () => {
  assert.deepEqual(
    Array.from(BUILTIN_BANNER_PRESETS.new.label).map((character) => character.codePointAt(0)),
    [0x0E43, 0x0E2B, 0x0E21, 0x0E48]
  );
  assert.equal(BUILTIN_BANNER_PRESETS.bestseller.label, '\u0E02\u0E32\u0E22\u0E14\u0E35\u2728');
  assert.equal(BUILTIN_BANNER_PRESETS.bestseller.variant, 'bestseller');
  assert.equal(BUILTIN_BANNER_PRESETS.new.variant, 'new');
});

test('Custom presets and item assignments are normalized without mutable values', () => {
  const presets = normalizeCustomBannerPresets([
    { id: 'custom_limited', label: 'Limited', textColor: '#FFFFFF', backgroundColor: '#112233' },
    { id: 'unsafe', label: 'Ignore', textColor: 'red', backgroundColor: '#112233' }
  ]);
  assert.deepEqual(presets, [{
    id: 'custom_limited',
    label: 'Limited',
    variant: 'custom',
    textColor: '#ffffff',
    backgroundColor: '#112233'
  }]);
  assert.deepEqual(normalizeBadgeAssignments({
    'stones:kyanite': 'new',
    'charms:cl01': 'none',
    invalid: 'new'
  }), {
    'stone:kyanite': 'new',
    'charm:cl01': 'none'
  });
});

test('Assignments override legacy badges, including an explicit no-banner choice', () => {
  const settings = {
    catalogBadgePresets: [{ id: 'custom_limited', label: 'Limited', textColor: '#ffffff', backgroundColor: '#112233' }],
    catalogItemBadges: {
      [getBadgeAssignmentKey('stone', 'kyanite')]: 'custom_limited',
      [getBadgeAssignmentKey('charm', 'cl01')]: 'none'
    }
  };
  assert.deepEqual(getProductCardBadge('stones', 'kyanite', 10, settings), {
    label: 'Limited',
    variant: 'custom',
    textColor: '#ffffff',
    backgroundColor: '#112233'
  });
  assert.equal(getProductCardBadge('charms', 'cl01', null, settings), null);
  assert.equal(getProductCardBadge('charms', 'cl01')?.label, '\u0E43\u0E2B\u0E21\u0E48');
});

test('Assigning one item does not change legacy badges on other items', () => {
  const settings = {
    catalogItemBadges: {
      [getBadgeAssignmentKey('stone', 'amethyst')]: 'bestseller'
    }
  };
  for (const [productType, entries] of Object.entries(PRODUCT_CARD_BADGES)) {
    for (const [key, legacy] of Object.entries(entries)) {
      const [productId, sizeText] = key.split(':');
      if (productType === 'stones' && productId === 'amethyst' && Number(sizeText) === 6) continue;
      assert.deepEqual(
        getProductCardBadge(productType, productId, sizeText ? Number(sizeText) : null, settings),
        getProductCardBadge(productType, productId, sizeText ? Number(sizeText) : null)
      );
    }
  }
});

test('CRM exposes preset management and per-item assignment', () => {
  assert.match(crmHtml, /id="badgePresetForm"/);
  assert.match(crmHtml, /id="badgeAssignmentModal"/);
  assert.match(crmHtml, /id="badgeAssignmentSelect"/);
  assert.match(crm, /openBadgeAssignmentModal\(item\.type, item\.id/);
  assert.match(crm, /catalogItemBadges/);
  assert.match(crm, /catalogBadgePresets/);
});

test('Customer cards receive persisted banner settings and apply custom colors safely', () => {
  assert.match(app, /State\.catalogItemBadges = sharedSettings\?\.catalogItemBadges/);
  assert.match(app, /getProductCardBadge\('stones', stone\.id, catalogCurrentSize, State\)/);
  assert.match(app, /badgeElement\.style\.backgroundColor = badge\.backgroundColor/);
  assert.match(app, /badgeElement\.style\.color = badge\.textColor/);
});

test('The shared Customer Step 3 card grid remains four columns on desktop', () => {
  assert.match(indexCss, /\.stone-catalog-grid \{\s*display: grid;\s*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/);
});
