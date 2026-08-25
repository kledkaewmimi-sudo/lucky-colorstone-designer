# Phase 5 — Mixed Size UAT E2E, regression, and acceptance

Date: 2026-08-25
Workspace: `D:\Projects\lucky-colorstone-uat`
Branch: `uat`

## Scope and production safety

- `main` and `origin/main` remained at `0e958ff63b322b179e8184c4c6640fb22518756a` during this UAT-only work.
- No production workspace, branch, deployment, catalog, Supabase write, Stripe transaction, order, LINE message, LIFF, Meta, analytics, or merge was touched.
- The UAT fixture backend and frontend guards remain active. Order/checkout/payment routes remain blocked.

## Acceptance result

Automated acceptance covers the complete implemented Mixed Size flow:

- Fixed 4mm, 6mm, and 10mm state, pricing, and geometry regressions.
- Mixed 4/6/10 component sizes, explicit placement, filter non-mutation, ordered sequence, no silent 6mm fallback, and unsupported conversion blocking.
- Actual component footprint geometry, spacer effective length, charm footprint, add/remove recalculation, and inclusive ±1.0mm fit eligibility.
- Per-variant `stoneId_size` pricing aggregation, order payload variants, server catalog-price authority, CRM item-size precedence, and legacy fixed-order compatibility.
- Guest restore, mixed placement/filter restore, no `ResolvedLayout` persistence, UAT Step 4/checkout block, and no production backend reference.

## Mixed-to-fixed trailing trim

Added `mixed-size-transition-trim.js` and connected it only after an already-valid mixed→fixed conversion is explicitly confirmed.

1. Existing validation rejects unsupported stones before conversion; no trim occurs.
2. Confirmed valid conversion sets every stone to the chosen physical fixed size.
3. If the result is more than +1.0mm over target, a copied sequence removes tail components one-by-one.
4. It stops immediately once fit is no longer overflow.
5. It never reorders, substitutes, adds, or individually resizes components after conversion.
6. The result exposes `removedComponents` with IDs/type/details, logs the list for debugging, and clears only the active slot if trimming happened.

Underfill is not auto-corrected.

## Automated verification

Completed successfully:

```text
node --check app.js
node --check mixed-size-transition-trim.js
node --check server.js
node --test tests/mixed-size-phase5-acceptance.test.mjs tests/mixed-size-pricing.test.mjs tests/mixed-size-geometry.test.mjs tests/mixed-size-state.test.mjs tests/mixed-size-ux.test.mjs tests/guest-design-state.test.mjs tests/uat-backend-guard.test.cjs tests/uat-frontend-safety.test.cjs
git diff --check
```

Result: 64 tests passed, 0 failed. Existing Node module-type warnings were the only warnings. No unrelated failures were observed.

## Owner manual UAT script (5–10 minutes)

Use `https://lucky-colorstone-uat.vercel.app`. Do not attempt payment or order creation.

1. Landing → click Start → choose a wrist size → continue to Step 2. Expected: the normal flow reaches Step 2.
2. On Step 2, select 4mm, then 6mm, then 10mm. Expected: each fixed option becomes active; the mixed filter is not visible in Step 3.
3. Return to Step 2 and select `คละไซส์`. Expected: it becomes active and Step 3 Stones shows `ทั้งหมด`, 4mm, 6mm, 10mm.
4. Select 4mm and add a supported stone; select 6mm and add a stone; select 10mm and add a stone. Expected: visible sequence order is 4/6/10 and bead diameters increase accordingly.
5. Switch filters through `ทั้งหมด`, 4mm, 6mm, and 10mm. Expected: catalog filtering changes only browsing; already placed sizes and order remain unchanged.
6. In mixed mode, try selecting a catalog size a stone does not support. Expected: placement is blocked; it does not silently add as 6mm or another size.
7. Switch to Charms and Spacers, add/remove one supported item if available. Expected: those tabs remain usable and the bracelet sequence recalculates without reordering earlier items.
8. Mixed→fixed valid conversion: use only stones supporting 6mm, choose 6mm in Step 2 and confirm. Expected: stones convert to 6mm; if the converted bracelet overflowed, only trailing components disappear and a trim message identifies them.
9. Mixed→fixed unsupported block: create/select a stone that supports fewer sizes, attempt an unsupported fixed size. Expected: clear block message; cancel/blocked path leaves the design unchanged.
10. Attempt to continue to Step 4. Expected: UAT reports checkout/order creation is disabled. No payment or order is created.

## Live UAT validation status

Commit `48420f9` was pushed only to `origin/uat`. Static/API checks confirmed:

```text
frontend response: 200
mixed UI markup present: true
transition trim module/import present: true
transition trim integration present: true
UAT Step 4 block present: true
production Render backend reference: false
GET /api/stones: 200
GET /api/charms: 200
GET /api/spacers: 200
GET /api/settings: 200
POST /api/orders: 403
POST /api/stripe/checkout-session: 403
POST /api/analytics/event: 403
```

No order, payment, analytics write, or production request was made. Browser automation is unavailable in this environment, so the manual script above is required for visual click-through acceptance.

## Production promotion readiness audit (no promotion performed)

`git diff main...uat` currently contains these Mixed Size promotion candidates, to be reviewed/adapted on a production branch rather than copied wholesale:

```text
app.js
bracelet-geometry.js
guest-design-state.js
index.css
index.html
mixed-order-model.js
mixed-size-state.js
mixed-size-transition-trim.js
server-order-validation.js
```

Production server adaptation requires a deliberate transplant of the authoritative variant validator and checkout fit check into the production backend. Do not copy the UAT `server.js` wholesale.

UAT-only files/configuration that must not be promoted as-is:

```text
_redirects
data/stones.json
data/charms.json
data/spacers.json
data/settings.json
uat-backend-guard.js
vercel.json
server.js (fixture-only guard, CORS, and UAT routing)
tests/uat-backend-guard.test.cjs
tests/uat-frontend-safety.test.cjs
reports/mixed-size/*
```

Production merge adaptation must preserve production environment resolution, production backend routing, Supabase behavior, Stripe/LINE/Meta/analytics controls, and existing CRM deployment contracts. Production CRM rendering already has per-item size precedence but must be verified against live production data during promotion planning.

Rollback point: production baseline `0e958ff63b322b179e8184c4c6640fb22518756a`; no production changes have been made.
