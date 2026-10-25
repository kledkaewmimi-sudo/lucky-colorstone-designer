// Step 3 first-time onboarding — explicit deterministic state machine.
//
// This module is pure data + pure functions: no DOM, no timers, no storage.
// It exists so the onboarding sequence, durations and the "Lucky is ALWAYS the
// final stage" owner rule can be unit tested in node without a browser.
//
// Owner flow (LUCKY FINAL is a hard requirement):
//   non-mixed : COMPONENT_GUIDE -> NEXT_GUIDE -> LUCKY_GUIDE -> COMPLETE
//   mixed     : COMPONENT_GUIDE -> SIZE_GUIDE -> NEXT_GUIDE -> LUCKY_GUIDE -> COMPLETE
//
// Owner review 2026-10-08 (tap-only): every stage is advanced by ONE user tap and by nothing else.
// There is no timer, no countdown and no automatic dismissal anywhere in this flow, so a stage stays
// on screen until the user taps again. `durationMs` is kept only as the historical record of the
// retired timer behaviour and is never used to move the tour forward.
//
// There is intentionally NO visible step counter (no 1/4, 2/4, 3/4, 4/4 and no
// 1/3, 2/3, 3/3) anywhere in this flow.

export const STEP3_ONBOARDING_STATES = Object.freeze({
  COMPONENT_GUIDE: 'COMPONENT_GUIDE',
  SIZE_GUIDE: 'SIZE_GUIDE',
  NEXT_GUIDE: 'NEXT_GUIDE',
  LUCKY_GUIDE: 'LUCKY_GUIDE',
  COMPLETE: 'COMPLETE'
});

// Versioned first-time flag. A future onboarding revision increments to _v2/_v3
// instead of reusing an unversioned generic key.
export const STEP3_ONBOARDING_STORAGE_KEY = 'lucky_step3_onboarding_v1';
export const STEP3_ONBOARDING_STORAGE_VALUE = 'completed';
// v2 is deliberately a separate state record: v1 was a permanent completion
// sentinel, while v2 supports a respectful returning-visitor replay policy.
export const STEP3_ONBOARDING_REPLAY_STORAGE_KEY = 'lucky_step3_onboarding_v2';
export const STEP3_ONBOARDING_REPLAY_VERSION = 2;
export const STEP3_ONBOARDING_INACTIVITY_MS = 120 * 60 * 1000;
export const STEP3_ONBOARDING_TIME_ZONE = 'Asia/Bangkok';

// RETIRED stage durations (owner numbers from the timer-based flow). Auto-advance was removed on
// 2026-10-08, so nothing reads these numbers any more; they are retained so the historical timings
// stay documented and any future reinstatement is an explicit decision.
export const STEP3_ONBOARDING_DURATION_MS = Object.freeze({
  COMPONENT_GUIDE: 3000,
  SIZE_GUIDE: 3000,
  NEXT_GUIDE: 3000,
  LUCKY_GUIDE: 10000
});

const ONBOARDING_ASSETS = '/assets/lucky/onboarding';
// Owner replaced these two files IN PLACE (same names, new artwork). A stable version token keeps
// browsers/CDNs from serving the previous bytes; the two untouched assets keep their plain URL.
const ONBOARDING_ASSET_REVISION = '20261008';
// Owner replaced the first onboarding artwork in place again on 2026-10-11 (same filename, new
// artwork), so that single asset carries its own token and the untouched assets keep the 20261008 URL.
const ONBOARDING_UI_OVERLAY_REVISION = '20261011';

