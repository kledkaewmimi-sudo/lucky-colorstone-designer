# Authenticated Non-Friend OA Gate Fix

## Fixed control-flow gap

The deferred Step 3 handler previously treated a valid LINE identity as an unconditional direct Step 4 fast path. It now uses the existing `getLineOaFriendshipStatus()` gate before continuing from Step 3 to Step 4 when the effective deferred-login flag is enabled and the user is already authenticated.

```text
authenticated Step 3 Continue
  -> getLineOaFriendshipStatus()
     -> friendFlag true: existing Step 4 fast path
     -> false/unavailable/error: remain on Step 3 and show existing OA gate
```

The existing callback path is unchanged: it still checks friendship before it consumes the V2 handoff and restores to Step 4.

## Existing-gate reuse

No second friendship system was added. The patch adds only an in-memory, current-Step-3 continuation flag, `lineOaFriendshipStep4ResumePending`, for the already-authenticated path because that path deliberately has no V2 handoff.

On a non-friend/unavailable result the existing UI is displayed. Its existing actions behave as follows:

- **Add Friend** calls `liff.requestFriendship()` as before.
- **Recheck** calls the existing `getLineOaFriendshipStatus()` as before.
- A false/error result remains blocked.
- A true result advances to Step 4 only when the pending authenticated-Step-3 continuation is still on Step 3 with an available LINE identity.

The V2 callback gate retains its existing behavior because it has no pending authenticated-Step-3 continuation and therefore proceeds through the original restore function.

## Safety properties

- A blocked OA, non-friend, missing friendship API, timeout, or friendship error returns a false result and fails closed outside Step 4.
- Guest/unauthenticated deferred flow, V2 snapshot, server handoff, and V2 intent are untouched.
- No order, Stripe session, CRM record, or checkout action is created by the gate.
- The design stays in the current in-memory Step 3 state while the dialog is shown.
- The existing authenticated friend path remains direct and does not show a prompt.
- The broad production default remains `DEFER_LINE_LOGIN_TO_STEP4 = false`.

## Verification

Passed command: `node --test tests/line-oa-friendship-gate.test.mjs tests/line-callback-bootstrap.test.mjs tests/line-redirect-handoff.test.mjs tests/deferred-initial-line-login.test.mjs tests/beryl-visuals.test.mjs`

Result: **26 passed, 0 failed**.

The focused friendship tests verify:

- callback friendship remains before handoff consume;
- the authenticated deferred Step 3 path calls the friendship check before its Step 4 navigation;
- non-friend handling opens the existing gate;
- recheck cannot advance until it sees `friendFlag === true`;
- the callback restore continues to use the separate original restore path; and
- buyer push diagnostics remain free of LINE identities/credentials.

Also passed: `node --check app.js`, `node --check server.js`, and `git diff --check`.

No real-device run was performed in this local verification, and the change has not been committed, pushed, or deployed. Real-device QA must use the private QA session only; broad deferred-login rollout remains off.

## Files changed

- `app.js`
- `tests/line-oa-friendship-gate.test.mjs`
- `reports/auth/2026-08-23-authenticated-nonfriend-gate-fix.md`
