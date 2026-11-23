// Step 3 first-time onboarding controller.
//
// Presentation/tutorial layer only. It reads the REAL Step 3 DOM (component tabs,
// mixed size selector, "ถัดไป" button, Lucky centre CTA), dims the page with a
// fixed overlay and anchors the owner-approved transparent artwork onto those
// real elements. It never mutates the design, catalog, pricing, size selection,
// recommendation, order payload or checkout state.
//
// The flow itself lives in ./step3-onboarding-machine.js so the sequence and the
// "Lucky is always the final stage" rule stay deterministic and unit testable.

import {
  STEP3_ONBOARDING_STATES as ST,
  STEP3_ONBOARDING_STAGES,
  STEP3_ONBOARDING_STORAGE_KEY,
  STEP3_ONBOARDING_STORAGE_VALUE,
  buildStep3OnboardingSequence,
  nextStep3OnboardingStage,
  isFinalStep3OnboardingStage,
  getStep3OnboardingBleed,
  resolveStep3OnboardingPlacement,
  clampStep3OnboardingPlacement
} from './step3-onboarding-machine.js';

const OVERLAY_CLASS = 'step3-onboarding';
const ACTIVE_ROOT_CLASS = 'lucky-onboarding-active';
const FINAL_ROOT_CLASS = 'lucky-onboarding-lucky';
const FADE_OUT_MS = 220;
// Owner review 2026-10-08 (tap-only pass):
//   * a stage is advanced by ONE user tap and by nothing else - no timer, no countdown and no
//     automatic dismissal; the stage stays until the user taps again;
//   * a stage has no entrance animation, so switching stages cannot flash or pop;
//   * the tour starts at most once per page session, so a Step 3 re-render can never make it
//     disappear and reappear (the owner-reported show-hide-show behaviour);
//   * one tap can never advance two stages (duplicate synthetic events are swallowed);
//   * tapping the highlighted Lucky CTA on the final stage completes the tour AND lets the
//     existing Lucky CTA handler open the assistant - one intentional gesture, two effects.
const STEP3_ROOT_ID = 'stepView3';
const LUCKY_ENTRY_SELECTOR = '#stepView3 .lumi-center-entry';

function resolveStorage(target) {
  try {
    return target && target.localStorage ? target.localStorage : null;
  } catch (error) {
    return null;
  }
}

