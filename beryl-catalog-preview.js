import {
  BERYL_CATALOG_FADE_MS,
  BERYL_CATALOG_HOLD_MS,
  BERYL_VISUAL_IMAGES
} from './beryl-visuals.js';

export function createBerylCatalogPreview(card) {
  const container = card?.querySelector('.stone-img-container');
  const greenImage = container?.querySelector('img.stone-img');
  if (!container || !greenImage) return null;

  card.dataset.berylCatalogCard = 'true';
  const layers = BERYL_VISUAL_IMAGES.map((imageUrl, index) => {
    const image = index === 0 ? greenImage : card.ownerDocument.createElement('img');
    image.className = 'stone-img beryl-catalog-image';
    image.dataset.berylCatalogLayer = String(index);
    image.src = imageUrl;
    image.style.opacity = index === 0 ? '1' : '0';
    if (index > 0) {
      image.alt = '';
      image.setAttribute('aria-hidden', 'true');
      container.appendChild(image);
    }
    return image;
  });

  return { root: card, layers };
}

function waitForImageReady(image, timeoutMs = 8000) {
  if (image.complete) return Promise.resolve((image.naturalWidth || 0) > 0);

  return new Promise((resolve) => {
    let complete = false;
    const finish = (ready) => {
      if (complete) return;
      complete = true;
      clearTimeout(timeoutId);
      image.removeEventListener('load', onLoad);
      image.removeEventListener('error', onError);
      resolve(ready && (image.naturalWidth || 0) > 0);
    };
    const onLoad = () => finish(true);
    const onError = () => finish(false);
    const timeoutId = setTimeout(() => finish((image.naturalWidth || 0) > 0), timeoutMs);
    image.addEventListener('load', onLoad, { once: true });
    image.addEventListener('error', onError, { once: true });
  });
}

export function waitForBerylCatalogPreviewReady(preview) {
  if (!preview || preview.layers?.length !== BERYL_VISUAL_IMAGES.length) return Promise.resolve(false);
  return Promise.all(preview.layers.map((image) => waitForImageReady(image)))
    .then((readyStates) => readyStates.every(Boolean));
}

export function createBerylCatalogPreviewController(preview, timerApi = window) {
  const root = preview?.root;
  const layers = preview?.layers;
  if (!root || !Array.isArray(layers) || layers.length !== BERYL_VISUAL_IMAGES.length) return null;

  let currentIndex = 0;
  let pendingTimer = null;
  let stopped = false;

  const setVisibleLayer = (visibleIndex) => {
    layers.forEach((layer, index) => {
      layer.style.opacity = index === visibleIndex ? '1' : '0';
    });
    root.dataset.berylCatalogActiveIndex = String(visibleIndex);
  };

  const stop = () => {
    stopped = true;
    if (pendingTimer !== null) timerApi.clearTimeout(pendingTimer);
    pendingTimer = null;
  };

  const scheduleNextTransition = () => {
    pendingTimer = timerApi.setTimeout(() => {
      pendingTimer = null;
      if (stopped || !root.isConnected) {
        stop();
        return;
      }

      const nextIndex = (currentIndex + 1) % BERYL_VISUAL_IMAGES.length;
      setVisibleLayer(nextIndex);

      pendingTimer = timerApi.setTimeout(() => {
        pendingTimer = null;
        if (stopped || !root.isConnected) {
          stop();
          return;
        }
        currentIndex = nextIndex;
        scheduleNextTransition();
      }, BERYL_CATALOG_FADE_MS);
    }, BERYL_CATALOG_HOLD_MS);
  };

  setVisibleLayer(0);
  scheduleNextTransition();

  return {
    stop,
    getCurrentIndex: () => currentIndex,
    hasPendingTimer: () => pendingTimer !== null
  };
}
