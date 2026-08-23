# Final linked-OA aggressive LIFF flow

## Verified LINE configuration

Owner verified the existing LINE configuration used by the customer app:

- Linked OA: **Lucky Colorstone**
- LIFF ID: `2010525799-qImIuhla`
- LIFF browser size: **Full**
- Endpoint URL: `https://customize.luckycolorstone.com/`
- Scopes: `openid`, `profile`
- Add friend option: **On — aggressive**

This is the configuration needed for the normal LIFF authorization lifecycle
to present LINE's linked-OA add-friend step and redirect back to the configured
endpoint.

## Change

The standalone `line.me` OA business-profile route is no longer the primary
friendship path.

1. A deferred unauthenticated Step 3 customer continues to use the existing
   recovery sequence: canonical snapshot → server handoff → V2 intent →
   existing LIFF login/entry flow. The linked OA's aggressive LINE behavior
   occurs inside that normal authorization lifecycle.
2. After the normal LIFF return, identity synchronization occurs before the
   centralized `getLineOaFriendshipStatus()` gate. A handoff is consumed and
   Step 4 can resume only when `friendFlag === true`.
3. An already-authenticated non-friend in a Full LIFF browser uses native
   `liff.requestFriendship()`. LINE owns the add/unblock subwindow; when its
   promise resolves, the app immediately rechecks friendship and resumes Step
   4 only after a true result.
4. A non-friend reached from an external browser is routed to the existing
   `https://liff.line.me/2010525799-qImIuhla` entry lifecycle before a native
   friendship prompt is attempted. A bounded, non-PII resume marker plus the
   existing canonical snapshot preserves the Step 3 design across this context
   change.
5. The official OA business-profile URL remains a last-resort, fail-closed
   fallback only after the user is already in LIFF but native friendship support
   is unavailable. Opening that route is never treated as friendship success.

The previous website-owned friendship modal and manual recheck workflow remain
absent. A lightweight non-interactive LINE transition state uses the existing
loading overlay immediately before LIFF/LINE handoff. It has no controls and
is dismissed as the native request or navigation begins.

## Step 4 hard rule

All existing centralized Step 4 entry and checkout checks remain in place.
They require a LINE identity and a fresh `friendFlag === true`; a non-friend,
blocked OA, unavailable API, timeout, exception, cancellation, or unknown state
stays outside operational Step 4 and Stripe checkout.

## Preserved systems

No changes were made to Stripe, webhook handling, CRM semantics, pricing,
renderer/ResolvedLayout, catalog or Beryl behavior, analytics, UTM, Meta Pixel,
or buyer/admin notification delivery. The broad
`DEFER_LINE_LOGIN_TO_STEP4` default remains false; this flow is available only
through the existing private QA mechanism.

## Verification

Passed focused suite: **36 tests, 0 failures**.

- Native LIFF friendship is ordered before external LIFF routing and OA URL
  fallback.
- Deferred guest recovery remains snapshot → handoff → V2 intent → LIFF login.
- Callback friendship check stays before handoff consume.
- Native prompt rechecks automatically; cancellation stays outside Step 4.
- Legacy intent, snapshot, Beryl, and centralized Step 4/checkout guards pass.
- `node --check app.js`, `node --check server.js`, and `git diff --check` pass.

Browser automation is unavailable in this environment. The LINE-owned Full
LIFF subwindow and complete external-browser return must be confirmed by owner
real-device QA before a production-wide rollout.

## Rollback

Keep `DEFER_LINE_LOGIN_TO_STEP4 = false` or revoke the private QA session. No
database or payment-flow rollback is needed.
