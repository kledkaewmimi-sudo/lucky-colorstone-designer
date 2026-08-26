# UAT Step 2 / Step 3 UI Parity Release Candidate

## Scope

This UAT-only polish restores the owner-approved Step 2 presentation and Step 3 sticky preview contracts. It does not change production, LINE identity architecture, pricing, geometry, Stripe, or renderer logic.

## Previous Accepted UAT Reference

The accepted source was recovered from UAT history:

- `fe6e278` — owner-approved compact Step 2 composition, Mixed-first order, warm-gold Mixed treatment, and consistent right-side hand images.
- `b17809b` — removal of the persistent Step 3 opacity animation that created the stacking-context failure.

The current branch had retained the Step 3 animation fix but later CSS had allowed the older featured 10mm styling to supersede the accepted Mixed card composition.

## Step 2 Restored Behavior

- One compact vertical column.
- Visual order: Mixed, 10mm, 6mm, 4mm.
- Every card retains the same right-side wrist image treatment.
- Mixed retains the three-bead visual, warm-gold treatment, and star badge.
- Mixed description is exactly `สนก มมต`.
- No default bead size is selected on a fresh flow.
- Step 2 Next continues to block without an explicit selection using the existing Thai validation.

No mixed/fixed state or selection semantics changed.

## Step 3 Sticky Root Cause

The historical failure was caused by a filled Step 3 opacity animation (`step3FadeIn`). Even at opacity 1, that animation established a parent stacking context and prevented the sticky preview from painting above the header/stepper as intended.

## Step 3 Restored Behavior

- One shared, full-size `#step3PreviewCard` remains the only renderer surface.
- The preview uses `position: sticky`, `top: 0`, and a z-index above the header.
- The covered sticky state has an opaque preview root and zero exposed top corners.
- `#stepView3` remains animation-free, transform-free, filter-free, and non-isolated.
- Header/stepper return naturally when scrolling back.
- Mixed selector remains exactly 4mm / 6mm / 10mm beneath compact tabs and is hidden with zero space in fixed modes.
- The temporary query-driven sticky debug overlay is disabled for this final UAT candidate.

Sticky activation does not re-render a different renderer or recalculate bracelet geometry.

## LINE Architecture Preservation

The Landing identity-before-design gate is unchanged. Step 3 still does not initiate normal first-time identity login. The existing OA-friendship design handoff, callback recovery, and `friendFlag` gate remain unchanged.

## Mixed/Fixed Regression

Mixed selection still affects only subsequently placed stones. Existing component sizes remain physical 4/6/10 values. Fixed 4/6/10 selector hiding, catalog filtering, geometry, and renderer behavior remain covered by the relevant tests.

## Tests

Relevant UAT regression suite: **69/69 passed**.

Included Step 2 selection/state, mixed-size UX/state, renderer/geometry, pricing model, identity-before-design, OA friendship, callback bootstrap, and guest design restore tests.

Passed checks:

- `node --check app.js`
- `git diff --check`

Interactive browser capture was unavailable in this environment. Real-iPhone visual validation is intentionally retained as the owner QA gate.

## UAT Deployment

The committed UAT branch is deployed only through the linked `lucky-colorstone-uat` Vercel project at `https://uat.customize.luckycolorstone.com/`.

## Owner QA Matrix

1. Verify Landing LINE identity flow.
2. Verify Step 2 visual order, hand images, Mixed card treatment, no default selection, and validation.
3. Verify Step 3 sticky preview on fixed and mixed bracelets: full-size, top 0, covers header/stepper, and restores naturally on scroll-up.
4. Verify selector persistence across Stones, Charms, and Spacers; verify fixed zero-space hiding.
5. Verify OA-friend and existing-friend Step 4 paths.
6. Verify fresh reopen clears a previous bracelet.

## Production Promotion Gate

Production promotion remains blocked until owner approves complete real-iPhone UAT QA.

## Final Status

The UAT UI parity release candidate is ready for owner full real-iPhone testing. Production was not changed.

## Next Action

Owner performs full real-iPhone UAT QA before production promotion.
