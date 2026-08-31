# UAT CRM Order Cost Snapshot Implementation

Status: `BLOCKED_PERSISTENCE_MODEL`

## Existing Order Persistence

Orders are persisted as the complete order object in the existing `orders.payload`
JSONB field and the JSON fallback. `/api/orders` returns the full payload, and
existing CRM workflow updates preserve and re-save that full object.

## Snapshot Storage Location

`costSnapshot` is an additive property in the existing order payload. No schema
migration, new table, or new read endpoint is required.

## Purchases Cost Resolver

The resolver uses the established weighted-average rule for exact physical
identity only:

```text
weightedAverageUnitCost = sum(matching total_cost) / sum(matching quantity)
Material Cost = sum(component quantity * exact weightedAverageUnitCost)
```

Stones require exact catalog ID plus `size_mm` 4, 6, or 10. Charms and spacers
require exact catalog identity. No name, SKU, manual-cost, zero, or cross-variant
fallback is used.

## Snapshot Creation Rule

The server creates a snapshot only in the existing confirmed Stripe paid event
path, before the paid order is saved. The snapshot contract is:

```js
{
  status: 'complete' | 'unavailable',
  calculatedAt: 'ISO timestamp',
  costSource: 'purchases_weighted_average_exact_variant',
  finalPaidAmount: number | null,
  materialCost: number | null,
  deliveryCost: 80,
  totalCost: number | null,
  profit: number | null,
  marginPercent: number | null,
  components: []
}
```

Missing exact component data saves `status: 'unavailable'`; it never uses a
guessed or zero fallback.

## Immutable Historical Rule

If `costSnapshot` already exists, it is preserved without rewrite or automatic
recalculation. Later Purchases additions, edits, or deletions cannot change an
existing order's Material Cost, Total Cost, Profit, or Margin.

## Historical Orders

No historic order backfill runs automatically. An order without a snapshot shows
Material Cost, Total Cost, Profit, and Margin as `Unavailable`, while Delivery
Cost remains ฿80. Historic values are never recalculated from today's Purchases.

## CRM UI

CRM Orders renders the stored snapshot only, directly between `PRICING` and
`STATUS`:

```text
PRICING
COST
  Material Cost
  Delivery Cost  ฿80
  Total Cost
  Profit
  Margin
STATUS
```

The UI shows only combined Material Cost, uses existing compact CRM styling, and
shows `UNKNOWN / UNRESOLVED COST` plus `Unavailable` values for unresolved data.
Profit uses the final paid post-discount total; Margin displays one decimal place.

## Files Changed

- `crm.html`
- `crm.css`
- `crm.js`
- `server.js`
- `server-order-cost-snapshot.js`
- `tests/crm-order-cost-snapshot.test.cjs`
- `reports/uat/2026-08-31-crm-cost-snapshot-implementation.md`

## Tests

`PASS 30 / FAIL 0`

Coverage includes exact 4/6/10mm resolution, weighted average, material-only and
combined components, fixed delivery, total/profit/margin formulae, genuine zero
cost, unresolved cost, paid-only eligibility, immutability, CRM complete and
unavailable states, existing CRM/order/payment/checkout regressions, UAT backend
guard, and customer frontend safety.

## Customer Frontend Isolation

No changes to `index.html`, `index.css`, `app.js`, renderer/geometry, Step 1–4,
completion, checkout, customer pricing, LINE/LIFF/OA, Meta Pixel, or analytics.

## UAT Deployment

The isolated UAT Vercel project deployed commit `9065037` and reports `Ready`.
The CRM frontend can display persisted snapshots and unresolved historic orders.

Live snapshot creation cannot be verified in the current UAT runtime: its
existing UAT backend guard blocks order/payment mutation paths and Stripe
credentials are intentionally prohibited. No order/payment guard was loosened,
no write probe was made, and no customer or payment behavior changed.

Owner CRM inspection is required. A future UAT-only backend-release task must
provide an approved paid-order authority before live snapshot persistence can be
verified.

## Owner Acceptance

Owner verifies `PRICING → COST → STATUS`, exact Material Cost, fixed ฿80 Delivery
Cost, Total Cost, Profit using final paid post-discount amount, one-decimal Margin,
unresolved state, snapshot stability, compact desktop/mobile CRM layout, and
unchanged customer customizer behavior.

## Production Isolation

Do not deploy, access, modify, query, or run SQL against Production.
