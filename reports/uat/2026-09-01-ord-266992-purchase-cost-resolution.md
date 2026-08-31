# ORD-266992 Purchase Cost Resolution

Environment: Production. The existing `POST /api/purchases` path created the two approved rows after an exact-duplicate read returned none.

| Variant | Purchase ID | Date | Quantity | Total cost | Unit cost |
| --- | --- | --- | ---: | ---: | ---: |
| `pink_tiger_eye` 10mm | `741336c2-ad41-4eae-a105-117db0a5484a` | 2026-09-01 | 1 | 3 | 3 |
| `red_tiger_eye` 10mm | `2ab1f2fa-0878-42ed-9f0e-2319abc2fcd1` | 2026-09-01 | 1 | 3 | 3 |

Re-read and normal current-order cost calculation results:

- unresolved components: 0
- Material Cost: 126.59157520281116
- Delivery Cost: 80
- Total Cost: 206.59157520281116
- Revenue: 514
- Profit: 307.40842479718884
- Margin: 59.80708653641806%

Both previously unresolved 10mm variants resolve at 3 THB. All other 17 saved component occurrences also resolve. No historical fallback rule was used.

The existing snapshot remains `status: unavailable`. It was not replaced because Production exposes no cost-snapshot update endpoint and this workspace has no Production Supabase service-role credential. The proposed replacement must be a normal complete snapshot using `purchases_weighted_average_exact_variant`, the values above, and the current UTC write timestamp; it must replace only this unavailable snapshot after a credentialed re-read confirms its status remains unavailable.

No 22-order historical backfill was run.

Production modified: **YES — exactly two Purchase records only**.
