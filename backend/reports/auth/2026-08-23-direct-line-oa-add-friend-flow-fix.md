# Direct LINE OA Add-Friend Flow Fix

## Scope

This change replaces only the website-owned OA friendship modal shown during a
protected Step 3-to-Step 4 transition. The production default deferred-login
flag remains `false`; the private QA session remains the only way to exercise
the deferred flow.

## Root cause

The previous UI called `liff.requestFriendship()` from a custom modal and then
immediately rechecked friendship. LINE documents `requestFriendship()` as a
full-size LIFF-browser feature. That does not provide a reliable direct
add-friend path in external iOS/Android and social in-app browsers, which
explains the observed stuck modal/toast behavior.

## Implementation

- Removed the OA friendship modal markup, its presentation styles, DOM
  references, and button listeners.
- Added `GET /api/line-oa-add-friend`. The server obtains the configured
  Messaging API bot's Basic ID through its existing server-only
  `LINE_CHANNEL_ACCESS_TOKEN` and returns the official add-friend URL in the
  form `https://line.me/R/ti/p/<Basic-ID>`. No OA ID or token is hard-coded or
  exposed to the client.
- A verified non-friend now saves the canonical guest snapshot, marks a
  non-sensitive session-only return continuation, and immediately navigates to
  that official LINE URL.
- `liff.requestFriendship()` remains only as a constrained fallback for a
  full-size LIFF browser when the server cannot resolve the direct URL. It is
  not attempted in Safari, Chrome, Instagram, or other external contexts.
- On return, the app restores the canonical Step 3 snapshot, rechecks
  `liff.getFriendship()`, and sets Step 4 only after `friendFlag === true`.
  A false, unavailable, cancelled, blocked, or failed result remains outside
  Step 4; pressing Continue again starts the official add-friend route again.
- The existing centralized `canEnterOperationalStep4()` and checkout guard
  remain in place. They recheck friendship immediately before operational
  Step 4 and before checkout.

## Preserved behavior

- No trusted price, renderer output, or Beryl variant is stored. Existing
  catalog reconciliation and current pricing remain authoritative.
- The V2 handoff remains intact for deferred-login callbacks; its server
  consume still occurs only after friendship is verified.
- Stripe, webhook, CRM, Orders, buyer/admin LINE notifications, analytics,
  UTM, Meta Pixel, catalog, pricing, and renderer/ResolvedLayout were not
  changed.
- The only remaining Thai fallback text is emitted as Unicode escapes through
  the existing toast component, which uses the project Thai UI font stack; the
  broken modal typography path no longer exists.

## Validation

Passed locally:

- `node --check app.js`
- `node --check server.js`
- focused auth, snapshot, handoff, callback, Beryl, and friendship tests:
  25 passing / 0 failing
- `git diff --check`

Backend verification passed after commit `00a5f09`:

- `GET /api/line-oa-add-friend` returned HTTP 200 with a server-derived,
  approved `line.me` OA destination.
- Public `GET /api/deferred-login-qa-sessions/current` returned
  `{"enabled":false}`. The broad deferred-login default remains off.

At the time of this report, Vercel static hosting was still serving a stale
`app.js` artifact that did not contain this commit's direct-add-friend function
or the already-deployed hard friendship guard. Do not begin the real-device
retest until the static deployment serves the current revision.

Browser automation is unavailable in this environment. The deployed official
LINE destination and the complete native add-friend round trip require owner
real-device verification after deployment.

## Real-device acceptance procedure

1. Activate a private QA session in the exact browser context being tested.
2. Use a LINE friend: Step 3 Continue must open Step 4 directly.
3. Use a logged-in non-friend: Step 3 Continue must immediately leave the site
   for the real Lucky Colorstone LINE add-friend screen, with no website modal.
4. Cancel/back out: Step 4 must remain unavailable; pressing Continue again
   must reopen the official LINE destination.
5. Add or unblock the OA, return to the same website/browser context, and
   verify that the restored design reaches Step 4 only after a fresh positive
   friendship check.
6. Compare wrist size, bead size, ordered stones/charms/spacers, Beryl order,
   and recalculated price before and after the detour.
7. Revoke/deactivate the QA session after testing.

## Remaining risk

The direct URL is derived from the existing Messaging API bot configuration.
The owner must confirm that this bot is the same Lucky Colorstone OA linked to
LIFF's LINE Login channel. If the API route returns `503`, the server could not
resolve that destination and the app fails closed outside Step 4.
