import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../beryl-visuals.js', import.meta.url), 'utf8');
const {
  BERYL_CATALOG_FADE_MS,
  BERYL_CATALOG_HOLD_MS,
  BERYL_VISUAL_IMAGES,
  validateBerylCatalogSchedulerSequence
} = await import(`data:text/javascript,${encodeURIComponent(source)}`);

test('Beryl scheduler has two complete green, pink, blue loops with equal timing', () => {
  const diagnostic = validateBerylCatalogSchedulerSequence(2);
  assert.deepEqual(BERYL_VISUAL_IMAGES, [
    'assets/Beryl.webp',
    'assets/Beryl pink.webp',
    'assets/Beryl blue.webp'
  ]);
  assert.equal(BERYL_VISUAL_IMAGES.length, 3);
  assert.deepEqual(diagnostic.sequence, [
    'assets/Beryl.webp',
    'assets/Beryl pink.webp',
    'assets/Beryl blue.webp',
    'assets/Beryl.webp',
    'assets/Beryl pink.webp',
    'assets/Beryl blue.webp'
  ]);
  assert.deepEqual(diagnostic.holdDurations, Array(6).fill(BERYL_CATALOG_HOLD_MS));
  assert.deepEqual(diagnostic.fadeDurations, Array(6).fill(BERYL_CATALOG_FADE_MS));
});
