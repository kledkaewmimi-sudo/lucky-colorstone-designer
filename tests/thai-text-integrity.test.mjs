import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const MALLOW_THAI_EXPECTED = '\u0E2D\u0E31\u0E0D\u0E21\u0E13\u0E35\u0E41\u0E2B\u0E48\u0E07\u0E40\u0E2A\u0E19\u0E48\u0E2B\u0E4C';
const PONY_THAI_EXPECTED = '\u0E21\u0E49\u0E32\u0E41\u0E2B\u0E48\u0E07\u0E1D\u0E31\u0E19';
const MALLOW_MALFORMED = String.fromCodePoint(0x0E2D, 0x0E0D, 0x0E21, 0x0E13, 0x0E41, 0x0E2B, 0x0E07, 0x0E40, 0x0E2A, 0x0E19, 0x0E2B);
const PONY_MALFORMED = String.fromCodePoint(0x0E21, 0x0E32, 0x0E41, 0x0E2B, 0x0E07, 0x0E1D, 0x0E19);
const codepoints = (value) => Array.from(value).map((character) => `U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
const KNOWN_EXACT_THAI_LITERALS = Object.freeze({
  bestseller: 'ขายด',
  new: 'ใหม',
  luckyClover: 'ลคก ใบโคลเวอร นำโชค'
});
test('Mallow and Pony owner-approved literals are constructed from authoritative Unicode escapes', () => {
  assert.deepStrictEqual(codepoints(MALLOW_THAI_EXPECTED), [
    'U+0E2D', 'U+0E31', 'U+0E0D', 'U+0E21', 'U+0E13', 'U+0E35', 'U+0E41', 'U+0E2B',
    'U+0E48', 'U+0E07', 'U+0E40', 'U+0E2A', 'U+0E19', 'U+0E48', 'U+0E2B', 'U+0E4C'
  ]);
  assert.deepStrictEqual(codepoints(PONY_THAI_EXPECTED), [
    'U+0E21', 'U+0E49', 'U+0E32', 'U+0E41', 'U+0E2B', 'U+0E48', 'U+0E07', 'U+0E1D', 'U+0E31', 'U+0E19'
  ]);
  assert.notStrictEqual(MALLOW_THAI_EXPECTED, MALLOW_MALFORMED);
  assert.notStrictEqual(PONY_THAI_EXPECTED, PONY_MALFORMED);
});

test('active Mallow/Pony source and tests contain no malformed Thai literal', () => {
  for (const relativePath of ['../app.js', '../data.js', './thai-text-integrity.test.mjs', './mallow-pony-charms-uat.test.mjs']) {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
    assert.equal(source.includes(MALLOW_MALFORMED), false, `${relativePath} contains malformed Mallow Thai`);
    assert.equal(source.includes(PONY_MALFORMED), false, `${relativePath} contains malformed Pony Thai`);
  }
});

test('known Thai baselines remain exact literals, not normalized or reconstructed text', () => {
  assert.strictEqual(KNOWN_EXACT_THAI_LITERALS.bestseller, 'ขายด');
  assert.strictEqual(KNOWN_EXACT_THAI_LITERALS.new, 'ใหม');
  assert.strictEqual(KNOWN_EXACT_THAI_LITERALS.luckyClover, 'ลคก ใบโคลเวอร นำโชค');
});
