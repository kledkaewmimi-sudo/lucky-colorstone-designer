import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const read = (relativePath) => fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
const charms = JSON.parse(read('../data/charms.json'));
const dataSource = read('../data.js');
const appSource = read('../app.js');
const serverSource = read('../server.js');
const cl01 = charms.find((charm) => charm.id === 'cl01');

test('CL01 catalog identity, commercial values, dimensions, and tuning are exact', () => {
  assert.ok(cl01);
  assert.equal(cl01.sku, 'CL01');
  assert.equal(cl01.slug, 'clover-gold');
  assert.equal(cl01.entityType, 'charm');
  assert.equal(cl01.type, 'bee_heart');
  assert.deepEqual(cl01.name, { en: 'Lucky Clover', th: 'ลคก ใบโคลเวอร นำโชค' });
  assert.deepEqual(cl01.meaning, {
    en: 'Symbolizes luck, success, and positive opportunities.',
    th: 'สอถงโชคลาภ ความสำเรจ และโอกาสดทเขามาในชวต'
  });
  assert.equal(cl01.image.primary, '/assets/charms/clover/cl01.webp');
  assert.equal(cl01.pricing.base, 290);
  assert.deepEqual(cl01.business, { sizeCm: 2.65, footprintMm: 4.2 });
  assert.equal(cl01.stockQty, 10);
  assert.equal(cl01.stock_qty, 10);
  assert.equal(cl01.isActive, true);
  assert.equal(cl01.inStock, true);
  assert.deepEqual(cl01.availability, {
    inStock: true, isActive: true, stockQty: 10, stock_qty: 10
  });
  assert.equal(cl01.categoryId, 'clover');
  assert.equal(cl01.collection, 'clover');
  assert.equal(cl01.displayOrder, 170);
  assert.deepEqual(cl01.renderTuning, {
    anchor: 'top', rotation: 0, edgeFitMode: 'horizontal_fill',
    visualScale: 1, maxWidthRatio: 1, visualOffsetX: 0,
    visualOffsetY: 0, maxHeightRatio: 1, contactInsetLeft: 0.4,
    contactInsetRight: 0.4, targetWidthFillRatio: 1
  });
});

test('CL01 WebP is a non-empty transparent 500x500 runtime asset', async () => {
  const assetUrl = new URL('../assets/charms/clover/cl01.webp', import.meta.url);
  const assetPath = fileURLToPath(assetUrl);
  const metadata = await sharp(assetPath).metadata();
  assert.ok(fs.statSync(assetUrl).size > 0);
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 500);
  assert.equal(metadata.height, 500);
  assert.equal(metadata.hasAlpha, true);
  assert.equal(metadata.channels, 4);
});

test('data.js fallback carries CL01 through existing catalog normalization fields', () => {
  const start = dataSource.indexOf('"id": "cl01"');
  const block = dataSource.slice(start, start + 1400);
  assert.ok(start > -1);
  for (const expected of [
    '"type": "bee_heart"', '"entityType": "charm"', '"price": 290',
    '"stockQty": 10', '"footprintMm": 4.2',
    '"/assets/charms/clover/cl01.webp"', '"isActive": true', '"inStock": true'
  ]) assert.ok(block.includes(expected), `missing fallback field: ${expected}`);
  assert.match(dataSource, /function normalizeCharmRecord\(/);
  assert.match(dataSource, /function adaptNormalizedCharmToLegacy\(/);
});

test('CL01 remains a generic charm in summary and payment code', () => {
  const summaryStart = appSource.indexOf('function buildCheckoutSummary()');
  const summary = appSource.slice(summaryStart, summaryStart + 5000);
  assert.ok(summaryStart > -1);
  assert.match(summary, /type: 'charm'/);
  assert.match(summary, /charmId: charm\.id/);
  assert.doesNotMatch(appSource, /(?:item|charm)\.type\s*===?\s*['"]clover['"]/);
  assert.doesNotMatch(serverSource, /(?:item|line|component)\.type\s*===?\s*['"]clover['"]/);
  assert.match(serverSource, /async function buildAuthoritativeStripeOrder\(/);
  assert.match(serverSource, /async function applyStripeCheckoutPaymentEvent\(/);
});
