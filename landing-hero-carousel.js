/*
 * Landing campaign hero carousel.
 *
 * Kept separate from app.js so the landing animation cannot interfere with
 * customization, LIFF, catalog, checkout, or analytics state.
 *
 * Static deployments cannot enumerate a directory at runtime. The slide
 * manifest is therefore the single data source for the hero: add or remove a
 * numbered file in assets/hero/slides.json and the carousel picks it up without
 * a JavaScript change. Entries are sorted by the numeric filename suffix.
 */
const HERO_MANIFEST_URL = '/assets/hero/slides.json';
const HERO_FIRST_INTERVAL_MS = 1000;
const HERO_INTERVAL_MS = 2000;
const HERO_CROSSFADE_MS = 500;
const HERO_FILE_PATTERN = /^slide-(\d+)\.(webp|avif|png|jpe?g)$/i;

function normalizeHeroSlides(payload) {
  const entries = Array.isArray(payload) ? payload : payload?.slides;
  if (!Array.isArray(entries)) return [];

  const byNumber = new Map();
  entries.forEach((entry) => {
    const rawFile = typeof entry === 'string'
      ? entry
      : (entry?.file || entry?.src || '');
    const file = String(rawFile).trim().split('/').pop();
    const match = file.match(HERO_FILE_PATTERN);
    if (!match) return;

    const order = Number(match[1]);
    if (!Number.isSafeInteger(order) || order < 1 || byNumber.has(order)) return;

    byNumber.set(order, {
      order,
      src: `/assets/hero/${match[0]}`,
      objectPosition: typeof entry?.objectPosition === 'string'
        ? entry.objectPosition
        : '50% 50%'
    });
  });

  return [...byNumber.values()].sort((a, b) => a.order - b.order);
}

