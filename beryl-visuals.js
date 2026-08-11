export const BERYL_STONE_ID = 'beryl';
export const BERYL_VISUAL_IMAGES = Object.freeze([
  'assets/Beryl.png',
  'assets/Beryl pink.png',
  'assets/Beryl blue.png'
]);
export const BERYL_CATALOG_HOLD_MS = 2000;
export const BERYL_CATALOG_FADE_MS = 400;

export function getBerylVisualImage(occurrenceIndex = 0) {
  return BERYL_VISUAL_IMAGES[occurrenceIndex % BERYL_VISUAL_IMAGES.length];
}

export function validateBerylCatalogSchedulerSequence(loopCount = 2) {
  if (BERYL_VISUAL_IMAGES.length !== 3) {
    throw new Error('Beryl catalog animation requires exactly three images.');
  }
  const sequence = Array.from({ length: loopCount * BERYL_VISUAL_IMAGES.length }, (_, index) => (
    getBerylVisualImage(index)
  ));
  return {
    sequence,
    holdDurations: sequence.map(() => BERYL_CATALOG_HOLD_MS),
    fadeDurations: sequence.map(() => BERYL_CATALOG_FADE_MS)
  };
}
