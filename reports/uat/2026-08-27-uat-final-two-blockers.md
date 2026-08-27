# UAT final two-blockers verification

Date: 2026-08-27  
Scope: UAT branch/service only. No production system, deployment, database, credential, Stripe, or LINE production token was accessed or changed.

## Restart persistence

`GET https://lucky-colorstone-uat.onrender.com/api/stones` returned HTTP 200 with 33 records and still contained `uat-qa-persistence-20260827-live`.

This confirms the existing UAT-only QA record remains readable. It is not sufficient to claim restart persistence because this session did not receive a deploy identifier or Render control-plane confirmation that a process replacement occurred before the read. The record must be read again after the owner’s confirmed restart/redeploy of only `lucky-colorstone-uat`; it must not be recreated.

## Handoff TTL

The normal handoff TTL is exactly 20 minutes (`1,200,000 ms`), defined by `HANDOFF_TTL_MS` in `line-auth-handoff.js`.

Twenty minutes is impractical for the controlled live expiry check. A disabled-by-default server-only UAT QA override was added:

- Environment name: `UAT_HANDOFF_QA_TTL_SECONDS`.
- Accepted only while `APP_ENV=uat` and `UAT_BACKEND=true`.
- Accepted only as an integer from 60 through 300 seconds.
- Invalid, missing, non-UAT, or non-server conditions retain the standard 20-minute TTL.
- The request body cannot select a TTL; no browser/client code reads this setting.

The implementation does not change production behavior. Before a live expiry check, the owner must temporarily set `UAT_HANDOFF_QA_TTL_SECONDS=60` only on `lucky-colorstone-uat`, deploy that UAT commit, create a fresh handoff, verify immediate HTTP 200 read, wait at least 61 seconds, and verify a read returns HTTP 404/no usable payload. The owner must then unset the variable and redeploy only UAT so the default 20-minute runtime TTL is restored.

## Security regression checks

The following focused tests passed (25 total): UAT TTL override, UAT handoff Supabase contract, handoff redirect behavior, LINE identity-before-design, and OA friendship gate.

The default 20-minute TTL remains covered. The tests also retain the requirements that a token does not itself authorize Step 4, LINE identity is mandatory, `friendFlag: true` is mandatory, fixed/mixed snapshots are supported, and `ResolvedLayout` is omitted from persisted snapshots.

## Status

Blocked pending the owner-controlled UAT deployment/restart and the live 60-second expiry observation. No production change occurred.
