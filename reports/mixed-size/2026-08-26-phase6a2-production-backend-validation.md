# Phase 6A.2: Production authoritative mixed-size validation

## Scope

The production `buildAuthoritativeStripeOrder()` boundary now delegates only
pricing, variant, and fit validation to `server-order-validation.js`. Stripe
session construction, webhook handling, paid-order authority, Supabase access,
stock validation/deduction, LINE notification flow, CORS, and environment
configuration remain unchanged.

## Authoritative contract

The validator accepts ordered `braceletSequence` as the physical design source
and optionally accepts `stoneVariants`. When variants are supplied, they must
exactly match the server-derived `stoneId_size` quantities from the sequence.
Only physical 4, 6, and 10mm stone sizes are valid; each is checked against the
authoritative production catalog's supported sizes and matching `p4`, `p6`, or
`p10` price.

Browser `unitPrice`, item totals, catalog prices, grand totals, and fit status
are ignored. The server builds authoritative billing, variant details, subtotal,
discount, final total, and geometry. The existing client-total mismatch policy
is preserved: a different supplied final total is rejected before Stripe
Checkout is created.

The server uses `(wristSize + 1.5) * 10` as target millimetres and accepts only
the inclusive -1.0mm to +1.0mm fit window. Underfill and overflow reject; the
server never trims, substitutes, or adds components.

## Legacy compatibility

New payloads may provide `stoneVariants`; legacy fixed payloads may omit them.
For a legacy fixed 4/6/10 payload whose stone component has no explicit size,
the server derives the physical size only from that fixed `beadSize`. A mixed
payload must include every stone's physical size and cannot fall back to a
current mode or default size.

Authoritative orders persist `stoneVariants` alongside existing legacy billing
and order fields, allowing downstream consumers to distinguish same-stone size
variants without a schema migration.

## Verification

Passed:

- `node --check server.js`
- `node --check server-order-validation.js`
- focused backend validation tests
- relevant production webhook, paid-order, LINE/OA, and analytics server tests
- existing Phase 6A.1A through 6A.1E tests where practical
- `git diff --check`
- production candidate scan: zero runtime UAT markers

The combined test run passed 54 tests. No live Stripe checkout, Supabase
mutation, LINE message, or production deployment was performed.
