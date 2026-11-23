# Phase 7 — UAT Deployment Checklist

**Frozen candidate:** `D:\Projects\lucky-colorstone-line-login-rc-20261123`

**HEAD:** `c068cbd`

**Manifest:** `5b55d61cc7156e57e8a08056737f54aef9ef79c8133960d3b26f23bf082fae02`

**Status:** **NOT EXECUTED — OWNER AUTHORIZATION AND UAT CONFIGURATION REQUIRED**

## 1. Preconditions

- [ ] Owner explicitly authorizes UAT deployment.
- [ ] Owner authorizes the UAT auth SQL migration.
- [ ] UAT Vercel and Render projects are confirmed, not Production.
- [ ] The UAT-specific origin/config gap is resolved (see section 2).
- [ ] A backup/current deployment ID is recorded for rollback.
- [ ] No Production credentials are used.
- [ ] No `STOCK_RESERVATION_RPC_ENABLED` is set.
- [ ] The broad Phase 4/5 candidate is not used.

## 2. Critical UAT configuration gap

The frozen candidate is a **Production-minimal** build. It is not directly deployable to `https://uat.customize.luckycolorstone.com` without an owner-approved UAT build/config overlay because:

- `frontend/app.js` contains `const APP_ENV = 'production'`;
- `backend/production-line-auth-entry.js` hardcodes `PUBLIC_ORIGIN = 'https://customize.luckycolorstone.com'`;
- `frontend/vercel.json` rewrites `/api/(.*)` to `lucky-colorstone-designer.onrender.com`;
- `frontend/api/liff-config.js` and `backend/api/liff-config.js` default to the Production LIFF ID and return `environment: 'production'`.

Therefore an exact UAT deployment would reject the UAT Origin and could point at Production services. This is a **release blocker**, not a deployment step to improvise.

Required owner-approved options:

1. Approve a small UAT-only build overlay for `APP_ENV`, `PUBLIC_ORIGIN`, the Liff config environment, and the UAT Render host; or
2. Approve a different UAT validation host configuration that is proven to match the production origin; or
3. Defer UAT validation.

Do not edit the frozen candidate in place for deployment.

## 3. UAT deployment sequence (after approval)

### A. Freeze and package

- [ ] Confirm `git status` is clean and HEAD is `c068cbd`.
- [ ] Verify `minimal-candidate-manifest.json`: 329 frontend files, 506 backend files, 0 missing, 0 mismatches.
- [ ] Build the UAT-specific overlay, if approved, from the frozen files only.
- [ ] Store the overlay diff and hashes with the release evidence.
- [ ] Exclude `tests/`, `reports/production/evidence/`, and all secrets from deployment if the platform would otherwise serve them.

### B. UAT database

- [ ] Confirm the UAT Supabase project is separate from Production.
- [ ] Snapshot current UAT schema/table state.
- [ ] Apply `2026-11-23-line-auth-entry-sessions.sql` only with explicit approval.
- [ ] Verify `create_production_line_auth_entry_session`, `consume_production_line_auth_entry_session`, RLS, grants, and table columns.
- [ ] Record rollback SQL and a rollback owner.
- [ ] Do not write Production orders/customers/payments.

### C. Vercel UAT

- [ ] Deploy the approved UAT build to the UAT Vercel project.
- [ ] Set the UAT environment values listed in `phase7-environment-requirements.md`.
- [ ] Verify `/line-auth-entry` resolves to `line-auth-entry.html` before the API catch-all.
- [ ] Verify the API rewrite points to the UAT Render service, not Production.
- [ ] Confirm the UAT custom domain is still routed to the intended deployment.
- [ ] Do not change the Production alias/domain.

### D. Render UAT

- [ ] Deploy only the frozen backend plus approved UAT overlay.
- [ ] Confirm Node runtime and package-lock compatibility.
- [ ] Set UAT-only environment values; never print secret values.
- [ ] Confirm `/api/liff-config` returns the UAT environment/ID.
- [ ] Confirm `/api/auth-entry/sessions/pending` fails closed without proper origin/header.
- [ ] Do not set stock reservation variables.

### E. LINE Console

- [ ] Owner/LINE administrator confirms the UAT LIFF endpoint and callback/redirect URLs.
- [ ] Confirm the UAT domain is allowed.
- [ ] Do not change Production LINE Console settings.

### F. Smoke gate before device tests

- [ ] Landing loads with no root JavaScript exception.
- [ ] Step 1/2 unaffected.
- [ ] Next -> `/line-auth-entry` starts.
- [ ] Missing origin/header returns 403.
- [ ] Missing channel config returns 503.
- [ ] Expired/duplicate session fails closed.
- [ ] Checkout request payload remains compatible.
- [ ] No Production network or database call from UAT.

## 4. Evidence

Capture:

- deployment IDs and build hashes;
- environment variable **names only** and whether each is set;
- commit/worktree provenance;
- smoke-test screenshots/network traces with tokens/cookies/PII redacted;
- SQL apply/rollback output;
- all failed and blocked cases.

## 5. Stop conditions

Stop immediately if:

- the deployment would target Production;
- the UAT origin is not accepted by the auth service;
- the UAT backend host resolves to Production;
- the SQL migration would touch Production;
- secrets appear in a build artifact or report;
- a root JavaScript exception or checkout regression appears.

## 6. Current state

**No deployment, migration, Render/Vercel change, alias/domain change, LINE Console change, or Production action was performed.**
