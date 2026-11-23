# Phase 6A.1D: Production pricing and variant summary model

## Scope

This phase adds frontend-only per-size stone pricing and the mixed-size order
summary model. Server validation, checkout endpoints, Stripe, LINE/OA,
callback/restore, CRM, and analytics semantics are unchanged.

## Pricing source and invalid state

Stone price resolution uses only the production catalog fields that match a
placed stone's stored physical size:

- 4mm: `p4`
- 6mm: `p6`
- 10mm: `p10`

There is no `mixed` physical size, default 6mm price, generic price, or other
size-price substitution. Missing stones, invalid sizes, or missing/invalid
`p4`/`p6`/`p10` values produce `pricingValid: false` with `pricingIssues` and
null stone/summary totals. Browser display prices are explicitly marked
`clientPriceAuthoritative: false`; no backend trust model was changed.

## Variant summary model

`mixed-order-model.js` uses the canonical variant key `stoneId_size` and
builds per-variant `stoneId`, `size`, `quantity`, `unitPrice`, and `subtotal`.
`stoneVariants` contains the future-safe transport shape:

```js
[{ stoneId, size, quantity }]
```

The existing `aggregatedStones`, legacy totals, itemized billing, charms, and
spacers remain present for fixed-design compatibility. Step 4 continues to use
the existing structure; its variant rows already display physical size and
quantity separately, so the same stone at 4mm and 10mm is not collapsed.

The checkout summary exposes the current canonical geometry result from the
Phase 6A.1C geometry path. No second fit calculation or checkout-fit block was
introduced.

## Verification

Passed:

- `node --check mixed-order-model.js`
- `node --check app.js`
- focused production pricing/summary tests
- existing Phase 6A.1A state tests
- existing Phase 6A.1B selector tests
- existing Phase 6A.1C geometry/fit tests
- `git diff --check`

The focused pricing tests cover p4/p6/p10 resolution, invalid price behavior,
variant aggregation and identity, unit price/subtotal/mixed total calculation,
charm/spacer preservation, fixed 4/6/10 regression, physical-size safety, and
the non-authoritative browser price plus canonical geometry contract.
