// Persistent Step 3 onboarding with tap-only progression and respectful replay.
import {
  STEP3_ONBOARDING_STATES as ST, STEP3_ONBOARDING_STAGES,
  STEP3_ONBOARDING_STORAGE_KEY, STEP3_ONBOARDING_STORAGE_VALUE,
  STEP3_ONBOARDING_REPLAY_STORAGE_KEY, STEP3_ONBOARDING_REPLAY_VERSION,
  STEP3_ONBOARDING_INACTIVITY_MS, STEP3_ONBOARDING_TIME_ZONE,
  buildStep3OnboardingSequence, nextStep3OnboardingStage,
  isFinalStep3OnboardingStage, getStep3OnboardingBleed,
  resolveStep3OnboardingPlacement, clampStep3OnboardingPlacement
} from './step3-onboarding-machine.js';

const OVERLAY = 'step3-onboarding';
const ROOT = 'stepView3';
const ENTRY = '#stepView3 .lumi-center-entry';
const ACTIVE = 'lucky-onboarding-active';
const FINAL = 'lucky-onboarding-lucky';
const TRANSITION_MS = 300;
const DISMISS_MS = 240;
const ACTIVITY_WRITE_INTERVAL_MS = 30000;
// How long a freshly shown stage keeps re-placing its artwork while the device layout settles.
const PLACEMENT_WATCH_MS = 1600;

function getStorage(win) { try { return win?.localStorage || null; } catch { return null; } }
function bangkokDate(time) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: STEP3_ONBOARDING_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(time)); }
  catch { return new Date(time).toISOString().slice(0, 10); }
}

