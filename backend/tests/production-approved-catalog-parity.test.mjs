import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const stones = JSON.parse(await readFile(new URL('data/stones.json', root), 'utf8'));
const byId = new Map(stones.map((stone) => [stone.id, stone]));

const approved = [
  ['blue_cat_eye', 6, 19, 'assets/Blue Cat eye.png', 330],
  ['gold_sand_stone', 6, 20, 'assets/Gold sand stone.png', 340],
  ['silver_sand_stone', 6, 20, 'assets/Silver sand stone.png', 350],
  ['amethyst_quartz', 6, 32, 'assets/Amethyst quartz.png', 360],
  ['blue_agate', 6, 20, 'assets/Blue agate.png', 370]
];

test('production fallback catalog includes each approved UAT stone with exact customer fields', () => {
  for (const [id, size, price, image, displayOrder] of approved) {
    const stone = byId.get(id);
    assert.ok(stone, `missing ${id}`);
    assert.ok(stone.sizes.includes(size));
    assert.equal(stone.p6, price);
    assert.equal(stone.image, image);
    assert.equal(stone.displayOrder, displayOrder);
    assert.equal(stone.isActive, true);
    assert.equal(stone.inStock, true);
  }
});

test('production fallback uses the approved Amethyst asset and excludes the UAT QA stone', () => {
  assert.equal(byId.get('amethyst')?.image, 'assets/amethyst.png');
  assert.equal(byId.has('uat-qa-persistence-20260827-live'), false);
});
