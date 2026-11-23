# Phase 7 — Commerce Regression Plan

**Candidate:** `D:\Projects\lucky-colorstone-line-login-rc-20261123`

**Status:** **PLAN READY — UAT NOT EXECUTED**

## 1. Preservation baseline

The minimal candidate is built from:

```text
frontend: recovered dpl_Ar3kGCsUJF2pVNhP6UHxbsTSBMCJ
backend:  123ed986ccc9977d21418094ae311690a6286fae
```

These functions are byte-identical to the baseline:

```text
createStripeCheckoutSession
applyStripeCheckoutPaymentEvent
deductStockForOrder
validateOrderStockOrThrow
saveOrderForApi
buildAuthoritativeStripeOrder
```

These files are byte-identical:

```text
frontend/crm.js
frontend/crm.html
frontend/data.js
backend/server-order-validation.js
backend/data/stones.json
backend/data/charms.json
backend/data/spacers.json
```

No Phase 5 stock reservation code or migration is included.

## 2. UAT test cases

### Stripe Test Mode

Use only explicitly supplied test-mode credentials. Never use Production Stripe keys or real charges.

| Case | Expected | Status |
|---|---|---|
| Create Checkout Session | Server returns a test session/URL; no Production Stripe contact | NOT TESTED |
| Payment success | Webhook marks paid; order persists once | NOT TESTED |
| Payment failure | Order remains unpaid; no paid transition | NOT TESTED |
| Customer cancellation | No paid state; no duplicate order | NOT TESTED |
| Webhook receipt | Signature verified; malformed signature rejected | NOT TESTED |
| Duplicate webhook | No second paid transition/notification | NOT TESTED |
| Retry | Idempotent checkout attempt | NOT TESTED |
| 3DS/SCA | Supported test flow completes or fails clearly | NOT TESTED |
| Unauthorized paid/shipped mutation | Public request denied | Local static test PASS; UAT NOT TESTED |

### Order creation and CRM

| Case | Expected | Status |
|---|---|---|
| Customer Step 4 order | Total/subtotal/discount match selected design | NOT TESTED |
| CRM order display | Existing order card and status workflow unchanged | NOT TESTED |
| Status transition | `New Order` -> `Payment Received` -> `Shipped` works | NOT TESTED |
| Duplicate order submission | Existing idempotency behavior preserved | NOT TESTED |
| Customer checkout payload | Same field shape as Production baseline | Local full-journey PASS; UAT NOT TESTED |

### Existing stock behavior

| Case | Expected | Status |
|---|---|---|
| Stock validation | Existing Production read/validate behavior remains | NOT TESTED |
| Paid-order deduction | Existing deduction behavior, no reservation RPC | NOT TESTED |
| Unavailable item | Existing checkout rejection/response | NOT TESTED |
| Phase 5 reservation | Not present and not enabled | PASS static exclusion |

## 3. UAT test data rules

- Use isolated UAT test products/orders, never Production records.
- Use test Stripe mode only.
- Do not alter Production catalog, pricing, discount, stock, orders, payments, or CRM users.
- Do not set `STOCK_RESERVATION_RPC_ENABLED`.
- Do not apply the stock reservation migration.
- Record order/test identifiers without customer PII.

## 4. Evidence

For each case record:

```text
UTM/test order reference (non-sensitive)
visible UI result
HTTP status only (redact headers/body tokens)
webhook event type and id (redacted if needed)
expected vs actual status
PASS | FAIL | NOT RUN | INCONCLUSIVE
```

## 5. Blockers

- No UAT deployment authorized.
- UAT-specific origin/config overlay not built.
- Stripe test credentials absent.
- UAT Supabase/CRM environment not verified.
- No live Stripe or device execution.

## 6. Verdict

Commerce regression plan is ready. **No UAT commerce test has been executed**, and no Production payment/order/stock behavior was changed.
