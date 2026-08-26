# Phase 6A.1A — Step 2 and canonical size-mode state

## Scope and safety

This isolated promotion-branch change completes only Step 2 size selection and the Step 2-to-Step 3 state transition. It does not modify production main, deployment, server validation, geometry, pricing, order payloads, LINE callback state, CRM, Step 4, checkout, or Stripe.

## Implemented

- Fresh customization state sets `beadSize` to `null`; no card is active until the customer explicitly selects one.
- Step 2 cards remain in the approved order: Mixed, 10mm, 6mm, 4mm. The Mixed card copy is `คละไซส์` / `สนุก มีมิติ`.
- Next on Step 2 blocks in place with `กรุณาเลือกขนาดหินก่อน` when the bead size is unset.
- Explicit selections use the canonical values `mixed`, `10`, `6`, and `4`; rendering preserves that selection after navigating back from Step 3.
- Fixed-to-mixed retains the ordered placed stones and their physical sizes, and initializes `mixedPlacingSize` from the previous fixed selection.
- Mixed-to-fixed calls the shared validation hook before changing state. Unsupported stone variants block without replacing or removing placed stones. Overflow trimming remains intentionally deferred to its later scoped phase.
- Removed unused imports for later geometry/pricing/trim work so this slice does not introduce dependencies on those incomplete modules.

## Verification

- `node --check app.js` — pass
- `node --check mixed-size-state.js` — pass
- `node --test tests/production-mixed-step2-state.test.mjs` — 7 passing
- `git diff --check` — pass

## Production safety

- Production main remains on `0e958ff63b322b179e8184c4c6640fb22518756a` and was not changed.
- No production deployment was triggered.
- No production backend, LINE/OA, Step 4, checkout, analytics, or CRM behavior was modified.

## Deferred

Step 3 catalog filtering and selector behavior are intentionally deferred to Phase 6A.1B.
