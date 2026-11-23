# Phase 6 — Minimal LINE Login Release Audit

**Candidate:** `D:\Projects\lucky-colorstone-line-login-rc-20261123`

**Date:** 2026-11-23 (Asia/Bangkok)

**Status:** **LOCAL MINIMAL CANDIDATE READY FOR UAT REVIEW — NOT PRODUCTION READY**

## 1. Intended journey

1. Customer clicks **Next** in Step 1.
2. The app saves the current design and starts the auth-entry route.
3. The browser goes to LINE Login.
4. LINE returns to the site with a browser/tab-bound session.
5. The app sends the LINE ID token to the server.
6. The server verifies the token, atomically consumes the handoff, and restores the saved design.
7. The customer continues at Step 2.

## 2. Exact release contents

The candidate is built from the exact recovered Production baselines and adds only:

```text
frontend/app.js
frontend/line-auth-entry.html
frontend/line-auth-entry.js
frontend/vercel.json
backend/server.js
backend/production-line-auth-entry.js
supabase/production/2026-11-23-line-auth-entry-sessions.sql
```

The minimal candidate has **no** Phase 5 stock implementation, no rate limiter, no upload validator, no Pyrite/gray-agate fixture change, no CRM XSS change, and no PII storage split.

## 3. LINE flow implementation

### Step 1 Next

`frontend/app.js`:

- `attemptStep1AuthorizationAndContinue({ explicitLogin })` branches to `startAutoAuthEntryForCustomization` for eligible external production mobile browsers.
- `startAutoAuthEntryForCustomization`:
  - creates a bounded design handoff (`createDeferredLineAuthHandoff`, target Step 2);
  - generates a browser/tab opaque ID;
  - writes only opaque pending metadata to `sessionStorage`;
  - calls `saveState()`;
  - POSTs to `/api/line-auth-entry`;
  - redirects to `/line-auth-entry`.

### Auth-entry page

`frontend/line-auth-entry.js`:

- fetches `/api/liff-config`;
- calls `liff.init({ liffId, withLoginOnExternalBrowser: true })`;
- has a bounded fallback if LINE init does not complete;
- never places an ID token, cookie, or LINE user ID in the URL.

### Server verification

`backend/production-line-auth-entry.js`:

- validates the ID-token shape and exact issuer/audience/expiry/iat/subject;
- calls the LINE verifier server-side;
- binds a browser cookie `__Host-lc-line-auth-browser`;
- enforces the `X-LC-Auth-Entry` marker and production origin;
- bounds the request body to 8 KiB;
- uses a 600-second session TTL;
- refuses missing/invalid/expired sessions and duplicate consumption.

`backend/server.js` adds only:

- service require/initialization;
- `X-LC-Auth-Entry` in allowed CORS headers;
- `isAuthEntryPath(pathname)` dispatch before normal API body handling.

### Restoration

`handleAutoAuthEntryReturn` sends the verified ID token and opaque session IDs to `/api/line-auth-consume`. `applyInitialHandoffSnapshot` validates the design shape, restores state, and lands on Step 2. A failure returns to Step 1 and does not remove the saved design.

## 4. SQL draft

`supabase/production/2026-11-23-line-auth-entry-sessions.sql` adds:

- `line_auth_entry_sessions`;
- base create/consume/cleanup functions;
- production-prefixed wrapper functions matching the service RPC names;
- RLS and service-role-only grants.

A local PostgreSQL smoke test created and consumed a session through the production wrapper. **The migration was not applied to UAT or Production.**

## 5. Isolation answer

**Minimal candidate: YES.** Its only runtime differences from the recovered baselines are LINE Login files, auth dispatch/CORS header, the auth SQL draft, and the auth-entry bundle.

**Broad candidate: NO.** The Phase 4/5 candidate contains stock reservation, PII, CRM security, catalog, rate-limit, upload, CSP, and other changes. It must not be presented as a LINE-only release.

## 6. What is not validated

- Real Android Chrome, iPhone Safari, Instagram WebView, and LINE in-client behavior.
- Actual LINE channel/verifier and Supabase session table in UAT.
- Custom-domain `/line-auth-entry` routing.
- Real LINE token exchange on a device.
- Production verification.

No real-device PASS is claimed.
