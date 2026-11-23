# Phase 7 — Environment Requirements

**Candidate:** `D:\Projects\lucky-colorstone-line-login-rc-20261123`

**Status:** **REQUIREMENTS DOCUMENTED — NOT CONFIGURED**

No secret value is reproduced in this report. Presence/absence only.

## 1. Frontend / Vercel

| Name | Consumer | UAT requirement | Secret |
|---|---|---|---|
| `PRODUCTION_LIFF_ID` | `frontend/api/liff-config.js`, `backend/api/liff-config.js` | Must be overridden to the **UAT LIFF ID** for a UAT build; current default is Production | No |
| `UAT_LIFF_ID` | Referenced only as `UAT_LIFF_ENV_VARIABLE` in `liff-environment-config.js` | Not consumed by the current serverless config route; cannot be relied on alone | No |
| UAT LIFF ID | LINE Login | Owner-confirmed UAT LIFF ID; do not use Production ID | No |
| UAT custom domain | Browser/parent origin | `https://uat.customize.luckycolorstone.com` | No |
| UAT Render API host | `/api/(.*)` rewrite | Must point to the UAT Render service; current file points to Production | No |
| `APP_ENV` | `frontend/app.js` | Currently hardcoded `'production'`; UAT overlay must explicitly define the intended environment | No |
| `PUBLIC_ORIGIN` | `backend/production-line-auth-entry.js` | Must equal the UAT browser origin; currently hardcoded Production | No |
| `environment` from `/api/liff-config` | App startup | Must return `uat` for UAT; current handler hardcodes `production` | No |

### Blocking note

The frozen candidate cannot be UAT-validated as-is at the UAT custom domain because the server-side origin check rejects it. A UAT-specific overlay is required before deployment; see `phase7-uat-deployment-checklist.md`.

## 2. Backend / Render

### Auth-entry minimum

| Name | Consumer | Requirement | Secret |
|---|---|---|---|
| `PORT` | `server.js` | Platform-provided port | No |
| `LINE_LOGIN_CHANNEL_ID` or `PRODUCTION_LINE_CHANNEL_ID` | `production-line-auth-entry.js` | Channel ID used to validate the ID-token audience; must match the UAT LIFF/channel configuration | No |
| `SUPABASE_URL` | `server.js` | UAT Supabase project URL | No |
| `SUPABASE_SERVICE_ROLE_KEY` | `server.js` | UAT service-role key; server-only | **YES — never print/store in repo** |
| `PUBLIC_CUSTOMER_ORIGIN` | `server.js` | UAT customer origin | No |
| `PUBLIC_CRM_ORIGIN` | `server.js` | UAT CRM origin | No |
| `CUSTOMER_APP_URL` | `server.js` | UAT customer URL | No |
| `CRM_URL` | `server.js` | UAT CRM URL | No |

### Existing commerce configuration inherited from Production

The minimal release preserves the existing backend. UAT must provide safe UAT/test values, not Production values:

```text
DATA_DIR / RENDER_PERSISTENT_DATA_DIR
LINE_CHANNEL_ACCESS_TOKEN (secret)
LINE_CHANNEL_SECRET (secret)
LINE_PUSH_API_URL / LINE_PUSH_TIMEOUT_MS
STRIPE_SECRET_KEY (test mode only)
STRIPE_WEBHOOK_SECRET (test mode)
ADMIN_LINE_GROUP_ID
ADMIN_LINE_USER_IDS
META_PIXEL_ID / META_CONVERSIONS_API_ACCESS_TOKEN (if testing analytics)
IMAGE_UPLOAD_* (if testing uploads)
```

Do not set `STOCK_RESERVATION_RPC_ENABLED`.

## 3. LINE platform

```text
Channel ID:              2010525799 (shared owner-confirmed channel)
Production LIFF ID:      2010525799-qImIuhla
UAT LIFF ID:             2010525799-Sw5UFc6E
```

UAT requirements:

- UAT LIFF endpoint URL points at the UAT custom domain.
- Callback/redirect URLs allow `https://uat.customize.luckycolorstone.com/line-auth-entry`.
- The channel audience accepted by the verifier matches the UAT LIFF token audience.
- No LINE Console change is made by this phase.

The owner must confirm the exact callback URL and shared-channel behavior in the LINE Developers Console.

## 4. Supabase

```text
UAT project ref:       crviqzaziboxshbzhpri
Production project:    fjzchgjqwxfndkplztxq
```

Rules:

- UAT service-role key only; never Production service-role key.
- Apply `2026-11-23-line-auth-entry-sessions.sql` to UAT only with explicit approval.
- Verify functions, RLS, grants, table uniqueness, and expiry.
- No Production database migration or write.
- No secret in a frontend bundle, report, screenshot, or chat.

## 5. SQL requirements

The draft migration defines:

```text
line_auth_entry_sessions
create_line_auth_entry_session(...)
consume_line_auth_entry_session(...)
create_production_line_auth_entry_session(...)  (service RPC wrapper)
consume_production_line_auth_entry_session(...) (service RPC wrapper)
cleanup_line_auth_entry_sessions(...)
```

The wrapper names were added because the auth service calls the production-prefixed names. The local PostgreSQL 14.4 smoke test passed create/consume. This does not prove the UAT database schema.

## 6. Vercel routing

Required order:

```text
/line-auth-entry -> /line-auth-entry.html
/api/liff-config -> /api/liff-config.js
/api/(.*) -> UAT Render API
filesystem fallback
```

The frozen file currently points the API catch-all at the Production Render host. That must not be deployed unchanged to UAT.

## 7. Render

- Node `>=18`, existing package-lock.
- No `STOCK_RESERVATION_RPC_ENABLED`.
- No Phase 5 stock migration.
- Health/startup check before traffic.
- Preserve existing commerce endpoints and Stripe webhook path.

## 8. Not configured

```text
UAT deployment:             NOT PERFORMED
UAT env vars:               NOT SET
UAT SQL migration:          NOT APPLIED
LINE Console:               NOT CHANGED
Production:                 UNCHANGED
```
