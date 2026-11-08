/*
 * Landing campaign hero carousel.
 *
 * Kept separate from app.js so the landing animation cannot interfere with
 * customization, LIFF, catalog, checkout, or analytics state.
 *
 * The image sequence is the single source of truth for hero slides. Each slide
 * may define its own object-position so portrait crops can be tuned without
 * changing the crossfade engine.
 */
const HERO_SLIDES = Object.freeze([
  { src: '/assets/hero/slide-01.webp', objectPosition: '42% 48%' },
  { src: '/assets/hero/slide-02.webp', objectPosition: '50% 45%' },
  { src: '/assets/hero/slide-03.webp', objectPosition: '50% 50%' },
  { src: '/assets/hero/slide-04.webp', objectPosition: '46% 54%' },
  { src: '/assets/hero/slide-05.webp', objectPosition: '48% 44%' },
  { src: '/assets/hero/slide-06.webp', objectPosition: '58% 48%' },
  { src: '/assets/hero/slide-08.webp', objectPosition: '52% 46%' }
]);

const HERO_INTERVAL_MS = 2000;
const HERO_CROSSFADE_MS = 500;

function initLandingHeroCarousel() {
  const root = document.getElementById('landingHeroCarousel');
  if (!root) return;

  const layers = [...root.querySelectorAll('[data-hero-layer]')];
  if (layers.length < 2) return;

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
    const slide = HERO_SLIDES[index];
    setLayerPosition(layer, slide);
    layer.dataset.slideIndex = String(index);
    layer.src = slide.src;
    return slide;
  };

  const primeNextLayer = () => {
    const inactiveLayer = layers[activeLayer === 0 ? 1 : 0];
    const nextIndex = (activeIndex + 1) % HERO_SLIDES.length;
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
    timer = window.setTimeout(advance, HERO_INTERVAL_MS);
  };

  const advance = async () => {
    if (!running) return;

    const token = runToken;
    const nextIndex = (activeIndex + 1) % HERO_SLIDES.length;
    const nextLayerIndex = activeLayer === 0 ? 1 : 0;
    const nextLayer = layers[nextLayerIndex];
    const currentLayer = layers[activeLayer];

    // The inactive layer was primed after the previous crossfade completed.
    // If that preload is still in flight, wait for it rather than painting a
    // blank layer; the current image remains visible meanwhile.
    if (nextLayer.dataset.slideIndex !== String(nextIndex)) {
      applySlide(nextLayer, nextIndex);
    }
    const ready = await waitForLayer(nextLayer, token);
    if (!ready || !running || token !== runToken) return;

    nextLayer.classList.add('is-active');
    currentLayer.classList.remove('is-active');
    activeLayer = nextLayerIndex;
    activeIndex = nextIndex;
    updateDebugState();

    // Prime the now-invisible layer only after the outgoing image has finished
    // fading, so the source switch cannot flash during the crossfade.
    window.clearTimeout(preloadTimer);
    preloadTimer = window.setTimeout(() => {
      if (running && token === runToken) primeNextLayer();
    }, HERO_CROSSFADE_MS);

    // The next transition starts one interval after this crossfade begins.
    // The two layers remain mounted, so the outgoing image never disappears.
    schedule();
  };

  const start = () => {
    if (running) return;
    const firstLayer = layers[0];
    const firstSlide = applySlide(firstLayer, activeIndex);
    activeLayer = 0;
    layers.forEach((layer, index) => layer.classList.toggle('is-active', index === 0));
    setLayerPosition(firstLayer, firstSlide);
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
        if (entry.isIntersecting) start();
        else stop();
      });
    }, { threshold: 0.05 })
    : null;

  if (observer) observer.observe(root);
  else start();

  // Start immediately as well: in hidden/headless contexts the initial
  // IntersectionObserver callback can arrive late, and the landing must not
  // appear frozen. The observer will stop the loop if the hero is not visible.
  start();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (!observer) start();
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
      slides: HERO_SLIDES.length,
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
