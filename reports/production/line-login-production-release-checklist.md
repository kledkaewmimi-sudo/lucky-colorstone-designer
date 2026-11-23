# LINE Login Production Release Checklist

**Candidate:** `D:\Projects\lucky-colorstone-line-login-rc-20261123`

**Date:** 2026-11-23 (Asia/Bangkok)

**Status:** **BLOCKED — DO NOT DEPLOY YET**

No Production or UAT change was performed.

## 1. Confirmed items

```text
Provider:                 Lucky Colorstone
Channel:                  LUCKY.COLORSTONE
Channel ID:               2010525799
Channel status:           Published
Production LIFF ID:       2010525799-qImIuhla
LIFF URL:                 https://liff.line.me/2010525799-qImIuhla
LIFF Endpoint URL:        https://customize.luckycolorstone.com/
Scopes:                   openid, profile
LIFF size:                Full
Production origin:        https://customize.luckycolorstone.com
Production API host:      https://lucky-colorstone-designer.onrender.com
Production Vercel:        dpl_Ar3kGCsUJF2pVNhP6UHxbsTSBMCJ
Production Supabase:      https://fjzchgjqwxfndkplztxq.supabase.co
Production Render:        srv-d8v7cknlk1mc739o88lg
```

The owner-confirmed channel ID matches the existing test channel used by the Phase 6 verifier. The code validates exact `aud` equality; setting `LINE_LOGIN_CHANNEL_ID=2010525799` makes the expected audience correct.

## 2. PASS / FAIL / BLOCKED

| Check | Result | Evidence |
|---|---|---|
| Token verifier expects confirmed channel ID | **PASS** | `validateLineClaims` exact `aud`; tests use `2010525799` |
| Production LIFF ID matches candidate | **PASS** | live `/api/liff-config` returns `2010525799-qImIuhla` |
| Production origin matches candidate | **PASS** | code `PUBLIC_ORIGIN`; owner endpoint |
| Production API host matches candidate | **PASS** | `frontend/vercel.json` rewrite |
| Production channel env variable present | **FAIL/BLOCKED** | Render env names show neither `LINE_LOGIN_CHANNEL_ID` nor `PRODUCTION_LINE_CHANNEL_ID` |
| Production auth SQL already applied | **FAIL/BLOCKED** | no session table; no auth functions in schema |
| Auth table/functions absent | **CONFIRMED** | `to_regclass` and `to_regprocedure` return null |
| Production auth routes deployed | **FAIL/BLOCKED** | `/line-auth-entry`, pending/auth APIs return 404 |
| RLS on planned table | **PASS design** | migration enables RLS; anon/auth cannot access; service_role has BYPASSRLS |
| Function permissions | **PASS design** | public/anon/authenticated revoked; service_role granted |
| SECURITY DEFINER search path | **PASS with recommendation** | `search_path=public`; references qualified; consider `pg_catalog, public` |
| One-time consume atomicity | **PASS design** | session + handoff updated in one function/transaction; replay returns not found |
| Duplicate callback handling | **PASS local tests** | duplicate consume/expired tests pass |
| Expiry retry after a pending session expired | **PASS locally** | expired unconsumed row for the same browser/tab is removed before insert; production not applied |
| Local migration apply/repeat/rollback | **PASS local PostgreSQL 14.4** | prior local evidence; no Production execution |
| Real-device LINE test | **NOT TESTED** | no device execution |
| Live Production checkout/order/stock | **NOT TESTED** | preparation only |
| Commerce code unchanged | **PASS local hash** | five required functions byte-identical |
| CRM/catalog unchanged | **PASS local hash** | baseline files byte-identical |

## 3. Production schema and migration history

Read-only checks:

```text
Public tables: 23
line_auth_entry_sessions: absent
create/consume auth functions: absent
line_auth_handoffs: present, 166 rows, RLS enabled, postgres/service_role ACL
orders: present, 243 rows
catalog_stones: 41 rows (Supabase is authoritative; not modified)
```

Migration history latest entries do not include this auth migration. The exact required file is:

```text
supabase/production/2026-11-23-line-auth-entry-sessions.sql
```

## 4. SQL migration review findings

### PASS

- Additive table; no existing table altered.
- RLS enabled; no anon/authenticated policies.
- Public/anon/authenticated table access revoked; service_role only.
- Production `service_role` has `BYPASSRLS`, so the direct pending lookup can read the table.
- Functions are `SECURITY DEFINER` with `search_path=public`.
- Function execute is revoked from public/anon/authenticated and granted only to service_role.
- Session and handoff are consumed atomically; a failed handoff update raises and rolls back the session update.
- TTL is bounded to 60–1200 seconds and capped by the handoff expiry.
- Replay/duplicate consume returns no row; no second session consumption.
- Local apply twice and rollback passed on disposable PostgreSQL.
- Rollback drops only auth-entry functions/table; existing handoffs/orders/payments/customers remain.

