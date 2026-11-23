# LINE Login Production — Final Change Manifest

**Candidate:** `D:\Projects\lucky-colorstone-line-login-rc-20261123`

**Runtime freeze:** `c068cbd`  
**Pre-report docs HEAD:** `1827968`  
**Manifest:** `06160361799cf7ccc2703f6079b6b87d7a84a343edaf23c8221dca93911bd977`

**Pre-flight:** **PASS**  
**Final status:** **AWAITING FINAL EXECUTION CONFIRMATION**

No Production or UAT change was executed.

## 1. Candidate integrity

```text
Frontend files: 329 (327 baseline + 2 auth-entry files)
Backend files:  506 (505 baseline + auth service)
Manifest file mismatches: 0
Runtime diff since Phase 6 freeze: NONE
Full suite: 35 tests, 35 passed, 0 failed, 0 skipped
```

Approved runtime differences from the recovered Production baselines:

```text
frontend/app.js
frontend/vercel.json
frontend/line-auth-entry.html
frontend/line-auth-entry.js
backend/server.js
backend/production-line-auth-entry.js
supabase/production/2026-11-23-line-auth-entry-sessions.sql
```

Commerce and CRM/catalog files remain byte-identical to baseline:

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

## 2. Supabase Production

```text
Project: fjzchgjqwxfndkplztxq
Region: ap-southeast-1
Migration history: no LINE auth-entry migration
line_auth_entry_sessions: ABSENT
auth functions: ABSENT
No partial auth objects: confirmed
```

Verified backups:

```text
Latest completed physical backup: id 2348035637
Inserted: 2026-11-22T23:27:54.098Z
Status: COMPLETED
PITR enabled: false
WALG/physical backup enabled: true
```

The latest completed physical backup is the pre-change restore point. A fresh backup immediately before execution remains recommended if the platform supports on-demand backup; none was created in this task.

### Migration file

```text
supabase/production/2026-11-23-line-auth-entry-sessions.sql
sha256: e9205b1029ede9955bed6b67d80cfa3eef014ce1b59a13c711c51d12c518080f
```

Objects created:

```text
table public.line_auth_entry_sessions
index idx_line_auth_entry_one_pending_per_tab
index idx_line_auth_entry_expiry
index idx_line_auth_entry_browser_pending
function public.create_line_auth_entry_session(text,text,text,text,int)
function public.consume_line_auth_entry_session(text,text,text)
function public.create_production_line_auth_entry_session(text,text,text,text,int)
function public.consume_production_line_auth_entry_session(text,text,text)
function public.cleanup_line_auth_entry_sessions(int)
RLS, revokes, service_role grants
```

### Expiry-retry fix present

```sql
delete from public.line_auth_entry_sessions s
 where s.browser_id = p_browser_id
   and s.tab_session_id = p_tab_session_id
   and s.consumed_at is null
   and s.expires_at <= now();
```

This runs before insert in `create_line_auth_entry_session`. It removes only an expired, unconsumed session for the same browser/tab.

## 3. Render Production

```text
Service: lucky-colorstone-designer
Service ID: srv-d8v7cknlk1mc739o88lg
Current deployment: dep-dc04ntd9fdbs73ci25eg
Current status: live
Current commit: 123ed986ccc9977d21418094ae311690a6286fae
```

Exact environment change prepared:

```text
LINE_LOGIN_CHANNEL_ID=2010525799
```

No other variable is to change. Current env contains `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, LINE notification secrets, Stripe secrets, admin/analytics values; values were not printed.

Backend files to deploy:

```text
backend/server.js
backend/production-line-auth-entry.js
```

All other backend files remain baseline.

## 4. Vercel Production

```text
Project: lucky-colorstone-designer
Project ID: prj_oIiZd2rNPCxrGpOY0xrCExS6sbSP
Current deployment: dpl_Ar3kGCsUJF2pVNhP6UHxbsTSBMCJ
Status: READY, target production
Aliases verified:
  https://customize.luckycolorstone.com
  https://crm.luckycolorstone.com
  https://lucky-colorstone-designer.vercel.app