// Each state declares: id, real DOM target, approved transparent asset, duration,
// next (resolved by the sequence) and the interaction behaviour the controller
// must apply.
//
// `anchor` describes where the baked UI graphic sits INSIDE the approved asset,
// as fractions of the asset's natural box. The controller uses it to place the
// asset on top of the REAL element with getBoundingClientRect() — never from a
// hardcoded screenshot coordinate.
export const STEP3_ONBOARDING_STAGES = Object.freeze({
  COMPONENT_GUIDE: Object.freeze({
    id: STEP3_ONBOARDING_STATES.COMPONENT_GUIDE,
    target: '#catalogTypeFilter',
    asset: ONBOARDING_ASSETS + '/Kawaii Star Tutorial UI Overlay.webp?v=' + ONBOARDING_UI_OVERLAY_REVISION,
    message: 'หรือเลือกองค์ประกอบที่ชอบด้วยตัวเองได้ที่นี่',
    durationMs: 3000,
    autoAdvance: false,
    interaction: 'tap-to-advance',
    naturalWidth: 1774,
    naturalHeight: 887,
    anchor: Object.freeze({ centerX: 0.5017, centerY: 0.8535, widthRatio: 0.8117 }),
    // Owner report 2026-10-13 (Turn 10.6): on the first onboarding screen the illustration group
    // reached past the left and right viewport edges on a narrow phone. The guide bar keeps its exact
    // anchored scale - it must still wrap the real #catalogTypeFilter row - while the illustration
    // above the bar is drawn as its own layer at `scale` of that box, centred on the same anchor axis
    // and bottom-anchored on the bar's top edge, so the star, wand, sparkles and speech bubble stay
    // inside the viewport without shrinking the guide.
    //
    // cutRatio is the measured top edge of the baked guide bar inside this asset (alpha-bounding-box and
    // colour-probe evidence in reports/production/turn10/evidence/turn10-6).
    illustrationLayer: Object.freeze({ cutRatio: 0.7355, scale: 0.85 })
  }),
  SIZE_GUIDE: Object.freeze({
    id: STEP3_ONBOARDING_STATES.SIZE_GUIDE,
    target: '#mixedSizeSelectorBar',
    asset: ONBOARDING_ASSETS + '/Kawaii Star Tutorial Selection Banner.webp',
    message: 'เลือกขนาดหินให้เข้ากับสไตล์ของคุณ',
    durationMs: 3000,
    autoAdvance: false,
    interaction: 'tap-to-advance',
    naturalWidth: 1774,
    naturalHeight: 887,
    anchor: Object.freeze({ centerX: 0.4916, centerY: 0.8538, widthRatio: 0.8929 })
  }),
  NEXT_GUIDE: Object.freeze({
    id: STEP3_ONBOARDING_STATES.NEXT_GUIDE,
    target: '#btnNext',
    asset: ONBOARDING_ASSETS + '/Thai Tutorial CTA Sticker.webp?v=' + ONBOARDING_ASSET_REVISION,
    message: 'พอได้กำไลที่ชอบแล้ว กดถัดไปเพื่อดูเรื่องราวของกำไล',
    durationMs: 3000,
    autoAdvance: false,
    interaction: 'intercept-next',
    // Owner artwork revision 2026-10-08 is 1536x1024; the baked red button spans x 458..1179,
    // y 845..970 (measured), so the anchor is the red fill, not the previous portrait sticker.
    naturalWidth: 1536,
    naturalHeight: 1024,
    // Owner review 2026-10-08 (second pass): the whole artwork must NOT be shrunk to fit, because
    // that made the baked red button visibly smaller than the real Next button. The art is instead
    // scaled so the baked button EXACTLY matches the real button (width = targetWidth / widthRatio)
    // and is then positioned concentrically on it; the transparent padding of the artwork absorbs
    // the horizontal overflow. contentRightRatio marks the right-most opaque pixel of the mascot so
    // QA can prove the character is never cut by the viewport edge.
    // Measured on the owner artwork: the opaque content spans x 0.1211..0.9089 and the real Next
    // button is right aligned in the Step 3 footer, so the mascot sits to the right of the button.
    // Exact button matching (owner request: stop showing a shrunken baked button) therefore puts the
    // right edge of the star 43-55px past the viewport on 360-430px phones. The alternative - fit
    // the whole star - needs a 320-374px art box, which shrinks the baked button to ~73% of the real
    // one, i.e. exactly the problem the owner reported. Exact matching is the chosen default and the
    // trade-off is documented in reports/uat/step3-refinement-20261008 for owner review.
    // Owner review 2026-10-08 (second pass): the artwork is drawn as TWO independently positioned
    // layers of the SAME asset, because the mascot sits to the right of the (right-aligned) real
    // button and a single composite cannot both match the button and keep the star on screen.
    //   * button layer   : the red button + its ring, clipped out and placed exactly on the real
    //                      button (size and centre identical);
    //   * content layer  : the speech bubble + arrow + mascot, clipped so the button region is not
    //                      drawn twice, positioned independently so the whole star stays inside the
    //                      viewport at (practically) full scale.
    splitLayers: Object.freeze({
      // inset(top right bottom left) of the button-focused region inside the artwork
      buttonInset: Object.freeze({ top: 0.775, right: 0.195, bottom: 0, left: 0.272 }),
      // region kept by the content layer: everything except that button rectangle
      contentPolygon: Object.freeze([
        Object.freeze([0, 0]), Object.freeze([1, 0]), Object.freeze([1, 1]),
        Object.freeze([0.805, 1]), Object.freeze([0.805, 0.775]),
        Object.freeze([0.272, 0.775]), Object.freeze([0.272, 1]), Object.freeze([0, 1])
      ]),
      contentLeftRatio: 0.1211,
      contentRightRatio: 0.9089,
      marginPx: 8
    }),
    contentRightRatio: 0.9089,
    contentLeftRatio: 0.1211,
    minTapTargetWidthRatio: 0.9,
    anchor: Object.freeze({ centerX: 0.5329, centerY: 0.8862, widthRatio: 0.4701 })
  }),
  LUCKY_GUIDE: Object.freeze({
    id: STEP3_ONBOARDING_STATES.LUCKY_GUIDE,
    target: '#stepView3 .lumi-center-entry',
    asset: ONBOARDING_ASSETS + '/Lucky Star Tap Guide.webp?v=' + ONBOARDING_ASSET_REVISION,
    message: 'ไม่รู้จะเริ่มยังไง? แตะ Lucky ให้ช่วยออกแบบได้เลย',
    durationMs: 10000,
    autoAdvance: false,
    interaction: 'lucky-cta-final',
    // Owner artwork revision 2026-10-08 is 1536x1024; the baked tap circle spans x 694..1100,
    // y 151..553 (measured), so the anchor is that circle.
    naturalWidth: 1536,
    naturalHeight: 1024,
    maxViewportWidthRatio: 1.0,
    anchor: Object.freeze({ centerX: 0.5840, centerY: 0.3438, widthRatio: 0.2650 })
  })
});

