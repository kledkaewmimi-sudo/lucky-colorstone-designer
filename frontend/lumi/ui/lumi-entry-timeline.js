// Step 3 Lucky center-CTA timeline (pure, presentation only).
// Owner-approved sequence:
//   0s  - 20s  PAIR                 mascot + centre text
//   20s - 30s  TEXT_ONLY            centre text only
//   30s - 70s  MASCOT_ONLY          mascot only
//   70s - 80s  TEXT_ONLY            centre text only
//   80s +      MASCOT_ONLY_PERSIST  mascot only, kept permanently
// The outer callout bubble (`.lumi-entry-tip`) is shown during the PAIR window only.
// Kept free of DOM access so it can be unit tested in node.
export const LUMI_ENTRY_STATES = Object.freeze({
  PAIR: 'pair',
  TEXT_ONLY: 'text-only',
  MASCOT_ONLY: 'mascot-only',
  MASCOT_ONLY_PERSIST: 'mascot-only-persist'
});

export const LUMI_ENTRY_BOUNDARIES = Object.freeze({
  pairEndMs: 20000,
  textAEndMs: 30000,
  mascotAEndMs: 70000,
  textBEndMs: 80000
});

export function lumiEntryStateAt(elapsedMs) {
  const elapsed = Number(elapsedMs);
  const t = Number.isFinite(elapsed) && elapsed > 0 ? elapsed : 0;
  if (t < LUMI_ENTRY_BOUNDARIES.pairEndMs) return LUMI_ENTRY_STATES.PAIR;
  if (t < LUMI_ENTRY_BOUNDARIES.textAEndMs) return LUMI_ENTRY_STATES.TEXT_ONLY;
  if (t < LUMI_ENTRY_BOUNDARIES.mascotAEndMs) return LUMI_ENTRY_STATES.MASCOT_ONLY;
  if (t < LUMI_ENTRY_BOUNDARIES.textBEndMs) return LUMI_ENTRY_STATES.TEXT_ONLY;
  return LUMI_ENTRY_STATES.MASCOT_ONLY_PERSIST;
}

export function lumiEntryCenterTextVisible(state) {
  return state === LUMI_ENTRY_STATES.PAIR || state === LUMI_ENTRY_STATES.TEXT_ONLY;
}

export function lumiEntryMascotVisible(state) {
  return state === LUMI_ENTRY_STATES.PAIR
    || state === LUMI_ENTRY_STATES.MASCOT_ONLY
    || state === LUMI_ENTRY_STATES.MASCOT_ONLY_PERSIST;
}

export function lumiEntryCalloutVisible(state) {
  return state === LUMI_ENTRY_STATES.PAIR;
}