export function createStep3OnboardingController(deps = {}) {
  const view = deps.window || (typeof window !== 'undefined' ? window : null);
  const doc = deps.document || (view ? view.document : null);
  const storage = deps.storage !== undefined ? deps.storage : resolveStorage(view);
  const isMixed = typeof deps.isMixed === 'function' ? deps.isMixed : () => false;
  const pauseCtaTimeline = typeof deps.pauseCtaTimeline === 'function' ? deps.pauseCtaTimeline : () => {};
  const resumeCtaTimeline = typeof deps.resumeCtaTimeline === 'function' ? deps.resumeCtaTimeline : () => {};
  const suspendLegacyHints = typeof deps.suspendLegacyHints === 'function' ? deps.suspendLegacyHints : () => {};

  let session = null;
  // One-gesture guard for the tap-only flow (see handleTap). Never clock based.
  let tapGuard = false;

  const readCompleted = () => {
    try {
      return storage ? storage.getItem(STEP3_ONBOARDING_STORAGE_KEY) === STEP3_ONBOARDING_STORAGE_VALUE : false;
    } catch (error) {
      return false;
    }
  };
  const markCompleted = () => {
    try {
      storage?.setItem(STEP3_ONBOARDING_STORAGE_KEY, STEP3_ONBOARDING_STORAGE_VALUE);
    } catch (error) {
      /* presenting only: a blocked storage must never break Step 3 */
    }
  };
  const clearCompleted = () => {
    try {
      storage?.removeItem(STEP3_ONBOARDING_STORAGE_KEY);
    } catch (error) {
      /* ignore */
    }
  };

  const getRoot = () => (doc ? doc.getElementById(STEP3_ROOT_ID) : null);
  const getEntry = () => (doc ? doc.querySelector(LUCKY_ENTRY_SELECTOR) : null);

  function getTarget(stageId) {
    if (stageId === ST.LUCKY_GUIDE) return getEntry();
    const definition = STEP3_ONBOARDING_STAGES[stageId];
    return definition && doc ? doc.querySelector(definition.target) : null;
  }

  // SIZE_GUIDE only exists for a MIXED Step 2 configuration; the plan also drops
  // any stage whose real target is not present on the page.
  function buildPlan() {
    const plan = buildStep3OnboardingSequence({ mixed: Boolean(isMixed()) });
    return plan.filter((stageId) => {
      const target = getTarget(stageId);
      if (!target) return false;
      if (stageId === ST.SIZE_GUIDE) return !target.hidden;
      return true;
    });
  }

  function clearTimer() {
    if (session?.timerId) {
      view.clearTimeout(session.timerId);
      session.timerId = null;
    }
  }

  function clearSettle() {
    if (!session) return;
    (session.settleTimers || []).forEach((id) => view.clearTimeout(id));
    (session.settleFrames || []).forEach((id) => {
      if (typeof view.cancelAnimationFrame === 'function') view.cancelAnimationFrame(id);
    });
    session.settleTimers = [];
    session.settleFrames = [];
  }

  function buildOverlay() {
    const overlay = doc.createElement('div');
    overlay.className = OVERLAY_CLASS;
    overlay.setAttribute('role', 'presentation');
    overlay.dataset.stage = '';
    overlay.innerHTML = ''
      + '<div class="' + OVERLAY_CLASS + '-backdrop" aria-hidden="true"></div>'
      + '<div class="' + OVERLAY_CLASS + '-art" aria-hidden="true">'
      + '<img alt="" decoding="async" draggable="false">'
      + '</div>'
      + '<p class="' + OVERLAY_CLASS + '-status" role="status" aria-live="polite"></p>';
    doc.body.appendChild(overlay);
    // Second layer of the SAME artwork, used by stages that must place the button-focused region and
    // the mascot independently (NEXT_GUIDE). Built with DOM calls so the markup stays quote-safe.
    const mascotLayer = doc.createElement('div');
    mascotLayer.className = OVERLAY_CLASS + '-mascot';
    mascotLayer.setAttribute('aria-hidden', 'true');
    const mascotImage = doc.createElement('img');
    mascotImage.alt = '';
    mascotImage.setAttribute('decoding', 'async');
    mascotImage.setAttribute('draggable', 'false');
    mascotLayer.appendChild(mascotImage);
    overlay.insertBefore(mascotLayer, overlay.querySelector('.' + OVERLAY_CLASS + '-status'));
    return overlay;
  }

  function placeArt() {
    if (!session || !session.stageId) return null;
    const definition = STEP3_ONBOARDING_STAGES[session.stageId];
    const target = getTarget(session.stageId);
    if (!definition || !target || !session.art) return null;
    const rect = target.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    const image = session.artImage;
    const assetSize = {
      width: (image && image.naturalWidth) || definition.naturalWidth,
      height: (image && image.naturalHeight) || definition.naturalHeight
    };
    const placement = resolveStep3OnboardingPlacement({ targetRect: rect, assetSize, anchor: definition.anchor });
    // Owner-artwork safety budget: never let the overlay art grow past the stage's share of the
    // viewport. When it would, the art is scaled down around the SAME anchor, so the baked graphic
    // stays centred on the real target instead of drifting away from it.
    const capRatio = Number(definition.maxViewportWidthRatio);
    let fitted = placement;
    if (Number.isFinite(capRatio) && capRatio > 0) {
      const maxWidth = view.innerWidth * capRatio;
      if (placement.width > maxWidth) {
        const scale = maxWidth / placement.width;
        const width = placement.width * scale;
        const height = placement.height * scale;
        fitted = {
          width,
          height,
          left: (rect.left + rect.width / 2) - definition.anchor.centerX * width,
          top: (rect.top + rect.height / 2) - definition.anchor.centerY * height
        };
      }
    }
    const clamped = clampStep3OnboardingPlacement(fitted, getStep3OnboardingBleed(session.stageId), {
      width: view.innerWidth,
      height: view.innerHeight
    });
    session.art.style.width = clamped.width + 'px';
    session.art.style.height = clamped.height + 'px';
    session.art.style.left = Math.round(clamped.left) + 'px';
    session.art.style.top = Math.round(clamped.top) + 'px';
    // Stages with splitLayers draw the SAME artwork twice: the button-focused region here (exactly on
    // the real button) and the bubble/arrow/mascot in the second layer, positioned independently so
    // the mascot is never clipped by the viewport edge.
    const split = definition.splitLayers;
    let contentPlacement = null;
    if (session.content && session.contentImage) {
      if (split) {
        const inset = split.buttonInset;
        session.art.style.clipPath = 'inset(' + (inset.top * 100).toFixed(3) + '% ' + (inset.right * 100).toFixed(3) + '% ' + (inset.bottom * 100).toFixed(3) + '% ' + (inset.left * 100).toFixed(3) + '%)';
        const margin = Number(split.marginPx) || 0;
        const contentSpan = Math.max(0.01, split.contentRightRatio - split.contentLeftRatio);
        // Keep the content layer at its natural scale whenever the whole composition fits; only shrink
        // it by the (tiny) remainder when a narrow phone cannot hold the full width.
        const scale = Math.min(1, (view.innerWidth - margin * 2) / (contentSpan * clamped.width));
        const contentWidth = clamped.width * scale;
        const contentHeight = clamped.height * scale;
        const contentLeft = view.innerWidth - margin - split.contentRightRatio * contentWidth;
        const buttonCentreY = clamped.top + definition.anchor.centerY * clamped.height;
        const contentTop = buttonCentreY - definition.anchor.centerY * contentHeight;
        session.content.style.display = 'block';
        session.content.style.width = contentWidth + 'px';
        session.content.style.height = contentHeight + 'px';
        session.content.style.left = Math.round(contentLeft) + 'px';
        session.content.style.top = Math.round(contentTop) + 'px';
        session.content.style.clipPath = 'polygon(' + split.contentPolygon.map(([x, y]) => (x * 100).toFixed(3) + '% ' + (y * 100).toFixed(3) + '%').join(', ') + ')';
        session.contentImage.style.width = '100%';
        session.contentImage.style.height = '100%';
        contentPlacement = {
          left: Math.round(contentLeft),
          top: Math.round(contentTop),
          width: Math.round(contentWidth),
          height: Math.round(contentHeight),
          scale: Number(scale.toFixed(4))
        };
      } else {
        session.art.style.clipPath = '';
        session.content.style.display = 'none';
        session.content.style.clipPath = '';
      }
    }
    session.placement = {
      stage: session.stageId,
      content: contentPlacement,
      art: { left: Math.round(clamped.left), top: Math.round(clamped.top), width: Math.round(clamped.width), height: Math.round(clamped.height) },
      target: { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) }
    };
    return session.placement;
  }

  let placeFrame = null;
  function schedulePlace() {
    if (!session) return;
    if (typeof view.requestAnimationFrame !== 'function') {
      placeArt();
      return;
    }
    if (placeFrame) return;
    placeFrame = view.requestAnimationFrame(() => {
      placeFrame = null;
      placeArt();
    });
  }

  function goToStage(stageId) {
    if (!session) return false;
    if (stageId === ST.COMPLETE) {
      complete('sequence-end');
      return true;
    }
    const definition = STEP3_ONBOARDING_STAGES[stageId];
    if (!definition || session.sequence.indexOf(stageId) === -1) return false;
    // The previous timer is always cleared first. The tap-only flow arms no timer at all, so
    // nothing here can advance or dismiss a stage on its own.
    clearTimer();
    clearSettle();
    session.stageId = stageId;
    session.overlay.dataset.stage = stageId;
    if (session.artImage.getAttribute('src') !== definition.asset) {
      session.artImage.setAttribute('src', definition.asset);
      session.artImage.alt = '';
    }
    if (session.contentImage && session.contentImage.getAttribute('src') !== definition.asset) {
      session.contentImage.setAttribute('src', definition.asset);
      session.contentImage.alt = '';
    }
    session.overlay.setAttribute('aria-label', definition.message);
    if (session.live.textContent !== definition.message) session.live.textContent = definition.message;
    session.root.classList.toggle(FINAL_ROOT_CLASS, isFinalStep3OnboardingStage(stageId));
    // Tap-only flow: no per-stage timer is armed here, so the stage can never auto-advance or
    // auto-dismiss. There is also no re-entry animation, which is what used to make the artwork
    // flash/pop on every stage switch.
    placeArt();
    const lateFrame = typeof view.requestAnimationFrame === 'function'
      ? view.requestAnimationFrame(() => placeArt())
      : null;
    if (lateFrame) session.settleFrames.push(lateFrame);
    session.settleTimers.push(view.setTimeout(() => placeArt(), 90));
    return true;
  }

  function advance(reason) {
    if (!session) return false;
    const nextStage = nextStep3OnboardingStage(session.stageId, session.sequence);
    if (nextStage === ST.COMPLETE) {
      complete(reason || 'sequence-end');
      return true;
    }
    return goToStage(nextStage);
  }

  function detachSessionHandlers(current) {
    if (!current) return;
    if (current.onTap) doc.removeEventListener('click', current.onTap, true);
    if (current.onViewportChange) {
      view.removeEventListener('resize', current.onViewportChange);
      view.removeEventListener('orientationchange', current.onViewportChange);
      view.removeEventListener('scroll', current.onViewportChange, true);
    }
    if (current.observer) {
      current.observer.disconnect();
      current.observer = null;
    }
  }

  function releaseSession(current) {
    clearTimer();
    clearSettle();
    detachSessionHandlers(current);
    current.root?.classList.remove(ACTIVE_ROOT_CLASS, FINAL_ROOT_CLASS);
    session = null;
  }

  function finishOverlay(current) {
    const overlay = current.overlay;
    if (!overlay) return;
    overlay.classList.add('is-leaving');
    view.setTimeout(() => overlay.remove(), FADE_OUT_MS);
  }

  // The tour is only completed from the FINAL Lucky stage, and only by a user tap: either a tap on
  // the dimmed area or a tap on the real Lucky CTA (there is no timer any more). The versioned flag
  // is written here and nowhere else.
  function complete(reason) {
    const current = session;
    if (!current) return false;
    const wasFinalStage = isFinalStep3OnboardingStage(current.stageId);
    releaseSession(current);
    if (wasFinalStage) markCompleted();
    finishOverlay(current);
    // Clicking the real Lucky CTA must hand straight over to the existing Lucky
    // assistant: the passive centre-CTA timeline is NOT restarted in that case.
    if (reason !== 'lucky-cta') resumeCtaTimeline();
    return true;
  }

  function abort(reason) {
    const current = session;
    if (!current) return false;
    releaseSession(current);
    current.overlay?.remove();
    resumeCtaTimeline(reason);
    return true;
  }

  function consumeEvent(event) {
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
  }

  function handleTap(event) {
    if (!session || !session.stageId) return;
    // Exactly one stage per physical tap. A repeated click that belongs to the same gesture carries
    // a click count above 1, and a duplicate event dispatched in the same task is caught by the
    // guard below; both are consumed and ignored so one gesture can never skip a stage. The guard is
    // deliberately clock-free so the behaviour is identical under the real and instrumented clocks.
    if (Number(event.detail) > 1 || tapGuard) {
      consumeEvent(event);
      return;
    }
    tapGuard = true;
    const releaseTapGuard = () => { tapGuard = false; };
    if (typeof queueMicrotask === 'function') queueMicrotask(releaseTapGuard);
    else Promise.resolve().then(releaseTapGuard);
    session.consumedTap = true;
    const target = event.target;
    if (isFinalStep3OnboardingStage(session.stageId)) {
      const entry = getEntry();
      if (entry && target && (target === entry || entry.contains(target))) {
        // (A) Real Lucky CTA: close the tour and let the EXISTING CTA handler run.
        complete('lucky-cta');
        return;
      }
      // (B) Anywhere else: finish the tour, open nothing.
      consumeEvent(event);
      complete('lucky-outside-tap');
      return;
    }
    // Component tabs / size / Next: this tap only advances the tour. It must not
    // change the selected tab, the selected size, or navigate to Step 4.
    consumeEvent(event);
    advance('overlay-tap');
  }

  function attachSessionHandlers(current) {
    const onTap = (event) => handleTap(event);
    current.onTap = onTap;
    doc.addEventListener('click', onTap, true);
    const onViewportChange = () => schedulePlace();
    current.onViewportChange = onViewportChange;
    view.addEventListener('resize', onViewportChange);
    view.addEventListener('orientationchange', onViewportChange);
    view.addEventListener('scroll', onViewportChange, true);
    if (typeof MutationObserver === 'function' && current.root) {
      const observer = new MutationObserver(() => {
        const root = getRoot();
        if (!root || !root.classList.contains('active')) abort('step3-inactive');
      });
      observer.observe(current.root, { attributes: true, attributeFilter: ['class'] });
      current.observer = observer;
    }
  }

  // The tour is offered at most once per page session. Step 3 can be re-rendered several times
  // (navigation, catalog refresh, resize) and the owner reported the tour disappearing and
  // reappearing; the single-start guard plus the duplicate-overlay guard make that impossible.
  let startedOnce = false;
  function maybeStart(options = {}) {
    const force = options === true || Boolean(options && options.force);
    if (!doc || !view) return false;
    if (session) return false;
    if (!force && startedOnce) return false;
    if (!force && readCompleted()) return false;
    // A stale overlay from a previous session must never be duplicated.
    if (doc.querySelector('.' + OVERLAY_CLASS)) return false;
    const root = getRoot();
    if (!root || !root.classList.contains('active')) return false;
    // The Lucky hero stage is mandatory, so a missing CTA skips the whole tour
    // (and never marks it completed) instead of ending on a weaker message.
    const entry = getEntry();
    if (!entry) return false;
    const sequence = buildPlan();
    if (!sequence.length || sequence[sequence.length - 1] !== ST.LUCKY_GUIDE) return false;

    startedOnce = true;
    suspendLegacyHints();
    const overlay = buildOverlay();
    session = {
      root,
      entry,
      sequence,
      stageId: null,
      timerId: null,
      settleTimers: [],
      settleFrames: [],
      overlay,
      art: overlay.querySelector('.' + OVERLAY_CLASS + '-art'),
      artImage: overlay.querySelector('img'),
      content: overlay.querySelector('.' + OVERLAY_CLASS + '-mascot'),
      contentImage: overlay.querySelector('.' + OVERLAY_CLASS + '-mascot img'),
      live: overlay.querySelector('.' + OVERLAY_CLASS + '-status'),
      placement: null,
      consumedTap: false,
      onTap: null,
      onViewportChange: null,
      observer: null
    };
    if (session.artImage && typeof session.artImage.addEventListener === 'function') {
      session.artImage.addEventListener('load', () => {
        if (session && session.artImage) placeArt();
      });
    }
    attachSessionHandlers(session);
    pauseCtaTimeline();
    root.classList.add(ACTIVE_ROOT_CLASS);
    goToStage(sequence[0]);
    return true;
  }

  const api = {
    maybeStart,
    isActive: () => Boolean(session),
    current: () => (session ? session.stageId : null),
    sequence: () => (session ? session.sequence.slice() : buildPlan()),
    placement: () => (session ? session.placement : null),
    advance: (reason) => advance(reason),
    goTo: (stageId) => goToStage(stageId),
    complete: (reason) => complete(reason || 'qa-complete'),
    abort: (reason) => abort(reason || 'qa-abort'),
    isCompleted: readCompleted,
    reset: clearCompleted
  };

  // Deterministic QA surface (presentation only).
  if (view) {
    view.__step3Onboarding = Object.freeze({
      states: ST,
      stages: STEP3_ONBOARDING_STAGES,
      sequence: (options) => buildStep3OnboardingSequence(options),
      isActive: () => api.isActive(),
      current: () => api.current(),
      placement: () => api.placement(),
      isCompleted: () => api.isCompleted(),
      start: (options) => api.maybeStart(options),
      advance: (reason) => api.advance(reason || 'qa-advance'),
      goTo: (stageId) => api.goTo(stageId),
      complete: () => api.complete('qa-complete'),
      abort: (reason) => api.abort(reason),
      reset: () => api.reset()
    });
  }

  return Object.freeze(api);
}

let sharedController = null;

/** App-wide singleton used by app.js when Step 3 becomes the active view. */
export function getStep3OnboardingController(deps) {
  if (!sharedController) sharedController = createStep3OnboardingController(deps);
  return sharedController;
}
