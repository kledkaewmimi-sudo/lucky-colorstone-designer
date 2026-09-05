# Production Admin Order Number and Historical Cost Refresh

## Source change

- Base: `origin/main` at `8ec7bb02990c5092c1efe512ab0e618ce3350c27`.
- This source-only change adds a CRM-only `/api/crm/orders` projection that maps `admin_order_numbers.order_id` to paid orders. The customer `/api/orders` response remains unchanged.
- Paid-order admin LINE notifications now read the already assigned database value. They do not allocate a sequence number. Customer detail URLs continue to use `?orderId=ORD-…`.
- The new historical refresh CLI has an exact six-ID allow-list and defaults to dry run. It reuses `createHistoricalOrderCostSnapshot`, which shares the existing production exact-variant cost engine.

## Safety

- No runtime deployment, Supabase mutation, sequence use, payment, webhook, Stripe, tracking, Meta, TikTok, or customer LINE behavior occurred in this source-preparation task.
- The script requires `stripe_payment_status = paid`, an existing `costSnapshot.status = unavailable`, and fully resolved components before it can write. Resolved or unresolved snapshots are skipped. It re-reads each target before and after a write.
- Approved IDs only: `ORD-484936`, `ORD-179772`, `ORD-377597`, `ORD-940605`, `ORD-604590`, and `ORD-705065`.
- Expected current costs used by the resolver include Amethyst Quartz 6 mm = THB 4 and Carnelian 6 mm = THB 3 per bead. No sale price or order data is changed.

## Verification

- Focused tests: 14 passed, 0 failed.
- Syntax checks passed for `server.js`, `data.js`, `crm.js`, the new helper, and the refresh script.
- `git diff --check` passed.

## Owner handoff after the Git push

1. Manually deploy the focused commit to Render service **`lucky-colorstone-designer`**.
2. In that service's Render Shell, run the non-mutating review:

   ```sh
   node scripts/refresh-unavailable-order-costs.mjs
   ```

3. Review all six lines. Only if every intended order prints `WOULD UPDATE` with all components resolved, apply:

   ```sh
   node scripts/refresh-unavailable-order-costs.mjs --apply
   ```

4. Re-run the dry run. Successfully refreshed orders must now print `SKIP` / `cost_snapshot_not_unavailable`; unresolved orders must remain unchanged.
5. Verify CRM shows `ORDER #37` for `ORD-705065`, its cost fields are available when its refresh resolved, and the next real paid order remains #38. Confirm the next admin LINE message shows only the database-assigned number while its customer URL retains the technical `ORD-…` ID.
