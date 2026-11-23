# LINE Login Production Release Preparation

**Candidate:** `D:\Projects\lucky-colorstone-line-login-rc-20261123`

**Date:** 2026-11-23 (Asia/Bangkok)

**Production Release Readiness:** **BLOCKED**

The code package is frozen and locally tested, but Production cannot safely run this release yet because the required LINE channel environment variable is absent and the auth-entry table/function migration is absent.

## 1. Production configuration inspected

Read-only inspection only. No secret value is printed.

| Item | Observed Production state | Status |
|---|---|---|
| Live `/api/liff-config` | `environment: production`, `liffId: 2010525799-qImIuhla` | CONFIRMED |
| Production Vercel deployment | `dpl_Ar3kGCsUJF2pVNhP6UHxbsTSBMCJ` (`READY`) | CONFIRMED |
| Production frontend project | `lucky-colorstone-designer` (`prj_oIiZd2rNPCxrGpOY0xrCExS6sbSP`) | CONFIRMED |
| Production API host | `https://lucky-colorstone-designer.onrender.com` (from `frontend/vercel.json`) | CONFIRMED |
| Production Render service | `srv-d8v7cknlk1mc739o88lg` | CONFIRMED |
| Production Supabase | `https://fjzchgjqwxfndkplztxq.supabase.co` | CONFIRMED |
| `line_auth_entry_sessions` | REST read returns HTTP 404 | **ABSENT — migration required** |
| Production `/line-auth-entry` | HTTP 404 | **NOT DEPLOYED** |
| Production auth-entry API | HTTP 404 | **NOT DEPLOYED** |
| `LINE_LOGIN_CHANNEL_ID` | Not present in Production Render env | **BLOCKED** |
| `PRODUCTION_LINE_CHANNEL_ID` | Not present in Production Render env | **BLOCKED** |
| `LINE_CHANNEL_ID` | Not present in Production Render env | **BLOCKED** |
| Production LIFF endpoint page | Public LIFF page references `https://customize.luckycolorstone.com/` | OBSERVED; Console not verified |
| LINE Console callback/audience | Not accessible without owner/LINE Console access | **BLOCKED — verify** |
| Production `SUPABASE_SERVICE_ROLE_KEY` | Present (value redacted) | PRESENT |
| Production `LINE_CHANNEL_SECRET` / access token | Present (values redacted) | PRESENT |
| Production Stripe keys/webhook secret | Present (values redacted) | PRESENT |

### Critical finding

`production-line-auth-entry.js` resolves the expected ID-token audience from:

```text
LINE_LOGIN_CHANNEL_ID || PRODUCTION_LINE_CHANNEL_ID
```

Neither variable is present in the Production Render service. The auth-entry routes would return `503 Verification unavailable` even after the code is deployed.

The required value must be the **LINE Login channel ID whose `aud` appears in the ID token**. Do not infer it solely from the LIFF ID prefix; the owner must confirm it in LINE Developers Console. The observed LIFF ID prefix is `2010525799`, but that is not treated as proof of the audience.

## 2. Exact files to deploy

The frozen candidate is the exact recovered Production baseline plus:

```text
frontend/app.js
frontend/vercel.json
frontend/line-auth-entry.html
frontend/line-auth-entry.js
backend/server.js
backend/production-line-auth-entry.js
supabase/production/2026-11-23-line-auth-entry-sessions.sql  (apply separately; not a Vercel/Render file)
```

All other frontend and backend files remain baseline. Do not deploy the broad Phase 4/5 candidate.

## 3. Required SQL migration

**File:** `supabase/production/2026-11-23-line-auth-entry-sessions.sql`

Production currently has no `line_auth_entry_sessions` table (HTTP 404 read). The migration is required before enabling the route.

It adds:

```text
line_auth_entry_sessions
create_line_auth_entry_session / consume_line_auth_entry_session
create_production_line_auth_entry_session / consume_production_line_auth_entry_session
cleanup_line_auth_entry_sessions
RLS + service-role grants
```

The local disposable PostgreSQL test passed create/consume through the production wrapper. Production application remains **BLOCKED** until owner approval and a backup/rollback point.

## 4. Required Production environment variables — names only

### Must add/confirm

```text
LINE_LOGIN_CHANNEL_ID   (preferred; exact owner-confirmed channel ID)
or PRODUCTION_LINE_CHANNEL_ID
```

