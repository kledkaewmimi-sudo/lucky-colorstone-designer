import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { getProductCardBadge } from '../product-card-badges.js';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const productBadgeCss = css.slice(css.indexOf('.product-badge {'), css.indexOf('.product-badge--bestseller'));
const bestsellerLabel = String.fromCodePoint(0x0e02, 0x0e32, 0x0e22, 0x0e14, 0x0e35, 0x2728); // ขายดี✨
const newLabel = String.fromCodePoint(0x0e43, 0x0e2b, 0x0e21, 0x0e48); // ใหม่

const bestsellerStoneVariants = [
  ['golden_rutile', 10], ['moonstone', 10], ['carnelian', 10],
  ['amethyst', 6], ['cherry_quartz', 6], ['lapis_lazuli', 6],
  ['golden_rutile', 4], ['tigers_eye', 4]
];

test('every exactly matched bestseller stone-size variant has the complete exact badge text', () => {
  bestsellerStoneVariants.forEach(([id, size]) => {
    assert.deepEqual(getProductCardBadge('stones', id, size), { label: bestsellerLabel, variant: 'bestseller' });
  });
  assert.equal(bestsellerLabel.includes(' '), false);
  assert.equal(bestsellerLabel.endsWith('✨'), true);
});

test('unlisted sizes and the unmatched Silver Sand Stone 4 mm variant remain unbadged', () => {
  assert.equal(getProductCardBadge('stones', 'golden_rutile', 6), null);
  assert.equal(getProductCardBadge('stones', 'moonstone', 6), null);
  assert.equal(getProductCardBadge('stones', 'carnelian', 6), null);
  assert.equal(getProductCardBadge('stones', 'silver_sand_stone', 4), null);
});

test('Green Jade 6 mm and Lucky Clover use the complete lavender new label', () => {
  assert.deepEqual(getProductCardBadge('stones', 'green_jade', 6), { label: newLabel, variant: 'new' });
  assert.deepEqual(getProductCardBadge('charms', 'cl01'), { label: newLabel, variant: 'new' });
  assert.equal(getProductCardBadge('stones', 'green_jade', 10), null);
  assert.equal(getProductCardBadge('charms', 'px01'), null);
});

test('shared badge dimensions leave room for Thai marks and sparkle without clipping', () => {
  assert.match(productBadgeCss, /width:\s*46px;[\s\S]*?height:\s*16px;[\s\S]*?top:\s*0;[\s\S]*?left:\s*0;[\s\S]*?line-height:\s*1;[\s\S]*?overflow:\s*visible;/);
  assert.doesNotMatch(productBadgeCss, /overflow:\s*hidden;/);
  assert.match(productBadgeCss, /font-family:\s*"Noto Sans Thai",\s*"Leelawadee UI",\s*system-ui,\s*sans-serif;/);
});

test('bestseller is red rather than brown or gold and new remains lavender', () => {
  assert.match(css, /\.product-badge--bestseller\s*\{[\s\S]*?background:\s*#c8102e;/);
  assert.doesNotMatch(css, /\.product-badge--bestseller\s*\{[\s\S]*?background:\s*#6f4a1d;/);
  assert.match(css, /\.product-badge--new\s*\{[\s\S]*?background:\s*#eee8ff;/);
});

test('badges remain presentation-only and preserve product-card selection controls', () => {
  assert.match(app, /badgeElement\.className = `product-badge product-badge--\$\{badge\.variant\}`/);
  assert.match(css, /pointer-events:\s*none;/);
  assert.match(css, /\.stone-card \.info-icon-btn\s*\{\s*z-index:\s*3;/);
  assert.match(app, /onCardClick: \(\) => addStoneToBracelet\(stone\.id\)/);
  assert.match(app, /onCardClick: \(\) => selectCharm\(charm\.id\)/);
});