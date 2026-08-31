# Historical Order Cost Reconstruction — Production Dry Run

Status: **dry run only; no Production write or deployment**. Source data was read publicly from the production Orders and Purchases APIs on 2026-09-01.

## Summary

| Examined | Fully actual | Estimated fallback | Unresolved | Revenue | Material Cost | Profit |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 22 | 1 | 21 | 0 | 12,821.00 | 1,971.2184978446664 | 9,089.781502155334 |

`ORD-123066` is fully actual historical. Every other historical order is complete under the approved earliest-known exact Purchase fallback policy. No order has a missing exact Purchase under this policy.

## Per-order dry run

| Order | Date | Class | Revenue | Material | Delivery | Total | Profit | Margin | Actual components | Fallback components | Unresolved |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| ORD-572404 | 2026-08-30 | Estimated | 1662 | 258.3000 | 80 | 338.3000 | 1323.7000 | 79.65% | 7 | 9 | 0 |
| ORD-478676 | 2026-08-30 | Estimated | 587 | 55.1506 | 80 | 135.1506 | 451.8494 | 76.98% | 36 | 9 | 0 |
| ORD-364998 | 2026-08-30 | Estimated | 456 | 40.5505 | 80 | 120.5505 | 335.4495 | 73.56% | 23 | 16 | 0 |
| ORD-690039 | 2026-08-30 | Estimated | 1747 | 344.1153 | 80 | 424.1153 | 1322.8847 | 75.72% | 11 | 13 | 0 |
| ORD-175365 | 2026-08-30 | Estimated | 357 | 45.0000 | 80 | 125.0000 | 232.0000 | 64.99% | 10 | 10 | 0 |
| ORD-514883 | 2026-08-30 | Estimated | 562 | 177.2162 | 80 | 257.2162 | 304.7838 | 54.23% | 12 | 6 | 0 |
| ORD-576378 | 2026-08-30 | Estimated | 845 | 123.5158 | 80 | 203.5158 | 641.4842 | 75.92% | 11 | 8 | 0 |
| ORD-192061 | 2026-08-30 | Estimated | 458 | 19.4412 | 80 | 99.4412 | 358.5588 | 78.29% | 35 | 7 | 0 |
| ORD-103465 | 2026-08-30 | Estimated | 484 | 216.5000 | 80 | 296.5000 | 187.5000 | 38.74% | 6 | 13 | 0 |
| ORD-299037 | 2026-08-30 | Estimated | 790 | 134.9562 | 80 | 214.9562 | 575.0438 | 72.79% | 19 | 6 | 0 |
| ORD-307039 | 2026-08-29 | Estimated | 870 | 134.5468 | 80 | 214.5468 | 655.4532 | 75.34% | 11 | 13 | 0 |
| ORD-931320 | 2026-08-29 | Estimated | 373 | 40.7519 | 80 | 120.7519 | 252.2481 | 67.63% | 5 | 20 | 0 |
| ORD-855854 | 2026-08-29 | Estimated | 212 | 13.0000 | 80 | 93.0000 | 119.0000 | 56.13% | 1 | 23 | 0 |
| ORD-148174 | 2026-08-24 | Estimated | 643 | 45.3304 | 80 | 125.3304 | 517.6696 | 80.51% | 20 | 31 | 0 |
| ORD-896440 | 2026-08-24 | Estimated | 407 | 61.0141 | 80 | 141.0141 | 265.9859 | 65.35% | 14 | 12 | 0 |
| ORD-448551 | 2026-08-23 | Estimated | 474 | 71.2300 | 80 | 151.2300 | 322.7700 | 68.09% | 9 | 16 | 0 |
| ORD-635588 | 2026-08-23 | Estimated | 436 | 61.7662 | 80 | 141.7662 | 294.2338 | 67.48% | 15 | 4 | 0 |
| ORD-154067 | 2026-08-23 | Estimated | 204 | 14.0000 | 80 | 94.0000 | 110.0000 | 53.92% | 0 | 23 | 0 |
| ORD-760245 | 2026-08-23 | Estimated | 187 | 12.0000 | 80 | 92.0000 | 95.0000 | 50.80% | 2 | 18 | 0 |
| ORD-123066 | 2026-08-22 | Fully actual | 523 | 48.8333 | 80 | 128.8333 | 394.1667 | 75.37% | 27 | 0 | 0 |
| ORD-806246 | 2026-08-10 | Estimated | 255 | 15.0000 | 80 | 95.0000 | 160.0000 | 62.75% | 0 | 15 | 0 |
| ORD-383094 | 2026-08-10 | Estimated | 289 | 39.0000 | 80 | 119.0000 | 170.0000 | 58.82% | 8 | 9 | 0 |

## Component audit and reproducibility

Every backfilled component preserves its original sequence and records `type`, `catalogId`, `sizeMm`, `quantity`, `weightedAverageUnitCost`, `extendedCost`, `sourcePurchaseRowIds`, `sourcePurchaseDate`, `fallbackUsed`, and `costResolutionMethod`.

The complete occurrence-level component audit—including every fallback component, earliest source date, source IDs, and any unresolved component—is generated reproducibly by:

```powershell
node scripts/dry-run-historical-order-cost-backfills.js --production-public-read
```

Rules implemented by that tool:

- Pre-order exact rows are weighted together and marked `historical_exact_purchase`.
- If none exist, only rows on the earliest later exact Purchase date are weighted together and marked `historical_estimated_earliest_known_purchase`.
- Any component with no exact rows remains `unresolved_no_exact_purchase`; none occurred in this dry run.
- Existing snapshots are excluded from the candidate set and cannot be overwritten.

Proposed snapshot metadata is `historical_deterministic_purchases_weighted_average_exact_variant` plus `historicalDeterministicBackfill: true` for the one fully actual order, or `historical_reconstructed_with_earliest_known_purchase_fallback` plus `historicalEstimatedBackfill: true` for the 21 estimates. No database schema change is needed because `orders.payload` is JSONB.

Production modified: **NO**.