export function createStep3OnboardingController(deps = {}) {
  const win = deps.window || (typeof window === 'undefined' ? null : window);
  const doc = deps.document || win?.document;
  const storage = deps.storage === undefined ? getStorage(win) : deps.storage;
  const now = deps.now || (() => Date.now());
  const isMixed = deps.isMixed || (() => false);
  const pause = deps.pauseCtaTimeline || (() => {});
  const resume = deps.resumeCtaTimeline || (() => {});
  const suspendHints = deps.suspendLegacyHints || (() => {});
  let session = null;
  let visitEvaluated = false;
  let replayDeferred = false;
  let preload = null;
  let startPending = false;
  let placeFrame = null;

  const root = () => doc?.getElementById(ROOT) || null;
  const entry = () => doc?.querySelector(ENTRY) || null;
  const target = (stage) => stage === ST.LUCKY_GUIDE ? entry() : doc?.querySelector(STEP3_ONBOARDING_STAGES[stage]?.target || '') || null;
  // Lucky owns the only full-screen Step 3 assistant surface. Other persistent
  // `.modal` shells may keep an `active` class while visually closed, so using
  // them here would incorrectly suppress first-visit onboarding.
  const safe = () => !doc?.querySelector('.lumi-shell');

  function readState() {
    try { const value = JSON.parse(storage?.getItem(STEP3_ONBOARDING_REPLAY_STORAGE_KEY) || 'null'); return value?.version === STEP3_ONBOARDING_REPLAY_VERSION ? value : null; } catch { return null; }
  }
  function writeState(value) { try { storage?.setItem(STEP3_ONBOARDING_REPLAY_STORAGE_KEY, JSON.stringify(value)); } catch {} return value; }
  function migrateLegacy(time) {
    const current = readState();
    if (current) return current;
    try {
      if (storage?.getItem(STEP3_ONBOARDING_STORAGE_KEY) !== STEP3_ONBOARDING_STORAGE_VALUE) return null;
    } catch { return null; }
    // v1 was permanent. Its migration is a recent visit, so it can replay after inactivity/a new day.
    return writeState({ version: STEP3_ONBOARDING_REPLAY_VERSION, migratedLegacy: true, lastActivityAt: time, lastCompletionAt: time, lastDisplayAt: time, lastCalendarDate: bangkokDate(time) });
  }
  function eligibility(time) {
    const state = readState() || migrateLegacy(time);
    if (!state) return { eligible: true, reason: 'first-visit' };
    const activity = Number(state.lastActivityAt || state.lastCompletionAt || state.lastDisplayAt || 0);
    const laterDay = state.lastCalendarDate && state.lastCalendarDate !== bangkokDate(time);
    const inactive = activity > 0 && time >= activity && time - activity >= STEP3_ONBOARDING_INACTIVITY_MS;
    return { eligible: Boolean(laterDay || inactive), reason: laterDay ? 'new-calendar-day' : (inactive ? 'inactive' : 'recent-active') };
  }
  function recordActivity(time = now(), force = false) {
    const previous = readState() || migrateLegacy(time);
    if (!force && previous?.lastActivityAt && time >= previous.lastActivityAt && time - previous.lastActivityAt < ACTIVITY_WRITE_INTERVAL_MS) return previous;
    return writeState({ version: STEP3_ONBOARDING_REPLAY_VERSION, ...(previous || {}), lastActivityAt: time, lastCalendarDate: previous?.lastCalendarDate || bangkokDate(time) });
  }
  function plan() { return buildStep3OnboardingSequence({ mixed: Boolean(isMixed()) }).filter((stage) => { const el = target(stage); return Boolean(el && (stage !== ST.SIZE_GUIDE || !el.hidden)); }); }
  function preloadAssets() {
    if (preload) return preload;
    const sources = Object.values(STEP3_ONBOARDING_STAGES).map((item) => item.asset);
    preload = Promise.all(sources.map((src) => new Promise((done) => {
      const image = new win.Image();
      image.onload = () => (image.decode ? image.decode().catch(() => undefined) : Promise.resolve()).then(done);
      image.onerror = done;
      image.src = src;
    }))).then(() => undefined);
    return preload;
  }
  function makeSlot() {
    const slot = doc.createElement('div');
    slot.className = OVERLAY + '-slot';
    slot.innerHTML = '<div class="' + OVERLAY + '-art"><img alt="" decoding="async" draggable="false"></div><div class="' + OVERLAY + '-mascot"><img alt="" decoding="async" draggable="false"></div>';
    return slot;
  }
  function buildOverlay() {
    const overlay = doc.createElement('div');
    overlay.className = OVERLAY;
    overlay.setAttribute('role', 'presentation');
    overlay.innerHTML = '<div class="' + OVERLAY + '-backdrop" aria-hidden="true"></div><p class="' + OVERLAY + '-status" role="status" aria-live="polite"></p>';
    overlay.insertBefore(makeSlot(), overlay.lastChild);
    overlay.insertBefore(makeSlot(), overlay.lastChild);
    doc.body.appendChild(overlay);
    return overlay;
  }
  function place(slot, stage) {
    const definition = STEP3_ONBOARDING_STAGES[stage];
    const realTarget = target(stage);
    const art = slot?.querySelector('.' + OVERLAY + '-art');
    const content = slot?.querySelector('.' + OVERLAY + '-mascot');
    const image = art?.querySelector('img');
    if (!definition || !realTarget || !art) return null;
    const rect = realTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    let box = resolveStep3OnboardingPlacement({ targetRect: rect, assetSize: { width: image?.naturalWidth || definition.naturalWidth, height: image?.naturalHeight || definition.naturalHeight }, anchor: definition.anchor });
    const cap = Number(definition.maxViewportWidthRatio);
    if (cap > 0 && box.width > win.innerWidth * cap) {
      const scale = win.innerWidth * cap / box.width;
      box = { width: box.width * scale, height: box.height * scale, left: rect.left + rect.width / 2 - definition.anchor.centerX * box.width * scale, top: rect.top + rect.height / 2 - definition.anchor.centerY * box.height * scale };
    }
    box = clampStep3OnboardingPlacement(box, getStep3OnboardingBleed(stage), { width: win.innerWidth, height: win.innerHeight });
    Object.assign(art.style, { width: box.width + 'px', height: box.height + 'px', left: Math.round(box.left) + 'px', top: Math.round(box.top) + 'px' });
    if (definition.splitLayers && content) {
      const split = definition.splitLayers;
      art.style.clipPath = 'inset(' + (split.buttonInset.top * 100).toFixed(3) + '% ' + (split.buttonInset.right * 100).toFixed(3) + '% ' + (split.buttonInset.bottom * 100).toFixed(3) + '% ' + (split.buttonInset.left * 100).toFixed(3) + '%)';
      const scale = Math.min(1, (win.innerWidth - (split.marginPx || 0) * 2) / ((split.contentRightRatio - split.contentLeftRatio) * box.width));
      const width = box.width * scale, height = box.height * scale;
      const left = win.innerWidth - (split.marginPx || 0) - split.contentRightRatio * width;
      const top = box.top + definition.anchor.centerY * box.height - definition.anchor.centerY * height;
      Object.assign(content.style, { display: 'block', width: width + 'px', height: height + 'px', left: Math.round(left) + 'px', top: Math.round(top) + 'px', clipPath: 'polygon(' + split.contentPolygon.map(([x, y]) => (x * 100).toFixed(3) + '% ' + (y * 100).toFixed(3) + '%').join(', ') + ')' });
    } else if (definition.illustrationLayer && content) {
      // Turn 10.6: the first onboarding screen draws the SAME artwork twice. The bar layer keeps the exact
      // anchored box that wraps the real target row; the illustration above the bar's top edge is scaled to
      // `illustration.scale`, centred on the same anchor axis and bottom-anchored on the bar's top edge, so
      // the star, wand, sparkles and speech bubble stay inside the viewport without shrinking the guide.
      const illustration = definition.illustrationLayer;
      const cutRatio = Math.min(1, Math.max(0, Number(illustration.cutRatio) || 0));
      const illustrationScale = Number(illustration.scale) > 0 ? Number(illustration.scale) : 1;
      art.style.clipPath = 'inset(' + (cutRatio * 100).toFixed(3) + '% 0 0 0)';
      const width = box.width * illustrationScale;
      const height = box.height * illustrationScale;
      const anchorCentreX = box.left + definition.anchor.centerX * box.width;
      const barTop = box.top + cutRatio * box.height;
      Object.assign(content.style, {
        display: 'block',
        width: width + 'px',
        height: height + 'px',
        left: Math.round(anchorCentreX - definition.anchor.centerX * width) + 'px',
        top: Math.round(barTop - cutRatio * height) + 'px',
        clipPath: 'inset(0 0 ' + ((1 - cutRatio) * 100).toFixed(3) + '% 0)'
      });
      const contentImage = content.querySelector('img');
      if (contentImage) Object.assign(contentImage.style, { width: '100%', height: '100%' });
    } else if (content) { art.style.clipPath = ''; content.style.display = 'none'; content.style.clipPath = ''; }
    return { stage, art: { left: Math.round(box.left), top: Math.round(box.top), width: Math.round(box.width), height: Math.round(box.height) }, target: { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) } };
  }
  function stageSlot(slot, stage) {
    slot.dataset.stage = stage;
    slot.querySelectorAll('img').forEach((image) => {
      image.src = STEP3_ONBOARDING_STAGES[stage].asset;
      // Start decoding the incoming approved artwork at src assignment (not at first paint) so the
      // crossfade never reveals a not-yet-rasterised layer. Presentation only: nothing is awaited
      // and nothing about tap-only progression depends on it.
      if (typeof image.decode === 'function') image.decode().catch(() => undefined);
    });
    return place(slot, stage);
  }
  function schedulePlace() {
    if (!session || placeFrame) return;
    placeFrame = win.requestAnimationFrame(() => { placeFrame = null; if (!session) return; session.slots.forEach((slot) => { if (slot.dataset.stage) place(slot, slot.dataset.stage); }); });
  }
  function settle(current) { if (session !== current) return; current.transitioning = false; current.cleanup?.(); current.cleanup = null; }
  // The artwork is placed from the REAL element's viewport rect, so any late layout shift must move it
  // with the element. Android Chrome is the platform where this bites hardest: collapsing the URL bar
  // (and the visual viewport it changes) happens AFTER the stage is placed, which left the baked Lucky
  // circle visibly off the real CTA button. A short settle watch re-places during the first ~1.6s of a
  // stage, and visualViewport changes re-place for as long as the stage is on screen.
  let placementWatch = null;
  function stopPlacementWatch() { if (placementWatch !== null) { win.cancelAnimationFrame(placementWatch); placementWatch = null; } }
  function startPlacementWatch(stage) {
    stopPlacementWatch();
    const watchStart = now();
    const tick = () => {
      placementWatch = null;
      if (!session || session.stageId !== stage) return;
      schedulePlace();
      if (now() - watchStart < PLACEMENT_WATCH_MS) placementWatch = win.requestAnimationFrame(tick);
    };
    placementWatch = win.requestAnimationFrame(tick);
  }
  function waitForSlot(current, slot) {
    const end = (event) => { if (event.target === slot && event.propertyName === 'opacity') settle(current); };
    const timer = win.setTimeout(() => settle(current), TRANSITION_MS + 80);
    slot.addEventListener('transitionend', end);
    current.cleanup = () => { slot.removeEventListener('transitionend', end); win.clearTimeout(timer); };
  }
  function goTo(stage, initial = false) {
    if (!session || !session.sequence.includes(stage)) return false;
    const current = session;
    const outgoing = current.slots.find((slot) => slot.classList.contains('is-current'));
    const incoming = initial ? current.slots[0] : current.slots.find((slot) => slot !== outgoing);
    current.stageId = stage;
    current.overlay.dataset.stage = stage;
    current.overlay.setAttribute('aria-label', STEP3_ONBOARDING_STAGES[stage].message);
    current.live.textContent = STEP3_ONBOARDING_STAGES[stage].message;
    current.root.classList.toggle(FINAL, isFinalStep3OnboardingStage(stage));
    current.placement = stageSlot(incoming, stage);
    startPlacementWatch(stage);
    incoming.classList.add('is-current', 'is-entering');
    if (initial) { win.requestAnimationFrame(() => incoming.classList.remove('is-entering')); return true; }
    current.transitioning = true;
    outgoing?.classList.add('is-leaving');
    // Release the interaction lock from the tap itself, not from inside the rAF callback: rAF can be
    // throttled or paused (background tab, fake-clock QA), and the lock must ALWAYS release after the
    // presentation transition so the next deliberate tap is never swallowed.
    waitForSlot(current, incoming);
    win.requestAnimationFrame(() => { incoming.classList.remove('is-entering'); outgoing?.classList.remove('is-current'); });
    win.setTimeout(() => outgoing?.classList.remove('is-leaving'), TRANSITION_MS + 20);
    return true;
  }
  function detach(current) {
    doc.removeEventListener('click', current.tap, true);
    win.removeEventListener('resize', current.viewport);
    win.removeEventListener('orientationchange', current.viewport);
    win.removeEventListener('scroll', current.viewport, true);
    if (current.visualViewport) {
      current.visualViewport.removeEventListener('resize', current.viewport);
      current.visualViewport.removeEventListener('scroll', current.viewport);
    }
    stopPlacementWatch();
    current.observer?.disconnect(); current.cleanup?.();
  }
  function complete(reason) {
    const current = session;
    if (!current) return false;
    const final = isFinalStep3OnboardingStage(current.stageId);
    detach(current); current.root.classList.remove(ACTIVE, FINAL); session = null;
    if (final) {
      const time = now(), previous = readState() || {};
      writeState({ version: STEP3_ONBOARDING_REPLAY_VERSION, ...previous, lastActivityAt: time, lastCompletionAt: time, lastDisplayAt: previous.lastDisplayAt || time, lastCalendarDate: bangkokDate(time) });
      try { storage?.setItem(STEP3_ONBOARDING_STORAGE_KEY, STEP3_ONBOARDING_STORAGE_VALUE); } catch {}
    }
    current.overlay.classList.add('is-leaving');
    const remove = () => current.overlay.remove();
    current.overlay.addEventListener('transitionend', (event) => { if (event.target === current.overlay && event.propertyName === 'opacity') remove(); }, { once: true });
    win.setTimeout(remove, DISMISS_MS + 80);
    if (reason !== 'lucky-cta') resume();
    return true;
  }
  function abort(reason) { const current = session; if (!current) return false; detach(current); current.root.classList.remove(ACTIVE, FINAL); session = null; current.overlay.remove(); resume(reason); return true; }
  function consume(event) { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); }
  function onTap(event) {
    if (!session) return;
    if (session.transitioning || Number(event.detail) > 1) { consume(event); return; }
    if (isFinalStep3OnboardingStage(session.stageId)) {
      const lucky = entry();
      if (lucky && (event.target === lucky || lucky.contains(event.target))) { complete('lucky-cta'); return; }
      consume(event); complete('lucky-outside-tap'); return;
    }
    consume(event);
    const next = nextStep3OnboardingStage(session.stageId, session.sequence);
    next === ST.COMPLETE ? complete('sequence-end') : goTo(next);
  }
  function startNow(time) {
    if (session || doc.querySelector('.' + OVERLAY) || !safe()) return false;
    const stepRoot = root(), sequence = plan();
    if (!stepRoot?.classList.contains('active') || !entry() || sequence.at(-1) !== ST.LUCKY_GUIDE) return false;
    suspendHints();
    const overlay = buildOverlay();
    session = { root: stepRoot, overlay, sequence, stageId: null, slots: [...overlay.querySelectorAll('.' + OVERLAY + '-slot')], live: overlay.querySelector('.' + OVERLAY + '-status'), placement: null, transitioning: false, cleanup: null };
    session.tap = onTap; session.viewport = schedulePlace;
    doc.addEventListener('click', session.tap, true); win.addEventListener('resize', session.viewport); win.addEventListener('orientationchange', session.viewport); win.addEventListener('scroll', session.viewport, true);
    // Android Chrome reports URL-bar collapses and pinch/zoom through the visual viewport only.
    if (win.visualViewport) {
      session.visualViewport = win.visualViewport;
      session.visualViewport.addEventListener('resize', session.viewport);
      session.visualViewport.addEventListener('scroll', session.viewport);
    }
    if (typeof MutationObserver !== 'undefined') { session.observer = new MutationObserver(() => { if (!root()?.classList.contains('active')) abort('step3-inactive'); }); session.observer.observe(stepRoot, { attributes: true, attributeFilter: ['class'] }); }
    pause(); stepRoot.classList.add(ACTIVE);
    writeState({ version: STEP3_ONBOARDING_REPLAY_VERSION, ...(readState() || {}), lastActivityAt: time, lastDisplayAt: time, lastCalendarDate: bangkokDate(time) });
    return goTo(sequence[0], true);
  }
  function maybeStart(options = {}) {
    const force = options === true || Boolean(options?.force);
    if (!doc || !win || session || startPending || !root()?.classList.contains('active') || (!force && visitEvaluated)) return false;
    // renderStep3 can call us while its Lucky entry is still being mounted. That
    // is not a visit decision; leave the guard untouched until every real target
    // is available so the completed render can start the tour once.
    const readyPlan = plan();
    if (!entry() || readyPlan.at(-1) !== ST.LUCKY_GUIDE) return false;
    const time = now();
    const replay = eligibility(time); // must run before this visit overwrites activity.
    if (!force && !replay.eligible) {
      visitEvaluated = true;
      replayDeferred = false;
      recordActivity(time, true);
      return false;
    }
    // Do not overwrite the previous activity timestamp when an eligible tour is
    // deferred by Lucky. That preserves eligibility until a safe Step 3 return.
    if (!safe()) { replayDeferred = true; return false; }
    visitEvaluated = true;
    replayDeferred = false;
    recordActivity(time, true);
    // Preloading begins at controller construction (well before Step 3 for normal
    // visitors). Do not make a user wait behind a stalled decode promise: each
    // persistent slot still receives the same cached source and never unmounts.
    startPending = true;
    const started = startNow(time);
    startPending = false;
    return started;
  }
  function onActivity() { if (root()?.classList.contains('active') && !session && !replayDeferred) recordActivity(); }
  function onReturn() {
    if (doc.visibilityState === 'hidden' || !root()?.classList.contains('active') || session) return;
    // A real foreground return is a new replay evaluation point, whereas an
    // ordinary Step 3 render remains protected by visitEvaluated.
    if (replayDeferred || eligibility(now()).eligible) visitEvaluated = false;
    maybeStart();
  }
  doc?.addEventListener('pointerdown', onActivity, true);
  doc?.addEventListener('keydown', onActivity, true);
  doc?.addEventListener('visibilitychange', onReturn);
  win?.addEventListener('focus', onReturn);
  // Step 3's Lucky entry is mounted during rendering. Observe only until the
  // current visit has been decided, so mount ordering cannot lose a first tour
  // and ordinary component re-renders cannot restart one.
  if (typeof MutationObserver !== 'undefined' && doc?.body) {
    const mountObserver = new MutationObserver(() => {
      if (!visitEvaluated && !session && root()?.classList.contains('active') && entry()) maybeStart();
    });
    mountObserver.observe(doc.body, { childList: true, subtree: true });
  }
  if (win) preloadAssets();
  const api = Object.freeze({ maybeStart, isActive: () => Boolean(session), current: () => session?.stageId || null, sequence: () => session?.sequence.slice() || plan(), placement: () => session?.placement || null, advance: () => session && !session.transitioning ? goTo(nextStep3OnboardingStage(session.stageId, session.sequence)) : false, goTo: (stage) => goTo(stage), complete: (reason) => complete(reason || 'qa-complete'), abort, isCompleted: () => Boolean(readState()?.lastCompletionAt), replayState: readState, replayEligibility: () => eligibility(now()), reset: () => { try { storage?.removeItem(STEP3_ONBOARDING_REPLAY_STORAGE_KEY); storage?.removeItem(STEP3_ONBOARDING_STORAGE_KEY); } catch {} visitEvaluated = false; } });
  if (win) win.__step3Onboarding = Object.freeze({ states: ST, stages: STEP3_ONBOARDING_STAGES, sequence: (options) => buildStep3OnboardingSequence(options), isActive: api.isActive, current: api.current, placement: api.placement, isCompleted: api.isCompleted, replayState: api.replayState, replayEligibility: api.replayEligibility, start: maybeStart, advance: api.advance, goTo: api.goTo, complete: api.complete, abort: api.abort, reset: api.reset, debug: () => ({ visitEvaluated, startPending, rootActive: Boolean(root()?.classList.contains('active')), hasEntry: Boolean(entry()), plan: plan(), safe: safe(), overlay: Boolean(doc?.querySelector('.' + OVERLAY)) }) });
  return api;
}
let shared = null;
export function getStep3OnboardingController(deps) { if (!shared) shared = createStep3OnboardingController(deps); return shared; }
