# Phase 4 — Mixed Size pricing, summary, order, and CRM model

Date: 2026-08-25
Workspace: `D:\Projects\lucky-colorstone-uat`
Branch: `uat`

## Safety and scope

- `main` remained aligned with `origin/main` at `0e958ff63b322b179e8184c4c6640fb22518756a` before this UAT-only work.
- No production workspace, branch, catalog, Supabase write, Stripe transaction, order, LINE message, LIFF, Meta, analytics, deployment, or merge was changed.
- UAT frontend/backend safety tests pass: UAT still blocks Step 4, checkout, order creation, payment, and external production integrations.

## Per-size pricing and summary model

Added `mixed-order-model.js` as the pure client summary helper.

- Only physical sizes 4, 6, and 10 are accepted as stone variants.
- The existing `getStonePriceForSize` catalog helper is passed into the aggregation; no duplicate client pricing table was introduced.
- Aggregation key remains `stoneId_size`, keeping same-stone 4mm, 6mm, and 10mm lines distinct.
- Each aggregated stone line retains `stoneId`, display data, `size`, `quantity`, `unitPrice`, `subtotal`, and `totalPrice`.
- `buildCheckoutSummary()` now uses the canonical aggregation and includes `stoneVariants`.
- The order payload includes a compact `stoneVariants` array of `stoneId`, physical `size`, and `quantity`, plus the existing ordered `braceletSequence` / `beadMap` for previews.
- Browser prices remain display data only; the payload does not provide them as authority.

Charms and spacers remain on their existing independent pricing paths. Fixed 4mm, 6mm, and 10mm designs retain a single variant line at their fixed size.

## Fit eligibility

The derived Phase 3 layout summary is now read by a pre-checkout eligibility function.

- `-1.0mm` and `+1.0mm` are eligible.
- Values below/above those inclusive bounds return a blocked result with an underfill/overflow reason.
- Step 4 navigation and the non-UAT checkout path check this result before proceeding.
- UAT still returns at its Step 4/checkout guard before any order/payment behavior.
- The check neither adds, removes, reorders, nor resizes components.

No `ResolvedLayout` object is persisted.

## Server and CRM compatibility

Added `server-order-validation.js` for exact authoritative stone-variant validation.

- Validates only 4, 6, and 10mm.
- Validates catalog size support and the matching required `p4`, `p6`, or `p10` field.
- Rejects `mixed`, unsupported sizes, missing price fields, and any other invalid variant.
- Ignores browser-provided unit price and resolves unit price from the catalog record.
- The UAT backend route guard remains ahead of all order/checkout routes, so no UAT route was enabled.

CRM already prefers an ordered item's own `sizeMm` / `size` before any legacy global bead-size fallback. The existing sequence-first order representation therefore preserves mixed component sizes, while old fixed `beads` records remain compatible.

## Mixed-to-fixed trim audit

The existing `adjustBeadsToNewCapacity()` is deterministic and trailing-only. It is not invoked by the current mixed-to-fixed conversion path, which first validates all stone support and then changes sizes. This phase leaves that behavior unchanged; conversion overflow trimming is deferred to Phase 5 validation work rather than expanding a pricing/data-model change.

## Verification

Completed successfully:

```text
node --check app.js
node --check bracelet-geometry.js
node --check mixed-order-model.js
node --check server-order-validation.js
node --check server.js
node --test tests/mixed-size-pricing.test.mjs tests/mixed-size-geometry.test.mjs tests/mixed-size-state.test.mjs tests/mixed-size-ux.test.mjs tests/guest-design-state.test.mjs tests/uat-backend-guard.test.cjs tests/uat-frontend-safety.test.cjs
git diff --check
```

Result: 58 tests passed, 0 failed. Existing Node module-type warnings were the only warnings.

## Live UAT static/safe validation

Commit `2f83ab2` was pushed only to `origin/uat`. Read-only/static checks of `https://lucky-colorstone-uat.vercel.app` and the isolated UAT backend confirmed:

```text
frontend response: 200
mixed pricing module import present: true
fit gate present: true
UAT Step 4 block present: true
production Render backend reference: false
GET /api/stones: 200 (32 fixtures)
POST /api/orders with empty body: 403
POST /api/stripe/checkout-session with empty body: 403
```

No order or payment was created. Browser automation remains unavailable, so this is static/unit/safety validation rather than an interactive owner click-through.
