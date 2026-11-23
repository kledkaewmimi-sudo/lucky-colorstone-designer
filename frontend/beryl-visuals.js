export const BERYL_STONE_ID = 'beryl';
export const GRAY_AGATE_STONE_ID = 'gray_agate';
export const BERYL_VISUAL_IMAGES = Object.freeze([
  'assets/Beryl.webp',
  'assets/Beryl pink.webp',
  'assets/Beryl blue.webp'
]);
export const GRAY_AGATE_VISUAL_IMAGES = Object.freeze([
  'assets/natural1.webp',
  'assets/natural2.webp',
  'assets/natural3.webp'
]);
export const BERYL_CATALOG_HOLD_MS = 2000;
export const BERYL_CATALOG_FADE_MS = 400;

export function getBerylVisualImage(occurrenceIndex = 0) {
  return BERYL_VISUAL_IMAGES[occurrenceIndex % BERYL_VISUAL_IMAGES.length];
}

export function getSequentialStoneVisualImages(stoneId = '') {
  if (stoneId === BERYL_STONE_ID) return BERYL_VISUAL_IMAGES;
  if (stoneId === GRAY_AGATE_STONE_ID) return GRAY_AGATE_VISUAL_IMAGES;
  return null;
}

export function getSequentialStoneVisualImage(stoneId = '', occurrenceIndex = 0) {
  const images = getSequentialStoneVisualImages(stoneId);
  return images ? images[occurrenceIndex % images.length] : '';
}

export function createBerylCatalogSchedulerState() {
  return { currentIndex: 0, phase: 'hold' };
}

export function advanceBerylCatalogSchedulerState(state = createBerylCatalogSchedulerState()) {
  const currentIndex = Number(state.currentIndex) || 0;
  return {
    currentIndex: (currentIndex + 1) % BERYL_VISUAL_IMAGES.length,
    phase: 'hold',
    transition: {
      from: getBerylVisualImage(currentIndex),
      to: getBerylVisualImage(currentIndex + 1)
    }
  };
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
