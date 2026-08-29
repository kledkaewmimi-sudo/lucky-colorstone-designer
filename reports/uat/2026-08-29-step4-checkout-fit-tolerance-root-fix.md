# Step 4 Checkout Fit-Tolerance Root Fix — UAT

## Owner Evidence

For wrist 16.0cm, the manufacturing target is 175mm. A 17 x 10mm bracelet uses 170mm and is complete under the approved Mixed window (170–175mm). The owner reported the separate checkout error: `Bracelet is below the 1.0mm fit tolerance.`

## Payment Path Trace

1. Step 3 Next / `goToStep(4)` calls `getCurrentCheckoutFitEligibility()`.
2. That resolves the current resolved layout and returns its `summary.completionEligibility`.
3. Step 4 payment click calls `handleStripeCheckout()`.
4. In UAT, the first branch now evaluates the same shared eligibility and then always stops before session creation with `UAT safe mode: bracelet validation passed. Checkout and payment are disabled.`
5. In production, after frontend validation, `handleStripeCheckout()` posts to `/api/stripe/checkout-session`.
6. Production `server.js` calls `buildAuthoritativeStripeOrder()`, which calls the production `validateAuthoritativeOrder()` validator before a Stripe session is created.

## All Completion Authorities

| File / function | Rule | Mode | Side | Status |
| --- | --- | --- | --- | --- |
| `bracelet-geometry.js` / `getBraceletCompletionEligibility` | Mixed target-5 through target; Fixed discrete no-next-component capacity | Both | UAT frontend | Authoritative semantic rule |
| `app.js` / `createResolvedBraceletLayout` | Stores shared completion result in `summary.completionEligibility` using physical component length | Both | UAT frontend | Authoritative layout result |
| `app.js` / `getResolvedLayoutFitEligibility` | Returns `summary.completionEligibility` | Both | UAT frontend | Authoritative consumer |
| `app.js` / `getStep3ValidationState`, `goToStep(4)`, `getCurrentCheckoutFitEligibility` | Consume the same resolved result | Both | UAT frontend | Consumers, not independent calculations |
| `app.js` / `handleStripeCheckout` | UAT consumes shared result, then safety-blocks before fetch | Both | UAT frontend | Safe diagnostic consumer |
| UAT `server-order-validation.js` / `getAuthoritativeStoneVariant` | Validates size/catalog/price only | Both | UAT backend | No bracelet fit gate; session cannot be called from UAT client |
| Production `server-order-validation.js` / `validateAuthoritativeOrder` | Requires physical used length within ±1mm of target | Both | Production backend | Obsolete independent authority; blocks Stripe session |

## 1.0mm Gate Origin

The exact reported text is emitted by production `server-order-validation.js`, `validateAuthoritativeOrder()`. It defines `FIT_TOLERANCE_MM = 1`, calculates `usedLengthMm - targetLengthMm`, and rejects anything outside ±1mm. A 170mm bracelet against a 175mm target is rejected there before production Stripe session creation.

No `1.0mm fit tolerance` text or 1mm checkout gate exists in current UAT application or UAT server validator.

## UAT Payment Safety Audit

`app.js` / `handleStripeCheckout()` has an `IS_UAT_MODE` branch that executes before stock, LINE, shipping, preview, fetch, `/api/stripe/checkout-session`, and Stripe session creation. It is preserved. The branch now communicates two distinct outcomes:

- invalid bracelet: `Bracelet validation: <shared completion reason>`;
- valid bracelet: `UAT safe mode: bracelet validation passed. Checkout and payment are disabled.`

This does not enable a UAT live charge, order, session, or backend transaction.

## Production Read-Only Comparison

Current production frontend has `APP_ENV = 'production'`, so its `IS_UAT_MODE` payment safety branch is inactive. Production frontend uses the resolved completion consumer, but its backend has the stale 1mm validator described above. Production was inspected read-only and not modified.

## Exact Root Cause

The reported message cannot originate from current UAT payment safety: UAT returns before checkout validation/session creation and uses different copy. It originates from production backend validation, which retained an obsolete independent ±1mm fit authority instead of the approved completion eligibility. This rejects otherwise complete 170–175mm Mixed bracelets below 174mm.

## Minimal Fix

UAT change only: evaluate `getCurrentCheckoutFitEligibility()` inside the existing UAT safety branch, then safely block payment with a distinct success message. This provides an owner-visible proof that bracelet validation passed without creating a transaction.

No production code was changed. A later production promotion must replace `validateAuthoritativeOrder()`'s `FIT_TOLERANCE_MM = 1` test with the approved completion semantics before Stripe session creation.

## Shared Completion Authority

UAT Step 3, Step 4 entry, and the UAT checkout safety message now all consume `summary.completionEligibility` from `createResolvedBraceletLayout()`. The geometry’s ±2mm status remains diagnostic metadata; it is not used as UAT completion authority.

## Mixed Boundary Tests

For target 175mm: 169mm is incomplete; 170, 171, 172, 173, 174, and 175mm are eligible; 176mm is overflow-invalid. Final 1mm, 2mm, and 3mm gaps (174/173/172mm) remain eligible.

## Fixed Regression

Fixed discrete completion remains unchanged: 10mm at 170mm, 6mm at 174mm, and 4mm at 172mm remain eligible under their existing capacity authority. No Fixed rule is evaluated by the Mixed window.

## Component Length Consistency

The shared geometry uses 4/6/10mm stone sizes, spacer effective length, and charm footprint. Empty/placeholder components contribute zero physical length. Renderer geometry and retained-slot handling were not changed.

## UAT Deployment

The UAT-only checkout-message change and regression tests are committed and deployed to the isolated UAT project.

## Owner Retest

For 17 x 10mm at wrist 16.0cm, press checkout in UAT. Expected result: `UAT safe mode: bracelet validation passed. Checkout and payment are disabled.` The old 1.0mm message must not appear. No payment session or live charge is expected.

## Production Isolation

Production source and deployment were not modified.

## Production Promotion Delta If Needed

Production needs a separately authorized backend promotion: replace the independent ±1mm `validateAuthoritativeOrder()` fit check with a server-side implementation of the approved `getBraceletCompletionEligibility` contract (Mixed target-5 through target; Fixed discrete capacity), using the same stone/spacer/charm/empty physical-length semantics. Retest it before any production deployment.
