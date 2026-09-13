import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { getProductCardBadge } from '../product-card-badges.js';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');

const bestsellerStoneVariants = [
  ['golden_rutile', 10],
  ['moonstone', 10],
  ['carnelian', 10],
  ['amethyst', 6],
  ['cherry_quartz', 6],
  ['lapis_lazuli', 6],
  ['golden_rutile', 4],
  ['tigers_eye', 4]
];

test('every exactly matched bestseller stone-size variant has the requested badge', () => {
  bestsellerStoneVariants.forEach(([id, size]) => {
    assert.deepEqual(getProductCardBadge('stones', id, size), { label: 'ขายด', variant: 'bestseller' });
  });
});

test('unlisted sizes and the unmatched Silver Sand Stone 4 mm variant remain unbadged', () => {
  assert.equal(getProductCardBadge('stones', 'golden_rutile', 6), null);
  assert.equal(getProductCardBadge('stones', 'moonstone', 6), null);
  assert.equal(getProductCardBadge('stones', 'carnelian', 6), null);
  assert.equal(getProductCardBadge('stones', 'silver_sand_stone', 4), null);
});

test('Green Jade 6 mm is new while its unlisted size is not', () => {
  assert.deepEqual(getProductCardBadge('stones', 'green_jade', 6), { label: 'ใหม', variant: 'new' });
  assert.equal(getProductCardBadge('stones', 'green_jade', 10), null);
});

test('Lucky Clover charm CL01 is new and other charms remain unbadged', () => {
  assert.deepEqual(getProductCardBadge('charms', 'cl01'), { label: 'ใหม', variant: 'new' });
  assert.equal(getProductCardBadge('charms', 'px01'), null);
});

test('both badge variants inherit one fixed 58 by 22 pixel base class', () => {
  assert.match(css, /\.product-badge\s*\{[\s\S]*?width:\s*58px;[\s\S]*?height:\s*22px;[\s\S]*?padding:\s*0;[\s\S]*?display:\s*flex;/);
  assert.match(css, /\.product-badge--bestseller\s*\{/);
  assert.match(css, /\.product-badge--new\s*\{[\s\S]*?background:\s*#eee8ff;/);
});

test('badges are presentation-only and retain existing product-card selection handlers', () => {
  assert.match(app, /badgeElement\.className = `product-badge product-badge--\$\{badge\.variant\}`/);
  assert.match(app, /onCardClick: \(\) => addStoneToBracelet\(stone\.id\)/);
  assert.match(app, /onCardClick: \(\) => selectCharm\(charm\.id\)/);
  assert.match(app, /pointer-events:\s*none;/);
});