```

Frontend files to deploy:

```text
frontend/app.js
frontend/vercel.json
frontend/line-auth-entry.html
frontend/line-auth-entry.js
```

The candidate `frontend/vercel.json` routes `/api/(.*)` to:

```text
https://lucky-colorstone-designer.onrender.com/api/$1
```

Target deployment ID will be assigned by Vercel after deployment; no target ID is invented.

## 5. LINE configuration

```text
Channel ID:       2010525799
LIFF ID:          2010525799-qImIuhla
LIFF URL:         https://liff.line.me/2010525799-qImIuhla
Endpoint URL:     https://customize.luckycolorstone.com/
Scopes:           openid, profile
```

Verifier compatibility: PASS — `validateLineClaims` requires exact `aud` equality; `LINE_LOGIN_CHANNEL_ID=2010525799` supplies the confirmed audience.

Callback compatibility: the owner-confirmed endpoint is the production root. The new `/line-auth-entry` page returns to `/` after LIFF init; the root handles pending auth-entry recovery. No LINE Console change is proposed. Console settings were not independently read; owner confirmation is the evidence.

## 6. Pre-flight results

| Check | Result |
|---|---|
| Candidate path/worktree | PASS |
| Frozen runtime files | PASS |
| Phase 6 baseline manifest | PASS, 0 mismatches |
| Only approved LINE files/SQL differ | PASS |
| Full test suite | PASS 35/35 |
| Commerce hashes | PASS |
| CRM/catalog hashes | PASS |
| SQL expiry fix | PASS locally |
| SQL RLS/grants/function design | PASS |
| Production auth schema absent | CONFIRMED |
| No partial auth objects | PASS |
| Production backup | PASS — completed physical backup |
| Render target/deployment | PASS |
| Render channel env absent | CONFIRMED — change prepared |
| Vercel target/aliases | PASS |
| LINE values | PASS (owner-confirmed) |
| Production/UAT crossover | NONE FOUND |
| Real-device/live tests | NOT TESTED |

## 7. Execution sequence — awaiting confirmation

1. Confirm/refresh Production Supabase backup immediately before change.
2. Apply the auth migration to Production Supabase; verify table, functions, RLS, grants, service_role bypass.
3. Set `LINE_LOGIN_CHANNEL_ID=2010525799` on Production Render only.
4. Deploy the two backend files to Render.
5. Deploy the four frontend files to Vercel.
6. Verify `/line-auth-entry`, `/api/liff-config`, origin/header rejection, missing-token rejection, duplicate/expired callback, and design restoration.
7. Verify checkout/Stripe/order/stock/CRM/catalog unchanged.
8. Run authorized real-device and live commerce acceptance.
9. Monitor, then declare release complete.

## 8. Rollback

- Vercel: restore `dpl_Ar3kGCsUJF2pVNhP6UHxbsTSBMCJ`.
- Render: restore `dep-dc04ntd9fdbs73ci25eg` (commit `123ed98`).
- SQL: drop only auth-entry functions/table listed above; preserve `line_auth_handoffs`, orders, payments, customers, catalog.
- Environment: remove only `LINE_LOGIN_CHANNEL_ID` if added.
- LINE Console: no change made; restore only if an approved change occurs.
- Do not alter Stripe, Checkout, Webhook, Order, Stock, CRM, or Catalog data.

## 9. Customer impact

No planned downtime. Render deployment may cause a brief service restart. The new route is additive; existing checkout/order flow is unchanged in code. Real-device impact is untested.

## 10. Remaining risks / owner decisions

1. Real Android/iPhone/Instagram/LINE in-client acceptance is NOT TESTED.
2. Live LINE token exchange, callback, and UAT/Production device behavior are NOT TESTED.
3. Live Stripe/order/stock/CRM regression is NOT TESTED.
4. Latest physical backup is available, but PITR is disabled; owner should confirm the restore window.
5. LINE Console callback was not independently read; owner evidence is required.
6. Explicit final approval is required to apply SQL, set the Render variable, deploy backend, deploy frontend, and execute production tests.

**Final manifest state: AWAITING FINAL EXECUTION CONFIRMATION.**