### Already present / must remain

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY   (secret; never print)
LINE_CHANNEL_SECRET         (secret; existing notifications)
LINE_CHANNEL_ACCESS_TOKEN   (secret; existing notifications)
STRIPE_SECRET_KEY           (secret; existing commerce)
STRIPE_WEBHOOK_SECRET       (secret; existing commerce)
```

### Optional explicit value

```text
PRODUCTION_LIFF_ID=2010525799-qImIuhla
```

The code currently falls back to this exact Production LIFF ID; setting it explicitly makes the deployment deterministic.

No secret values are included in this report.

## 5. LINE Console configuration required

Owner/LINE administrator must verify:

1. Production LIFF ID is `2010525799-qImIuhla`.
2. Production LIFF endpoint URL remains the existing production URL observed as `https://customize.luckycolorstone.com/`.
3. The Login callback/allowed URL includes the actual return path used by the deployed flow.
4. The ID-token audience equals the `LINE_LOGIN_CHANNEL_ID` value added to Render.
5. The channel allows the Production custom domain.

**Not verified:** LINE Console access was not available. No LINE Console setting was changed.

## 6. Tests

```text
node --test tests/*.test.cjs
Tests:    34
Passed:   34
Failed:   0
Skipped:  0
Duration: 6,504.60 ms
```

Covered locally:

- Step 1 Next -> auth-entry -> Step 2
- LINE callback/session ownership
- ID-token shape/claims verification
- one-time consume and duplicate callback
- expiry and pending lookup
- design-state restoration and failure preservation
- no token in URL/storage
- Vercel route ordering
- existing full customer journey
- commerce function byte-identity
- auth SQL wrapper contract

Broad candidate suite remains separate:

```text
67 tests, 66 passed, 1 skipped (live Stripe key absent)
```

### Not tested

- Real Android Chrome, iPhone Safari, Instagram WebView, LINE in-client
- Live LINE token exchange on Production
- Live Production callback/redirect
- Production Stripe checkout/payment/webhook
- Production CRM/order/stock workflow

Local mocks are **not** real-device or live-Production evidence.

## 7. Production deployment sequence — DO NOT EXECUTE YET

1. Owner approves the release and the exact channel ID.
2. Back up the current Production Supabase schema and record rollback owner.
3. Apply the auth migration to Production Supabase, then verify functions/RLS/grants.
4. Add `LINE_LOGIN_CHANNEL_ID` to Production Render (exact owner-confirmed value).
5. Deploy the frozen backend files to Production Render.
6. Deploy the frozen frontend files to Production Vercel.
7. Verify `/api/liff-config`, `/line-auth-entry`, `/api/auth-entry/sessions/pending`, origin rejection, missing-token rejection, and duplicate/expiry behavior.
8. Verify checkout, Stripe, order, stock, CRM, and catalog are unchanged.
9. Confirm LINE Console callback and audience.
10. Perform authorized real-device acceptance before declaring Production ready.

Do not change aliases/domains as a shortcut. Do not use the broad candidate.

## 8. Rollback sequence

- Vercel: restore `dpl_Ar3kGCsUJF2pVNhP6UHxbsTSBMCJ`.
- Render: restore the current Production deploy recorded before the release (baseline backend `123ed98`).
- SQL: if applied, drop only the auth-entry functions/table; preserve `line_auth_handoffs`, orders, payments, customers, catalog.
- Environment: remove only the newly added channel variable; do not alter existing secrets.
- LINE Console: restore only if a change was approved; no change was made here.
- Do not roll back or alter Stripe, orders, payments, stock, CRM, or customer data.

## 9. Commerce preservation

The minimal candidate is byte-identical to the recovered Production baseline for:

```text
createStripeCheckoutSession
applyStripeCheckoutPaymentEvent
deductStockForOrder
validateOrderStockOrThrow
saveOrderForApi
frontend/crm.js
frontend/crm.html
frontend/data.js
backend/server-order-validation.js
backend/data/stones.json
backend/data/charms.json
backend/data/spacers.json
```

No Phase 4/5 security changes, stock reservation, or broad-candidate code is included.

## 10. Remaining blockers requiring owner approval

1. Exact Production `LINE_LOGIN_CHANNEL_ID` value and ID-token audience confirmation.
2. Approval to add that environment variable.
3. Approval to apply the Production auth SQL migration and its backup/rollback plan.
4. LINE Console callback/endpoint verification.
5. Owner authorization to deploy the frozen backend and frontend.
6. Authorized real-device acceptance and live Stripe/order regression testing.

## 11. Final state

```text
Production deployment:        NONE
Production migration:         NONE
Production database write:    NONE
Environment change:           NONE
Vercel/Render deployment:     NONE
Alias/domain/DNS change:      NONE
LINE Console change:          NONE
GitHub push:                  NONE
Stripe charge:                NONE
```

**Verdict: BLOCKED — Production release package is prepared, but the missing audience environment variable and auth SQL migration must be owner-approved and applied before deployment.**
