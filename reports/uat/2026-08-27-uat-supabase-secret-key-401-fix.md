# UAT Supabase Secret-Key 401 Fix

Date: 2026-08-27  
Scope: UAT worktree and branch only. No seed, deployment, secret access, rotation, production connection, or production change occurred.

## Root Cause

The UAT seed and shared server Data API helpers always emitted both:

```text
apikey: <UAT key>
Authorization: Bearer <UAT key>
```

That is valid only for legacy JWT `service_role` keys. The configured `sb_secret_*` key is an opaque modern API key, not a JWT; Supabase attempts to parse the Bearer value as a JWT and rejects it with HTTP 401. This precisely explains the seed’s immediate failure before any UPSERT.

Supabase’s official guidance is to send modern secret keys in `apikey` only and not as `Authorization: Bearer`; its migration guide notes that adding the Bearer header causes `Invalid JWT`. [Understanding API keys](https://supabase.com/docs/guides/getting-started/api-keys), [migrating to new API keys](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys).

## Fix

Added `uat-supabase-auth.js`, a server-only UAT request-header helper:

- `sb_secret_*` -> `{ apikey: key }` only.
- Legacy non-`sb_secret_*` service-role JWT -> `{ apikey: key, Authorization: "Bearer <key>" }` for compatibility.

The helper is used by:

- `scripts/seed-uat-supabase.js` UPSERT requests.
- `server.js` shared Data API requests.
- `server.js` RPC requests used by the UAT handoff store.

No Auth API call, `auth.getUser` call, browser exposure, logging, rotation, or UAT guard relaxation was added. The UAT guard still requires the exact approved ref `crviqzaziboxshbzhpri`, exact approved UAT HTTPS URL, UAT-prefixed variables, and rejects generic/production Supabase variables and production credential families.

## Focused Tests

Passed:

1. `sb_secret_*` is classified as a modern opaque secret, not a JWT.
2. Modern secret requests contain `apikey` and no `Authorization` header.
3. Legacy JWT compatibility retains the Bearer header.
4. Seed and server both call the shared header helper.
5. Seed/server sources do not log the secret-key variables.
6. Existing UAT pinning, generic-variable rejection, handoff, identity, friendship, fixed snapshot, and mixed snapshot tests pass.

Verification executed:

```text
node tests/uat-supabase-auth.test.cjs
node tests/uat-backend-guard.test.cjs
node tests/uat-handoff-supabase-contract.test.cjs
node --check scripts/seed-uat-supabase.js
node --check server.js
node --test tests/line-identity-before-design.test.mjs tests/line-oa-friendship-gate.test.mjs tests/mixed-size-state.test.mjs
git diff --check
```

Result: 35 focused tests/checks passed (3 focused CJS checks plus 32 Node test cases); `git diff --check` found no whitespace error. Existing LF-to-CRLF warnings remain unrelated.

## Runtime Impact

The server runtime used the same broken Bearer header construction for catalog Data API and handoff RPC requests. It is corrected by the shared helper, so the fix applies to both seed and live UAT persistence/handoff paths.

## Security and Production Isolation

- Secret values were not requested, printed, read, rotated, or written.
- `sb_secret_*` remains backend-only.
- No production database, URL, ref, secret, Stripe credential, or LINE Messaging credential was used.
- Production changed: **NO**.

## Status

**READY_FOR_OWNER_SEED_RETRY.** After this UAT-only change is committed and deployed, run the already-approved seed dry-run followed by the idempotent seed in the owner-controlled UAT Render environment. Do not seed from a shell that lacks the configured UAT environment.
