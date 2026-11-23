# Phase 3B.5 — private device QA session

## Scope and default behavior

`DEFER_LINE_LOGIN_TO_STEP4` remains hard-coded `false`. No normal visitor changes
flow: mobile still requires LINE before Step 1, and desktop retains its existing
bypass. The new mechanism only adds a second, server-validated source for the
effective deferred-login state on a specifically approved QA device.

No Stripe, payment, webhook, CRM, Orders, pricing, renderer, analytics, UTM,
Meta Pixel, or LINE notification behavior was changed.

## Session design

The server creates a 256-bit `base64url` token (43 opaque characters), stores
only `token`, `created_at`, `expires_at`, and optional `revoked_at`, and uses a
fixed 45-minute TTL (`2,700,000 ms`). It stores no LINE token/profile, customer
identity, payment data, or secret.

The manual migration is
[`supabase/deferred_login_qa_sessions_migration.sql`](../../supabase/deferred_login_qa_sessions_migration.sql).
It enables RLS and revokes browser roles. Server-side Supabase service-role code
is the only table access path.

### Endpoints

| Endpoint | Authorization | Purpose |
| --- | --- | --- |
| `POST /api/internal/deferred-login-qa-sessions` | `Authorization: Bearer` with `DEFERRED_LOGIN_QA_ADMIN_SECRET` | Creates one short-lived opaque QA token. |
| `POST /api/internal/deferred-login-qa-sessions/revoke` | same | Revokes one exact token. |
| `POST /api/deferred-login-qa-sessions/activate` | valid opaque token in POST body | Validates once and sets the device session cookie. |
| `GET /api/deferred-login-qa-sessions/current` | validated HttpOnly cookie | Revalidates effective QA state. |
| `POST /api/deferred-login-qa-sessions/deactivate` | none | Clears only the current device cookies. |

The internal routes return a generic `404` without the server-side admin secret.
No endpoint accepts a boolean feature flag.

## Device binding and redirect survival

After an activation succeeds, the server writes:

- `__Host-lucky-deferred-login-qa`: opaque, `HttpOnly`, `Secure`, `SameSite=Lax`,
  `Path=/`, expiry-bounded.
- `lucky_deferred_login_qa_probe=1`: a non-sensitive probe cookie, **not** an
  authorization signal.

The app asks the server to validate the HttpOnly cookie only when the probe is
present. A probe copied or invented by a user still returns `enabled: false`.
The `SameSite=Lax` cookie survives the top-level LINE OAuth return and the app
revalidates it before callback planning, so a valid same-device callback remains
in QA mode. Invalid, expired, revoked, storage-unavailable, and validation-error
states all resolve to false.

For practical same-browser activation, an administrator may share a private,
short-lived URL whose **fragment** is `#deferred-login-qa=<opaque-token>`. This is not
a query flag and never reaches the server as a URL/referrer. The app POSTs the
opaque token to the activation endpoint, requires server validation, and removes
the fragment immediately with `history.replaceState`. A random or altered
fragment cannot enable QA mode.

## Effective flag integration

`app.js` derives effective state as:

```text
DEFER_LINE_LOGIN_TO_STEP4 === true OR validated QA session === true
```

The result feeds the existing initial mobile guard, Step 3 deferred-auth boundary,
and pre-reset callback restore. The static production flag remains false, and a
normal visitor has no probe cookie and performs no QA validation request.

## Manual owner procedure (after migration and environment configuration)

1. In the correct Supabase project, run the migration file above once. Do not
   change or delete existing handoff rows.
2. In the Render backend environment, set a newly generated, high-entropy
   `DEFERRED_LOGIN_QA_ADMIN_SECRET`. Keep it in the deployment secret store; do
   not send it through chat or put it in source control. Redeploy the backend.
3. From a trusted administrator-only HTTP client, call the internal create
   endpoint with that secret. Treat the returned 43-character QA token like a
   short-lived test credential.
4. On exactly one target device/browser, open the normal production landing URL
   with `#deferred-login-qa=<returned-token>` appended. Confirm the fragment
   disappears immediately. It is then safe to begin the normal landing flow.
5. Test the intended path: Landing → Step 1 → Step 2 → Step 3 → LINE login →
   callback → restored Step 4. Confirm the complex pre-login design, Beryl
   sequence, current price, and first-touch UTM/session data survive.
6. Test in Instagram in-app browser, LINE in-app browser, Chrome Android, and
   Safari iOS separately. Each browser needs its own newly issued session.
7. End testing by calling the current-device deactivate endpoint from that
   browser or revoking the exact token with the protected admin endpoint. Expiry
   also disables it automatically after 45 minutes.

Failure signals to record: a LINE loop, a return to Step 1, a blank Step 4,
different component order/Beryl sequence, a newly generated visitor/session ID,
lost UTM, or any checkout/order created before callback identity. No real-device
QA was performed in this implementation environment.

## Verification

- `node --check server.js`, `node --check app.js`, and
  `node --check deferred-login-qa-client.js` passed.
- Focused QA, auth guard, Step 3 boundary, callback, handoff, snapshot, and
  Beryl tests passed: **37/37**.
- `git diff --check` passed.
- No browser runtime was available, so production endpoint and real-device
  validation remain manual prerequisites.

## Rollback

No database rollback or code revert is required for normal traffic. Leave the
static flag false and revoke/deactivate all QA sessions. A removed/expired QA
cookie fails closed to the existing pre-Step-1 LINE login flow.

## Readiness

The private-session implementation is ready to deploy safely with the default
false. Real device QA becomes ready only after the manual migration and Render
environment secret are configured and the deployed endpoint is smoke-tested.
