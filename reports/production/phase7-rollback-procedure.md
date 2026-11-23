# Phase 7 — UAT Rollback Procedure

**Candidate:** `D:\Projects\lucky-colorstone-line-login-rc-20261123`

**Status:** **PROCEDURE ONLY — NO DEPLOYMENT PERFORMED**

## 1. Record before any approved deployment

Capture without printing secrets:

```text
UAT Vercel project and current deployment ID
UAT custom-domain target/alias
UAT Render service and current deploy ID
UAT backend commit/image
UAT environment variable names and whether set (never values)
UAT Supabase project ref and schema snapshot
Current LINE LIFF endpoint/callback configuration
Current UAT customer/CRM URLs
```

Do not assume a deployment ID from an earlier phase is still current. Verify it in the authorized console before deployment.

## 2. Rollback order

### A. Stop traffic / freeze writes

- Disable or pause any UAT deploy that is actively failing.
- Do not touch Production.
- Do not run a rollback by changing the Production alias.

### B. Vercel

1. Re-point the UAT custom domain/alias to the previously recorded deployment.
2. Confirm `/` and `/crm.html` load from the previous build.
3. Confirm `/line-auth-entry` behaves as it did before the change (or is absent if not present previously).
4. Confirm `/api/(.*)` points to the previous UAT Render host.
5. Purge/ignore caches only if the platform requires it; verify with a cache-busted request.

### C. Render

1. Roll back the UAT service to the previously recorded deploy.
2. Restore only the UAT environment variable set; do not copy Production values.
3. Verify `/api/liff-config` and `/api/auth-entry/sessions/pending` fail/behave as before.
4. Confirm checkout/Stripe/webhook/order endpoints are reachable and unchanged.

### D. Auth SQL rollback (only if applied)

Run only against UAT, with owner approval:

```sql
-- From the migration rollback comments
drop function if exists public.cleanup_line_auth_entry_sessions(int);
drop function if exists public.consume_production_line_auth_entry_session(text, text, text);
drop function if exists public.create_production_line_auth_entry_session(text, text, text, text, int);
drop function if exists public.consume_line_auth_entry_session(text, text, text);
drop function if exists public.create_line_auth_entry_session(text, text, text, text, int);
drop table if exists public.line_auth_entry_sessions;
```

Do **not** drop or alter `line_auth_handoffs`, orders, payments, customers, catalog, or any Production object. Confirm existing handoffs remain.

### E. LINE Console

Only if the owner approved a console change for this test:

- restore the previous LIFF endpoint/callback URLs;
- restore previous channel settings;
- do not alter Production channel configuration.

If no console change was made, no rollback is required.

### F. Secrets

- Remove any temporary UAT-only values created for the test.
- Rotate a secret if it was exposed in logs/build artifacts.
- Never print the value in a report.

## 3. Verification after rollback

```text
[ ] UAT custom domain loads
[ ] Previous Step 1/2/3/4 flow works
[ ] Checkout request still targets the prior UAT backend
[ ] No Production host/database is referenced
[ ] Auth-entry SQL objects are restored/absent as intended
[ ] Existing handoffs/orders/payments/customers preserved
[ ] No new 5xx or root JavaScript exception
[ ] No secret in evidence
```

## 4. Current state

No UAT deployment, alias change, Render deployment, SQL migration, LINE Console change, or Production action was performed in Phase 7. This procedure is ready for an owner-authorized execution.
