const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const stones = require('../data/stones.json');
const manifest = require('../reports/catalog/uat-catalog-promotion-manifest.json');
const additions = {
  blue_cat_eye: { name: 'Blue Cat eye', nameTh: 'บลูแคทอาย', sizes: [6], p6: 19, image: 'assets/Blue Cat eye.png' },
  gold_sand_stone: { name: 'Gold sand stone', nameTh: 'ทรายทอง', sizes: [6], p6: 20, image: 'assets/Gold sand stone.png' },
  silver_sand_stone: { name: 'Silver sand stone', nameTh: 'ทรายเงิน', sizes: [6], p6: 20, image: 'assets/Silver sand stone.png' },
  amethyst_quartz: { name: 'Amethyst quartz', nameTh: 'อเมทิสต์ โป่งข่าม', sizes: [6, 10], p6: 32, p10: 59, image: 'assets/Amethyst quartz.png' }
};

assert.equal(new Set(stones.map((stone) => stone.id)).size, stones.length, 'stone IDs must be unique');
for (const [id, expected] of Object.entries(additions)) {
  const stone = stones.find((item) => item.id === id);
  assert.ok(stone, `${id} must exist`);
  assert.equal(stone.name, expected.name);
  assert.equal(stone.nameTh, expected.nameTh);
  assert.deepEqual(stone.sizes, expected.sizes);
  assert.equal(stone.p6, expected.p6);
  assert.equal(stone.p10 || 0, expected.p10 || 0);
  assert.equal(stone.p4 || 0, 0);
  assert.equal(fs.existsSync(path.join(root, stone.image)), true, `${id} image must exist`);
}

assert.equal(stones.some((stone) => stone.id === 'blue_agate'), false, 'Blue Agate requires its owner-supplied asset before catalog insertion');
const amethyst = stones.find((stone) => stone.id === 'amethyst');
assert.ok(amethyst);
assert.equal(stones.filter((stone) => stone.id === 'amethyst').length, 1, 'Amethyst must not be duplicated');
assert.deepEqual(amethyst.sizes, [4, 6, 10]);
assert.deepEqual({ p4: amethyst.p4, p6: amethyst.p6, p10: amethyst.p10 }, { p4: 20, p6: 29, p10: 50 });
assert.equal(amethyst.image, 'assets/amethyst.png');
assert.equal(fs.existsSync(path.join(root, amethyst.image)), true);
assert.equal(manifest.environment, 'uat');
assert.equal(manifest.promotionRules.productionMutationFromUat, false);
assert.equal(manifest.approvedItems.some((item) => item.operation === 'DELETE'), false);
assert.deepEqual(manifest.approvedItems.map((item) => item.id), ['blue_cat_eye', 'gold_sand_stone', 'silver_sand_stone', 'amethyst_quartz', 'amethyst']);
assert.equal(manifest.approvedItems.find((item) => item.id === 'amethyst').changeScope, 'IMAGE_ONLY_CHANGE');

console.log('uat-new-stones-catalog.test.cjs passed');
