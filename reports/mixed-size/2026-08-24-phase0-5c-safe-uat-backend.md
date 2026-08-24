# Phase 0.5C — Safe Minimal UAT Backend

Date: 2026-08-24
Status: **READY FOR UAT DEPLOYMENT — fixture-only UAT backend is prepared on branch `uat`.**

## Scope

Prepare only the UAT branch backend for a free Render deployment supporting Mixed Size Phases 1–3. No Mixed Size feature was implemented. No production workspace, `main`, production deployment, production configuration, production data, production catalog/orders, Supabase, Stripe, LINE/LIFF, analytics, Meta, Vercel, or Render production resource was changed or used.

## Preflight and production safety

| Assertion | Result |
| --- | --- |
| Worktree | `D:\Projects\lucky-colorstone-uat` |
| Branch | `uat` |
| UAT HEAD at start | `0e958ff63b322b179e8184c4c6640fb22518756a` |
| UAT baseline | Descends from approved baseline `0e958ff63b322b179e8184c4c6640fb22518756a` |
| Production `main` | Read-only check: remains at `0e958ff63b322b179e8184c4c6640fb22518756a` |
| Production workspace | No write action performed |
| Production deployment | Not triggered |
| Production data | Not accessed or written |

## Implementation

### Explicit UAT identity and fail-closed startup

Added `uat-backend-guard.js` and made this UAT branch startup require both:

```text
APP_ENV=uat
UAT_BACKEND=true
```

The server refuses to start unless that identity is present. It also refuses startup if any of the following are configured:

- `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY`;
- `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET` (including live keys);
- `LINE_CHANNEL_ACCESS_TOKEN` or `LINE_CHANNEL_SECRET`;
- `ADMIN_LINE_USER_IDS` or `ADMIN_LINE_GROUP_ID`;
- any non-empty `META_*` or `ANALYTICS_*` environment variable;
- any environment value containing `lucky-colorstone-designer.onrender.com`.

Errors name only the unsafe configuration category; they do not echo values or secrets.

### Fixture-only, read-only API allowlist

When started as UAT, the backend permits only:

- `GET /api/stones`
- `GET /api/charms`
- `GET /api/spacers`
- `GET /api/settings`

The existing local `data/` fixture files are used. Startup no longer calls `seedDatabase()` in fixture-only UAT mode, so the backend does not create or mutate its data files. No Supabase configuration is accepted.

Every other API route returns HTTP 403 before the existing production route handlers can run. This blocks order creation/reads, Stripe checkout/webhook, catalog/settings writes, LINE/OA/auth handoffs, notifications, analytics writes/reads, purchases, uploads, CRM mutations, and reset operations.

### UAT-origin CORS

Fixture UAT responses allow only `https://uat.customize.luckycolorstone.com` and only `GET, OPTIONS`. This supports the planned UAT frontend while disallowing mutation methods at the browser boundary as well as the API allowlist.

## Files changed

| File | Purpose |
| --- | --- |
| `server.js` | Requires UAT identity, applies fixture-only startup behavior, GET allowlist, blocked-route response, and UAT-only CORS. |
| `uat-backend-guard.js` | Pure environment safety validation and API allowlist helpers. |
| `tests/uat-backend-guard.test.cjs` | Focused guard/allowlist tests. |
| `reports/mixed-size/2026-08-24-phase0-5c-safe-uat-backend.md` | This implementation report. |

## Tests and verification

Executed from the UAT worktree:

1. `node --check server.js` — passed.
2. `node --check uat-backend-guard.js` — passed.
3. `node tests/uat-backend-guard.test.cjs` — passed.
4. Startup without UAT identity — failed closed as expected with the missing `APP_ENV=uat` guard.
5. Local fixture-only startup with `APP_ENV=uat`, `UAT_BACKEND=true`, and no service credentials — started successfully using the existing Node server command path.
6. Local HTTP integration check — `GET /api/stones` returned 200; `POST /api/orders` and `POST /api/analytics/event` returned 403.

## Free Render compatibility

The existing `npm start` command remains `node server.js`; no dependency or build-step change was added. For a free Render UAT service, set only the non-secret identity variables above and leave all Supabase, Stripe, LINE, notification, analytics/Meta, and media-upload variables unset. The service serves bundled fixture files and requires no external persistence.

## Decisions

- Use committed/bundled local catalog fixtures for Phases 1–3.
- Do not use Supabase, Stripe, LINE/LIFF, CRM, notifications, analytics/Meta, or media storage in this UAT backend phase.
- Do not expose even read-only orders/analytics routes; only fixture catalog/settings reads are needed.
- Treat a missing UAT identity or any service credential as a deployment failure, not a degraded mode.

## Risks and remaining blockers

- This backend is safe only when the UAT frontend routes `/api/*` to it. The inherited UAT `vercel.json` and `_redirects` still target the production Render backend and must **not** be deployed unchanged.
- The UAT frontend still contains production LIFF and Meta identifiers. Before frontend deployment, UAT-only frontend configuration must disable Meta/analytics/LIFF or replace them with approved UAT-only values.
- Owner/platform provisioning is still needed for separate Render and Vercel UAT services/domain. No deployment was created by this task.

## Owner actions

1. Create a separate free Render service from branch `uat` using `npm start`.
2. Set only `APP_ENV=uat` and `UAT_BACKEND=true`; do not set any service credential or production identifier.
3. Create a separate Vercel UAT project/domain and, in the later frontend-routing task, route `/api/*` only to this Render UAT service.
4. Verify the UAT service marker/allowlist through non-secret endpoint checks before connecting the UAT frontend.

## Rollout and rollback

- Rollout has not occurred. The prepared code is committed/pushed only to `uat` after final verification.
- UAT backend preparation commit: `140428d` (`Prepare fixture-only UAT backend`), pushed to `origin/uat` only.
- UAT deployment rollout: deploy the Render UAT service first, verify the four GET fixture endpoints and 403 blocked routes, then configure the UAT frontend route in a later UAT-only task.
- Rollback: disable/rollback only the UAT Render service or revert the UAT branch commit. Do not change production services, domains, credentials, data, or `main`.

## Final status

**UAT backend safe to deploy: YES, after owner creates the isolated Render service with the required UAT identity and no service credentials.**
**Production credentials required: NO.**
**Write/payment/LINE/analytics routes blocked: YES.**
**Free Render compatible: YES.**
**Production untouched: YES.**

Next action: owner provisions the separate free Render UAT service with `APP_ENV=uat` and `UAT_BACKEND=true`, then verifies the read-only allowlist before UAT frontend routing is configured.