// How much of the asset may bleed outside the viewport before the controller
// clamps it back in. Expressed as a fraction of the asset's own width/height so
// the composition rule stays aspect independent.
const DEFAULT_BLEED = Object.freeze({ left: 0.06, right: 0.06, top: 0.05, bottom: 0.05 });
export const STEP3_ONBOARDING_BLEED = Object.freeze({
  COMPONENT_GUIDE: Object.freeze({ left: 0.08, right: 0.08, top: 0.05, bottom: 0.05 }),
  SIZE_GUIDE: Object.freeze({ left: 0.08, right: 0.08, top: 0.05, bottom: 0.05 }),
  // The 2026-10-08 Next artwork is landscape (1536x1024) and its baked red button is 47% of the
  // asset width, so matching the real button (about 222px on a 390px phone) needs a ~475px asset.
  // The bleed budget is deliberately wide on both sides so that art box is NOT clamped sideways:
  // the baked button keeps sitting exactly on the real button, the surrounding transparent padding
  // absorbs the overflow, and the mascot (right-most opaque pixel = 0.906 of the art width) still
  // lands inside the viewport at 360-430px widths.
  NEXT_GUIDE: Object.freeze({ left: 0.22, right: 0.22, top: 0.06, bottom: 0.18 }),
  // The Lucky guide is anchored on the centre CTA, which sits at the horizontal
  // centre of the viewport while the approved artwork keeps its hero star on the
  // left. A slightly larger left bleed keeps the baked ring concentric with the
  // REAL Lucky CTA instead of drifting off it on narrow phones.
  LUCKY_GUIDE: Object.freeze({ left: 0.20, right: 0.20, top: 0.06, bottom: 0.06 })
});

