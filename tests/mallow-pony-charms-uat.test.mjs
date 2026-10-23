import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { SPACER_CATALOG } from '../data.js';

const MALLOW_THAI = '\u0E2D\u0E31\u0E0D\u0E21\u0E13\u0E35\u0E41\u0E2B\u0E48\u0E07\u0E40\u0E2A\u0E19\u0E48\u0E2B\u0E4C';
const PONY_THAI = '\u0E21\u0E49\u0E32\u0E41\u0E2B\u0E48\u0E07\u0E1D\u0E31\u0E19';
const appSource = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const charms = JSON.parse(fs.readFileSync(new URL('../data/charms.json', import.meta.url), 'utf8'));

const getSpacer = (id) => {
  const spacer = SPACER_CATALOG.find((record) => record.id === id);
  assert.ok(spacer, `missing spacer ${id}`);
  return spacer;
};

test('Mallow and Pony are exact owner-approved Charm spacer records', () => {
  const mallow = getSpacer('mallow');
  const pony = getSpacer('pony');

  assert.strictEqual(mallow.name.th, MALLOW_THAI);
  assert.strictEqual(pony.name.th, PONY_THAI);
  assert.strictEqual(mallow.name.en, 'Mallow');
  assert.strictEqual(pony.name.en, 'Pony');
  assert.strictEqual(mallow.sku, 'SP-MALLOW');
  assert.strictEqual(pony.sku, 'SP-PONY');
  assert.strictEqual(mallow.entityType, 'spacer');
  assert.strictEqual(pony.entityType, 'spacer');
  assert.strictEqual(mallow.categoryId, 'spacer');
  assert.strictEqual(pony.categoryId, 'spacer');
  assert.strictEqual(mallow.pricing.base, 150);
  assert.strictEqual(pony.pricing.base, 150);
  assert.strictEqual(mallow.stockQty, 50);
  assert.strictEqual(pony.stockQty, 50);
  assert.deepStrictEqual(mallow.business, {
    sizeMm: 33.5, displaySizeMm: 33.5, effectiveLengthMm: 4.2, renderSizeMm: 33.5,
    renderWidthMm: 17, renderHeightMm: 33.5, attachmentLoopMm: 4.2, thicknessMm: 0
  });
  assert.deepStrictEqual(pony.business, {
    sizeMm: 30, displaySizeMm: 30, effectiveLengthMm: 4.2, renderSizeMm: 30,
    renderWidthMm: 21, renderHeightMm: 30, attachmentLoopMm: 4.2, thicknessMm: 0
  });
});

test('Mallow and Pony runtime assets are transparent WebP files', async () => {
  for (const [id, path] of [
    ['mallow', '../assets/spacers/Mallow.webp'],
    ['pony', '../assets/spacers/Pony.webp']
  ]) {
    const asset = new URL(path, import.meta.url);
    const metadata = await sharp(fileURLToPath(asset)).metadata();
    assert.ok(fs.statSync(asset).size > 0, `${id} asset is empty`);
    assert.strictEqual(metadata.format, 'webp');
    assert.strictEqual(metadata.hasAlpha, true);
    assert.strictEqual(metadata.width, 3375);
    assert.strictEqual(metadata.height, 4219);
  }
});

test('only data-driven hanging spacers use the existing charm-like preview path', () => {
  assert.match(appSource, /function isHangingSpacerComponent\(component\)/);
  assert.match(appSource, /component\.type === 'charm' \|\| isHangingSpacerComponent\(component\)/);
  assert.match(appSource, /presentation: spacer\.presentation \|\| 'inline'/);
  assert.match(appSource, /attachmentLoopMm: spacer\.attachmentLoopMm \|\| null/);
});

test('Lucky Clover stays an unchanged Talismans charm, not a spacer', () => {
  const cl01 = charms.find((record) => record.id === 'cl01');
  assert.ok(cl01);
  assert.strictEqual(cl01.entityType, 'charm');
  assert.strictEqual(cl01.type, 'bee_heart');
  assert.strictEqual(cl01.categoryId, 'clover');
  assert.strictEqual(SPACER_CATALOG.some((record) => record.id === 'cl01'), false);
});
