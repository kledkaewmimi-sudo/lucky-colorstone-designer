# Production Step 4 Friendship Hard-Gate Fix

## Real bypass root cause

The prior deployed fix guarded only one flag-scoped Step 3 branch. When a browser's effective deferred QA flag was false, an already-authenticated mobile user followed the legacy direct Step 4 navigation without calling `getLineOaFriendshipStatus()`. `goToStep(4)`, direct Step 4 rendering, and checkout also lacked a shared authorization boundary.

The device report is consistent with that source path. This environment cannot read the Android device's private QA cookie/session or issue an admin QA token, so it cannot independently prove whether the observed device's QA session was effective. The public no-session endpoint remains correctly disabled. The hard gate protects mobile operational Step 4 even if a QA session is absent, expired, or lost.

## Centralized rule

`canEnterOperationalStep4()` is now the single mobile operational Step 4 authorization function. It is fail-closed and returns true only when the current context is a mobile/LIFF flow that requires LINE, a current LINE identity is available, and a fresh `getLineOaFriendshipStatus()` result has `friendFlag === true`.

No friendship result is persisted or assumed. A non-friend, blocked OA, unavailable API, timeout, exception, missing identity, or null/false result is denied. The existing desktop non-LIFF bypass, paid-return view, and order-detail view are deliberately excluded because they are not new mobile operational checkout entry points.

## Defense-in-depth coverage

| Entry route | Protection |
| --- | --- |
| Step 3 Continue → `goToStep(4)` | `goToStep()` checks before changing current step. |
| Authenticated fast path | It uses the same `goToStep(4)` check; no flag-only exception remains. |
| Deferred callback/V2 restore | `restoreDeferredLineCallbackBeforeReset()` checks before handoff consume/reconciliation. |
| Persisted/direct Step 4 render | `renderStepViews()` returns the customer to Step 3 and shows the gate. |
| Direct `renderStep4()` call | Final defensive check returns to Step 3 before rendering checkout. |
| Checkout button/handler | `handleStripeCheckout()` checks before shipping validation or Stripe session creation. |

For a failed Step 3 entry, the guard leaves the design in Step 3, opens the existing OA dialog, and queues only the existing in-memory Step 3 continuation. The existing **Add Friend** and **Recheck** actions are reused. A fresh positive friendship result then re-enters `goToStep(4)`, which checks again before rendering.

## QA-session finding

The client QA implementation remains server-validated: fragment activation POSTs an opaque token with same-origin credentials, the backend establishes an HttpOnly `__Host-` session cookie plus a non-authorizing probe cookie, and the client resolves effective QA state from `/api/deferred-login-qa-sessions/current`. No public query or storage flag exists. The device-specific effective state is not observable from this environment without the approved private session.

`DEFER_LINE_LOGIN_TO_STEP4` remains `false`; a valid private QA session is still required to exercise the deferred unauthenticated flow.

## Tests and checks

Passed: **38 tests, 0 failures**. The focused suite covered disabled/default flag behavior, QA client validation, unauthenticated handoff ordering, callback friendship before consume, authenticated non-friend Step 4 protection, direct/persisted render defense, checkout protection before Stripe, handoff/callback safety, Beryl, and buyer-notification diagnostics.

Also passed: `node --check app.js`, `node --check server.js`, and `git diff --check`.

Browser automation is unavailable in this environment. A real LINE friendship test remains an owner/device action after deployment; it is not claimed as automated verification.

## Non-changes

No Stripe, webhook, CRM/order semantics, pricing, catalog, Beryl, renderer, ResolvedLayout, analytics, UTM, Meta Pixel, or buyer/admin notification pipeline behavior was changed.

## Files in this fix

- `app.js`
- `tests/line-oa-friendship-gate.test.mjs`
- `reports/auth/2026-08-23-production-step4-friendship-hard-gate-fix.md`