/**
 * Ordered onboarding sequence for the current Step 2 configuration.
 * SIZE_GUIDE only exists when Step 2 selected MIXED.
 */
export function buildStep3OnboardingSequence({ mixed = false } = {}) {
  const sequence = [STEP3_ONBOARDING_STATES.COMPONENT_GUIDE];
  if (mixed) sequence.push(STEP3_ONBOARDING_STATES.SIZE_GUIDE);
  sequence.push(STEP3_ONBOARDING_STATES.NEXT_GUIDE, STEP3_ONBOARDING_STATES.LUCKY_GUIDE);
  return sequence;
}

/** The next stage id, or COMPLETE at the end of the flow. */
export function nextStep3OnboardingStage(stageId, sequence) {
  if (stageId === STEP3_ONBOARDING_STATES.COMPLETE) return STEP3_ONBOARDING_STATES.COMPLETE;
  const list = Array.isArray(sequence) && sequence.length ? sequence : buildStep3OnboardingSequence();
  const index = list.indexOf(stageId);
  if (index === -1) return list[0];
  return index + 1 < list.length ? list[index + 1] : STEP3_ONBOARDING_STATES.COMPLETE;
}

/** True when the id is the final, owner-mandated Lucky hero stage. */
export function isFinalStep3OnboardingStage(stageId) {
  return stageId === STEP3_ONBOARDING_STATES.LUCKY_GUIDE;
}

export function getStep3OnboardingBleed(stageId) {
  return STEP3_ONBOARDING_BLEED[stageId] || DEFAULT_BLEED;
}

/**
 * Places the approved asset so its baked UI graphic lands on the REAL target
 * element. Pure geometry: input rects, output the art box (viewport coordinates).
 */
export function resolveStep3OnboardingPlacement({ targetRect, assetSize, anchor }) {
  const targetWidth = Math.max(0, Number(targetRect?.width) || 0);
  const assetWidth = Math.max(1, Number(assetSize?.width) || 1);
  const assetHeight = Math.max(1, Number(assetSize?.height) || 1);
  const widthRatio = Math.max(0.01, Number(anchor?.widthRatio) || 1);
  const width = targetWidth / widthRatio;
  const height = width * (assetHeight / assetWidth);
  const centerX = Number.isFinite(Number(anchor?.centerX)) ? Number(anchor.centerX) : 0.5;
  const centerY = Number.isFinite(Number(anchor?.centerY)) ? Number(anchor.centerY) : 0.5;
  const left = (targetWidth / 2 + (Number(targetRect?.left) || 0)) - centerX * width;
  const top = ((Number(targetRect?.height) || 0) / 2 + (Number(targetRect?.top) || 0)) - centerY * height;
  return { left, top, width, height };
}

/** Keeps the art box from drifting further outside the viewport than allowed. */
export function clampStep3OnboardingPlacement(placement, bleed, viewport) {
  const width = Math.max(1, Number(placement?.width) || 1);
  const height = Math.max(1, Number(placement?.height) || 1);
  const viewWidth = Math.max(1, Number(viewport?.width) || 1);
  const viewHeight = Math.max(1, Number(viewport?.height) || 1);
  const limits = bleed || DEFAULT_BLEED;
  const minLeft = -Math.abs(limits.left || 0) * width;
  const maxLeftRaw = viewWidth - width + Math.abs(limits.right || 0) * width;
  const minTop = -Math.abs(limits.top || 0) * height;
  const maxTopRaw = viewHeight - height + Math.abs(limits.bottom || 0) * height;
  const maxLeft = Math.max(minLeft, maxLeftRaw);
  const maxTop = Math.max(minTop, maxTopRaw);
  return {
    left: Math.min(Math.max(Number(placement?.left) || 0, minLeft), maxLeft),
    top: Math.min(Math.max(Number(placement?.top) || 0, minTop), maxTop),
    width,
    height
  };
}