async function loadHeroSlides() {
  const response = await fetch(HERO_MANIFEST_URL, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Hero manifest returned ${response.status}`);
  return normalizeHeroSlides(await response.json());
}

async function initLandingHeroCarousel() {
  const root = document.getElementById('landingHeroCarousel');
  if (!root) return;

  const layers = [...root.querySelectorAll('[data-hero-layer]')];
  if (layers.length < 2) return;

  let slides = [];
  try {
    slides = await loadHeroSlides();
  } catch (error) {
    // The first image is already in the HTML and remains visible. Never let a
    // manifest problem break the landing page or introduce an unrelated image.
    console.warn('Landing hero slides unavailable; keeping the first image.', error);
    layers[0].classList.add('is-active');
    return;
  }

  if (!slides.length) {
    console.warn('Landing hero manifest contains no numbered slides; keeping the first image.');
    layers[0].classList.add('is-active');
    return;
  }

  let activeLayer = 0;
  let activeIndex = 0;
  let running = false;
  let timer = null;
  let preloadTimer = null;
  let runToken = 0;

  const setLayerPosition = (layer, slide) => {
    layer.style.objectPosition = slide.objectPosition || '50% 50%';
  };

  const applySlide = (layer, index) => {
    const slide = slides[index];
    if (!slide) return null;
    setLayerPosition(layer, slide);
    layer.dataset.slideIndex = String(index);
    layer.src = slide.src;
    return slide;
  };

  const getDisplayDuration = (index) => (
    index === 0 ? HERO_FIRST_INTERVAL_MS : HERO_INTERVAL_MS
  );

  const primeNextLayer = () => {
    const inactiveLayer = layers[activeLayer === 0 ? 1 : 0];
    const nextIndex = (activeIndex + 1) % slides.length;
    applySlide(inactiveLayer, nextIndex);
  };

  const updateDebugState = () => {
    root.dataset.activeSlide = String(activeIndex);
    root.dataset.carouselRunning = running ? 'true' : 'false';
  };

  const waitForLayer = (layer, token) => new Promise((resolve) => {
    if (layer.complete) {
      resolve(layer.naturalWidth > 0 && token === runToken);
      return;
    }

    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      layer.removeEventListener('load', onLoad);
      layer.removeEventListener('error', onError);
      resolve(ok && token === runToken);
    };
    const onLoad = () => done(true);
    const onError = () => done(false);
    layer.addEventListener('load', onLoad, { once: true });
    layer.addEventListener('error', onError, { once: true });
  });

  const schedule = () => {
    window.clearTimeout(timer);
    if (!running) return;
    timer = window.setTimeout(advance, getDisplayDuration(activeIndex));
  };

  const advance = async () => {
    if (!running) return;

    const token = runToken;
    const nextLayerIndex = activeLayer === 0 ? 1 : 0;
    const nextLayer = layers[nextLayerIndex];
    const currentLayer = layers[activeLayer];
    let candidate = (activeIndex + 1) % slides.length;
    let ready = false;

    // If a slide is missing or corrupt, skip it rather than painting a blank
    // layer or stopping the whole carousel. The current image stays visible
    // while this search runs.
    for (let attempt = 0; attempt < slides.length; attempt += 1) {
      applySlide(nextLayer, candidate);
      ready = await waitForLayer(nextLayer, token);
      if (!running || token !== runToken) return;
      if (ready) break;
      console.warn(`Landing hero slide failed to load: ${slides[candidate]?.src || candidate}`);
      candidate = (candidate + 1) % slides.length;
    }

    if (!ready) {
      // Every candidate failed. Keep the current frame and retry after a full
      // display interval instead of entering a zero-delay error loop.
      schedule();
      return;
    }

    nextLayer.classList.add('is-active');
    currentLayer.classList.remove('is-active');
    activeLayer = nextLayerIndex;
    activeIndex = candidate;
    updateDebugState();

    // Prime the now-invisible layer only after the outgoing image has finished
    // fading, so the source switch cannot flash during the crossfade.
    window.clearTimeout(preloadTimer);
    preloadTimer = window.setTimeout(() => {
      if (running && token === runToken) primeNextLayer();
    }, HERO_CROSSFADE_MS);

    // The display duration is measured from the start of this crossfade to the
    // next transition; the first slide uses 1 second, all others use 2 seconds.
    schedule();
  };

  const start = () => {
    if (running || document.hidden) return;
    const firstLayer = layers[0];
    const firstSlide = applySlide(firstLayer, activeIndex);
    if (!firstSlide) return;
    activeLayer = 0;
    layers.forEach((layer, index) => layer.classList.toggle('is-active', index === 0));
    running = true;
    updateDebugState();
    primeNextLayer();
    schedule();
  };

  const stop = () => {
    running = false;
    runToken += 1;
    window.clearTimeout(timer);
    window.clearTimeout(preloadTimer);
    timer = null;
    preloadTimer = null;
    updateDebugState();
  };

  applySlide(layers[0], 0);
  layers[0].classList.add('is-active');
  updateDebugState();

  const observer = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !document.hidden) start();
        else stop();
      });
    }, { threshold: 0.05 })
    : null;

  if (observer) observer.observe(root);

  // Start immediately as well: in hidden/headless contexts the initial
  // IntersectionObserver callback can arrive late, and the landing must not
  // appear frozen. The observer will stop the loop if the hero is not visible.
  start();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });

  window.addEventListener('pagehide', () => {
    observer?.disconnect();
    stop();
  }, { once: true });

  // Read-only hook for QA and diagnostics; no application state is exposed.
  window.__landingHeroCampaign = {
    getState: () => ({
      activeIndex,
      activeLayer,
      running,
      slides: slides.length,
      slideFiles: slides.map((slide) => slide.src),
      firstIntervalMs: HERO_FIRST_INTERVAL_MS,
      intervalMs: HERO_INTERVAL_MS,
      crossfadeMs: HERO_CROSSFADE_MS
    }),
    stop
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLandingHeroCarousel, { once: true });
} else {
  initLandingHeroCarousel();
}