### FIXED — expiry retry

The local migration now removes only this row before insert:

```sql
delete from public.line_auth_entry_sessions s
 where s.browser_id = p_browser_id
   and s.tab_session_id = p_tab_session_id
   and s.consumed_at is null
   and s.expires_at <= now();
```

This permits an immediate retry after the previous session expires while retaining the partial unique index for active sessions. It does not remove consumed sessions, active sessions, other browser/tab sessions, or handoffs. The change is **local only and not applied to Production/UAT**.

### Recommendation

Use `set search_path = pg_catalog, public` for future SECURITY DEFINER functions, or keep qualified references. Current production auth-handoff function uses the same `search_path=public` pattern, so this is a hardening recommendation, not a release-stopping finding.

## 5. Exact Production changes required

### SQL

Apply only after owner approval and a backup:

```text
supabase/production/2026-11-23-line-auth-entry-sessions.sql
```

including the locally tested expiry-retry fix above; not applied.

### Render environment

```text
LINE_LOGIN_CHANNEL_ID=2010525799
```

No other Render environment value should change.

### Vercel

Deploy the frozen frontend files, including the `/line-auth-entry` route:

```text
frontend/app.js
frontend/vercel.json
frontend/line-auth-entry.html
frontend/line-auth-entry.js
```

### Render

Deploy the frozen backend files:

```text
backend/server.js
backend/production-line-auth-entry.js
```

All other app files remain baseline.

### LINE Console

Confirmed configuration is compatible with the intended flow, but no Console change was made. Verify after deployment that the existing endpoint URL `https://customize.luckycolorstone.com/` is the intended LINE return endpoint and that the Login callback is accepted. No callback change is currently proposed.

## 6. Commerce preservation

Byte-identical to the recovered Production baseline:

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

No stock reservation, CSP/security rewrite, catalog change, or broad Phase 4/5 code is included.

## 7. Tests

```text
node --test tests/*.test.cjs
Tests:    35
Passed:   35
Failed:   0
Skipped:  0
Duration: 16,964.95 ms
```

Local only: Step 1 Next -> LINE redirect contract, callback/session ownership, ID-token claims, duplicate/expiry, design restoration, no token in URL/storage, route ordering, full journey, commerce hashes.

Not tested: real Android/iPhone/Instagram/LINE in-client, live LINE token exchange, Production callback, live Stripe/order/stock/CRM.

## 8. Deployment sequence — awaiting authorization

1. Owner approves the final migration and records backup/rollback ownership.
3. Apply the auth migration to Production Supabase.
4. Verify table, functions, RLS, grants, service_role bypass, and cleanup.
5. Add `LINE_LOGIN_CHANNEL_ID=2010525799` to Production Render.
6. Deploy the frozen backend to Production Render.
7. Deploy the frozen frontend to Production Vercel.
8. Verify `/line-auth-entry` route, LIFF config, origin rejection, missing-token rejection, duplicate/expiry behavior.
9. Confirm the existing LINE Console endpoint/callback.
10. Run authorized real-device acceptance and Stripe/order/CRM/stock regression.
11. Monitor and only then declare release complete.

## 9. Rollback

- Vercel: restore `dpl_Ar3kGCsUJF2pVNhP6UHxbsTSBMCJ`.
- Render: restore the pre-release Production deploy at `123ed98` (record current deploy ID before change).
- SQL: drop only `line_auth_entry_sessions` and its auth functions; preserve `line_auth_handoffs`, orders, payments, customers, catalog.
- Environment: remove only `LINE_LOGIN_CHANNEL_ID` if added.
- LINE Console: no change was made; restore only if an approved change occurs.
- Do not alter commerce data, Stripe, orders, stock, CRM, or catalog.

## 10. Remaining owner decisions

1. Approve the Production auth migration and backup plan.
3. Approve adding `LINE_LOGIN_CHANNEL_ID=2010525799`.
4. Approve Production backend/frontend deployment.
5. Approve real-device and live commerce regression testing.
6. Confirm the LINE Console endpoint/callback remains the existing root URL.

**Final status: BLOCKED on the missing Production environment variable, absent Production auth schema, and pending deployment/real-device authorization. The local expiry-retry fix is complete and tested; no external action was executed.**
