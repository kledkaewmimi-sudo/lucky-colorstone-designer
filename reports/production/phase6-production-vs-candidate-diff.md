# Phase 6 — Production vs Candidate Diff

**Production frontend baseline:** recovered `dpl_Ar3kGCsUJF2pVNhP6UHxbsTSBMCJ` snapshot, 327 files, manifest SHA-256 `3ac50ff398c2bf86531ed2e323bdaf0c99ba0406556ebd22e1de3d560c4d436b`.

**Production backend baseline:** Render commit `123ed986ccc9977d21418094ae311690a6286fae`.

**Broad candidate audited:** `D:\Projects\lucky-colorstone-prod-rc-20261123` (HEAD `3bc9bfe`).

**Minimal release candidate:** `D:\Projects\lucky-colorstone-line-login-rc-20261123`.

No Production/UAT file, database, deployment, alias, environment, or remote was changed.

## 1. Broad candidate diff

### Frontend — 327 baseline files

| File | Difference | Classification |
|---|---|---|
| `app.js` | Auth-entry lifecycle added; also PII split and billing-image escaping | **REQUIRED + UNRELATED MIXED** |
| `crm.html` | Default credential hint removed | **UNRELATED** |
| `crm.js` | CRM escaping/legacy-secret cleanup | **UNRELATED** |
| `data.js` | CRM localStorage-secret header removal | **UNRELATED** |
| `vercel.json` | Auth route plus CSP/security headers | **REQUIRED + UNRELATED MIXED** |
| `line-auth-entry.html` | New auth-entry page | **REQUIRED LINE LOGIN** |
| `line-auth-entry.js` | LIFF init/fallback page | **REQUIRED LINE LOGIN** |

No baseline frontend file is missing.

### Backend — 505 baseline files

| File | Difference | Classification |
|---|---|---|
| `BUSINESS_RULES.md` | Discount wording update | **UNRELATED** |
| `data/stones.json` | `gray_agate` local fixture record | **UNRELATED** |
| `server-order-validation.js` | Pyrite discontinuation guard | **UNRELATED** |
| `server.js` | Auth-entry service/dispatch/CORS header; also CSP/CORS lock/body limit/rate limiter/upload validation/public-order state guard/stock RPC adapter | **REQUIRED + UNRELATED MIXED** |
| `api-rate-limiter.js` | New route-aware limiter | **UNRELATED** |
| `image-upload-validation.js` | New upload validator | **UNRELATED** |
| `data/order_notifications.json` | Test/runtime artifact | **UNRELATED** |
| `production-line-auth-entry.js` | New server-side auth-entry service | **REQUIRED LINE LOGIN** |

No baseline backend file is missing.

## 2. Minimal candidate diff

The minimal candidate starts from the exact recovered frontend and backend baselines and overlays only the following.

### Frontend

| File | Difference | Classification |
|---|---|---|
| `app.js` | Auth-entry startup, Step 1 Next branch, handoff persistence, server verification, Step 2 restoration | **REQUIRED LINE LOGIN** |
| `vercel.json` | Adds only `/line-auth-entry` -> `/line-auth-entry.html` | **REQUIRED LINE LOGIN** |
| `line-auth-entry.html` | New extensionless auth-entry document | **REQUIRED LINE LOGIN** |
| `line-auth-entry.js` | New LIFF init/fallback document | **REQUIRED LINE LOGIN** |

`crm.html`, `crm.js`, `data.js`, `index.html`, catalog files, and all other frontend files are byte-identical to baseline.

### Backend

| File | Difference | Classification |
|---|---|---|
| `server.js` | Requires/initializes auth-entry service; allows `X-LC-Auth-Entry`; dispatches auth paths before normal API body handling | **REQUIRED LINE LOGIN** |
| `production-line-auth-entry.js` | New server-side ID-token verification/session/handoff service | **REQUIRED LINE LOGIN** |

No rate limiter, upload validator, stock reservation, Pyrite guard, catalog fixture, or security-header change is included.

### SQL

`supabase/production/2026-11-23-line-auth-entry-sessions.sql` is included as a draft, with base functions and production-prefixed wrappers matching the service's RPC names. It is **not applied**.

## 3. Commerce preservation

The minimal candidate's commerce functions are byte-identical to the Production backend baseline. Naive brace extraction SHA-256 values used by the regression test:

```text
createStripeCheckoutSession       df590fc817a2e0fddb4696a5f147b60ce6f6a5dee64b6850b71928eeeae0c884
applyStripeCheckoutPaymentEvent   2c99c156c7cd708585aacc026b6af39566b6f802b0013e126dfeb02bf4af7710
deductStockForOrder               7756205302a65cbcfd85cdc522a7251fbb69e4cce0fb5d3516539051617a1c19
validateOrderStockOrThrow         3c03483abf440dd7b2fbab8c49079c2a2dec3a68cd270c0fe55bcdb6e2a8442a
saveOrderForApi                   f643a80541c9b238e98565a608a07c8ac4ef8946d9804e652c7bbe94cf8607f8
```

Also byte-identical:

```text
frontend/crm.js
frontend/crm.html
frontend/data.js
backend/server-order-validation.js
backend/data/stones.json
backend/data/charms.json
backend/data/spacers.json
```

The minimal suite proves these hashes; the broad candidate does not satisfy this property.

## 4. Behavior classification

| Area | Broad candidate | Minimal candidate |
|---|---|---|
| Checkout Session creation | UNCHANGED function | UNCHANGED |
| Stripe Checkout request/callback | UNCHANGED function | UNCHANGED |
| Stripe webhook | UNCHANGED function | UNCHANGED |
| Order creation/status | New public-state guard | UNCHANGED |
| Stock validation/deduction | New opt-in RPC adapter | UNCHANGED |
| CRM workflow | XSS/default-hint changes | UNCHANGED |
| Pricing/discount | Unchanged | UNCHANGED |
| Catalog/inventory | gray_agate fixture + Pyrite guard | UNCHANGED |
| LINE Login | REQUIRED + unrelated security/PII | REQUIRED only |

## 5. Conclusion

The broad candidate is **not** a LINE-Login-only release. The minimal candidate is the only auditable LINE Login-only release candidate. It excludes the Phase 5 stock reservation implementation and all unrelated changes.

**Production/UAT deployment:** NONE.
