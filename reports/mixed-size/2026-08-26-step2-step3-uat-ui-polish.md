# Mixed Size Step 2 and Step 3 UAT UI Polish

Date: 2026-08-26
Branch: `uat`
Implementation commit: `b561693`

## Scope and safety

This UAT-only polish changes the customer Step 2 and Step 3 presentation in `app.js`, `index.css`, and `index.html`, with focused coverage in `tests/mixed-size-ux.test.mjs`.

- No production workspace, branch, deployment, configuration, data, or integration was changed.
- The UAT Step 4, checkout, order creation, LINE, and analytics guards were not changed.
- Mixed-size state, placement, pricing, geometry, and add/remove behavior were not changed.

## Step 3

- The existing single, full-size bracelet preview remains the only renderer for all 4mm, 6mm, 10mm, and mixed modes.
- When that sticky preview reaches the top edge of the Step 3 scrollport, a lightweight scroll-state class fades the normal `LUCKY.COLORSTONE` header and stepper away. The preview therefore occupies and visually replaces the whole top area without shrinking or switching to a compact version.
- Scrolling back above the sticky point restores the normal header and stepper with the matching transition.
- The mobile catalog tab row was reduced from 66px to 53px (about 20%); individual tabs were reduced from 56px to 45px. The gap from that row to the mixed-size strip is tightened by 5px.
- The three-size strip stays compact, in the same position below the tab row, and is still hidden without layout space for fixed 4mm, 6mm, and 10mm modes.

## Step 2

- The four cards remain one column in visual order: mixed, 10mm, 6mm, 4mm; every card keeps its right-side wrist image.
- The mixed card now uses a restrained warm-gold border, gradient, and shadow plus a small gold-star recommendation accent over its right-side wrist panel.
- Its three-bead group has an explicit shared icon column and scaled, non-overlapping beads. All card labels align to the same text column, preserving the fixed-card rhythm while keeping `คละไซส์` cleanly to the right of the icon.

## Validation

- `node --check app.js` — passed.
- `node --test tests/mixed-size-ux.test.mjs tests/mixed-size-state.test.mjs tests/mixed-size-geometry.test.mjs tests/mixed-size-pricing.test.mjs tests/mixed-size-phase5-acceptance.test.mjs tests/uat-frontend-safety.test.cjs tests/uat-backend-guard.test.cjs` — passed: 64 tests, 0 failures.
- `git diff --check` — passed.
- Live browser visual inspection was unavailable in this session; the updated focused mixed-size UI contract test passed.

## Outcome

- STEP 3 STICKY PREVIEW REACHES TOP EDGE: YES
- HEADER/STEPPER VISUALLY COVERED IN STICKY MODE: YES
- STICKY PREVIEW SIZE KEPT LARGE: YES
- STEP 3 TAB ROW HEIGHT REDUCED: YES
- GAP BETWEEN TAB ROW AND SIZE STRIP TIGHTENED: YES
- SIZE STRIP ONLY IN MIXED MODE: YES
- STEP 2 MIXED CARD EMPHASIZED WITH GOLD STAR ACCENT: YES
- STEP 2 MIXED CARD SPACING/ALIGNMENT FIXED: YES
- UAT STEP 4 BLOCK PRESERVED: YES
- PRODUCTION UNTOUCHED: YES
