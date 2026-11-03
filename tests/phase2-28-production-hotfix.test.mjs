import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  PRODUCT_CARD_BADGES,
  getProductCardBadge
} from '../product-card-badges.js';
import {
  LANDING_BRACELET_COUNT_FALLBACK,
  normalizeLandingBraceletCount
} from '../data.js';

const root = path.resolve(import.meta.dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const crm = fs.readFileSync(path.join(root, 'crm.js'), 'utf8');
const crmHtml = fs.readFileSync(path.join(root, 'crm.html'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const settings = JSON.parse(fs.readFileSync(path.join(root, 'data', 'settings.json'), 'utf8'));

test('Pearl uses the exact new badge and Horse/Mushroom badges are removed', () => {
  const badge = getProductCardBadge('stones', 'phase27-freshwater-pearl', 10);
  assert.equal(badge?.label, '\u0E43\u0E2B\u0E21\u0E48');
  assert.deepEqual(Array.from(badge.label).map((character) => character.codePointAt(0)), [0x0E43, 0x0E2B, 0x0E21, 0x0E48]);
  assert.equal(getProductCardBadge('spacers', 'pony'), null);
  assert.equal(getProductCardBadge('spacers', 'mallow'), null);
  assert.equal(getProductCardBadge('stones', 'kyanite', 10)?.label, '\u0E43\u0E2B\u0E21\u0E48');
  assert.equal(getProductCardBadge('charms', 'cl01')?.label, '\u0E43\u0E2B\u0E21\u0E48');
  assert.ok(PRODUCT_CARD_BADGES.stones['phase27-freshwater-pearl:10']);
});

test('Landing bracelet count accepts only nonnegative integers', () => {
  assert.equal(normalizeLandingBraceletCount(1035), 1035);
  assert.equal(normalizeLandingBraceletCount(0), 0);
  assert.equal(normalizeLandingBraceletCount('42'), 42);
  for (const invalid of [-1, 1.5, '', null, 'abc', Number.NaN]) {
    assert.equal(normalizeLandingBraceletCount(invalid), null);
  }
  assert.equal(LANDING_BRACELET_COUNT_FALLBACK, 1350);
  assert.equal(settings.landingBraceletCount, 1350);
});

test('Landing count uses settings rather than social-proof sales data', () => {
  assert.match(app, /fetch\('\/api\/settings'/);
  assert.match(app, /normalizeLandingBraceletCount\(settings\?\.landingBraceletCount\)/);
  assert.doesNotMatch(app, /payload\?\.displayCount/);
  assert.match(indexHtml, /id="landingSocialProofCount">1,350/);
  assert.match(indexHtml, /กำไลที่ Lucky คัดสรร/);
});

test('CRM setting is integer-validated, authenticated, and confirms persistence', () => {
  assert.match(crmHtml, /id="landingBraceletCount" min="0" step="1" required/);
  assert.match(crmHtml, /จำนวนกำไลที่แสดงบนหน้า Landing Page/);
  assert.match(crm, /Landing Page Bracelet Count must be a nonnegative integer/);
  assert.match(crm, /normalizeLandingBraceletCount\(saved\.landingBraceletCount\) !== landingBraceletCount/);
  assert.match(crmHtml, /id="crudCharmDisplayOrder" min="0" step="1"/);
});
