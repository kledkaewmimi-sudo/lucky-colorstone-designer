# UAT CRM Cost Snapshot Persistence Verification

## Existing Persistence Path

Orders are stored as complete JSON payloads: in the configured UAT Supabase `orders.payload` JSONB column, with `data/orders.json` as the existing local JSON fallback. `costSnapshot` is an additive field on that payload; no schema migration is required.

## UAT Verification Mechanism

A backend integration test uses a uniquely created temporary directory and the same JSON fallback persistence helper used by `server.js`. It writes tagged QA orders, reads them back, and removes the temporary directory automatically. It creates no HTTP route, no Checkout Session, no payment, and no persistent UAT record.

The deployed fixture-only UAT guard intentionally denies both `GET /api/orders` and `POST /api/orders`. Exercising that live route would require weakening the guard, which is prohibited. Consequently, the JSON fallback persistence round trip passes, while a live guarded `/api/orders` round trip is not verified.

## Complete Snapshot Round Trip

The temporary `QA-COST-SNAPSHOT-20260831-COMPLETE` order persisted and re-read this exact complete snapshot:

- `finalPaidAmount`: 458
- `materialCost`: 126
- `deliveryCost`: 80
- `totalCost`: 206
- `profit`: 252
- `marginPercent`: 55.0
- `costSource`: `purchases_weighted_average_exact_variant`
- `calculatedAt`: `2026-08-31T00:00:00.000Z`
- component audit detail: preserved

## Unresolved Snapshot Round Trip

`QA-COST-SNAPSHOT-20260831-UNRESOLVED` contains a 10mm component for which only a 6mm purchase exists. Its persisted/re-read snapshot is `unavailable`, with delivery cost 80 and `materialCost`, `totalCost`, `profit`, and `marginPercent` all `null`. No zero-cost fallback is used.

## Immutability Verification

After the complete snapshot was written, the test changed the matching Purchases fixture from 126 to 990. Calling the shared snapshot boundary preserved the original snapshot exactly, including amount fields and `calculatedAt`, then re-read it unchanged from JSON.

## QA Data

The QA identifiers are documented above. They exist only inside an OS temporary test directory named `lucky-colorstone-uat-cost-snapshot-*`; test teardown removes that exact directory. No UAT database rows or `data/orders.json` entries were created, so no manual cleanup is needed.

## UAT Guard Preservation

`isUatSupabaseApiRequest` remains false for `GET /api/orders`, `POST /api/orders`, and a hypothetical `/api/orders/qa-cost-snapshot` path. No QA route was added. The test also verifies `server.js` has no QA-cost route. Existing UAT transaction guards therefore remain active.

## Customer Frontend Isolation

No customer runtime file changed: `index.html`, `index.css`, and `app.js` are unchanged. No renderer, Steps 1–4, checkout, Stripe, LINE/LIFF/OA, Meta Pixel, analytics, or customer pricing behavior was modified.

## Tests

The focused persistence suite verifies complete JSON fallback persistence, unresolved persistence, immutable saved values after changed Purchases data, UAT guard preservation, and no QA route. The full relevant regression run completed with 34 passing tests, 0 failures, 0 skips.

## UAT Deployment

The isolated UAT project deployment will be updated from this UAT-branch commit after this report is committed. This verification does not deploy or alter Production.

## Owner Acceptance

The existing CRM COST UI remains positioned `PRICING - COST - STATUS`. Owner can inspect the deployed UAT CRM at `https://uat.customize.luckycolorstone.com/crm.html`. Live order creation/read remains deliberately unavailable in fixture-only UAT, so owner acceptance of a live paid-order snapshot requires an owner-approved non-payment persistence authority or a separately configured safe UAT order fixture path.

## Production Isolation

No Production service, data, deployment, secret, Stripe session, payment status, payment guard, or QA path was changed. The integration test is repository-only and production has no active QA endpoint.

## Verification Result

The existing order JSON persistence mechanism preserves immutable `costSnapshot` payloads correctly. The requested live `/api/orders` UAT round trip remains blocked by the deliberate fixture-only UAT guard; the guard was not weakened. Status: `BLOCKED_PERSISTENCE_VERIFICATION`.
