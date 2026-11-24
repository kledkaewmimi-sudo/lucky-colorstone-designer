# LINE Login — Working Implementation Reference

Status: UAT verified by owner-reported real-device tests; Production release deployed (browser smoke PASS; real-device Production test pending).
Last updated: 2026-11-24 Asia/Bangkok.

## Purpose

This document preserves the LINE Login implementation that was made to work on real iPhones and Android. Read it before changing LINE Login, LIFF, authentication callbacks, handoffs, Instagram in-app-browser behavior, or designer navigation.

Do not replace this implementation with an older flow.

## Verified UAT reference

Working UAT commit:

```text
935f069d8581ae39623a0a6bcd96241ccbffd99d
```

UAT URL:

```text
https://uat.customize.luckycolorstone.com/
```

Do not treat this commit as a license to overwrite Production-specific configuration. Production uses its own origin, LIFF ID, channel, API host, cookies, Supabase project and Render service.

## Owner-reported real-device UAT evidence

Owner reported:

```text
iPhone device 1: Instagram DM → UAT → LINE Login → Designer — PASS
iPhone device 2: Instagram DM → UAT → LINE Login → Designer — PASS
Android: UAT → LINE Login → Designer — PASS
Forward/backward navigation Step 1 ↔ Step 2 ↔ Step 3 — PASS
```

These are owner-reported results. They are not re-stated here as independent device-lab proof.

## Backend evidence observed in UAT

Latest successful UAT journey observed in `uat_analytics_events`:

```text
state_restore_success
step_2_view
```

A corresponding `uat_line_auth_entry_sessions` record was created and consumed:

```text
created_at:   2026-11-24 13:37:47.655571+00
expires_at:   2026-11-24 13:47:47.019+00
consumed_at:  2026-11-24 13:37:56.416762+00
```

A diagnostic ID Token event showed:

```text
hasToken: true
aud:      2010525799
iss:      https://access.line.me
```

This is database evidence for a consumed UAT auth-entry session and matching channel audience. It is not a substitute for rechecking a new Production login.

## Confirmed root causes and fixes

### 1. Cached LIFF identity was not server authentication

Observed problem:

- `line_auth_success` with reason `profile_success` was emitted from LIFF profile synchronization.
- `isLineIdentityAvailable()` became true.
- Step 1 could then call `goToStep(2)` without server ID Token verification or a consumed handoff.

Fix:

- A local LIFF profile is not proof of the Step 1 authentication boundary.
- A mobile external browser with an ambient LIFF identity is routed through the existing auth-entry/server verification flow.
- Step 2 is not entered from a local profile alone.

Key code:

```text
attemptStep1AuthorizationAndContinue()
startAutoAuthEntryForCustomization()
ensureStep1LineAuthorization()
```

Regression test:

```text
a cached LIFF identity cannot enter Step 2 without server auth-entry verification
```

### 2. Duplicate callbacks and authorization loops

Observed problem:

- A failed consume returned HTTP 401.
- `failAutoAuthEntryReturn()` started Plan B.
- A later callback failed and started another authorization.
- The customer saw alternating loading states, repeated LINE app switches, temporary Step 2, then Step 1.

Fix:

- Added `LINE_AUTH_ATTEMPT_STATE_KEY`.
- States: `in_progress`, `completed`, `failed`.
- One attempt ID per authentication attempt.
- Completed attempt ignores duplicate callbacks.
- Failed attempt cannot automatically restart Plan A or Plan B.
- Plan B is attempted once.
- Successful consume marks the attempt completed.

Key code:

```text
readLineAuthAttemptState()
beginLineAuthAttempt()
completeLineAuthAttempt()
failLineAuthAttempt()
clearLineAuthAttemptState()
handleAutoAuthEntryReturn()
failAutoAuthEntryReturn()
handleInitialHandoffCallback()
```

### 3. Expired LINE ID Token caused HTTP 401

Confirmed diagnostic:

```text
hasToken: true
aud:      2010525799
iss:      https://access.line.me
exp:      1795491982
iat:      1795488382
```

At the real attempt, `exp` was approximately nine hours in the past. LINE's official verify endpoint returned `401 verification_rejected`. The audience was correct; the token was stale/expired from the LIFF cache.

Fix:

```text
isLineIdTokenExpired()
refreshExpiredLineIdToken()
LINE_TOKEN_REFRESH_ATTEMPTED_KEY
```

When the decoded `exp` is expired:

- do not treat the token as authenticated;
- call `liff.logout()` once;
- start one fresh existing LIFF login;
- require the new token to pass the unchanged server verifier.

If the refreshed token is still expired or invalid, the attempt ends; it does not loop.

Do not change the expected channel ID or bypass server verification.

### 4. Completed authentication blocked Step 1 → Step 2 after going back

Observed problem:

- After successful authentication and Step 3, the customer navigated backward to Step 1.
- Next did not reach Step 2.
- `lineAuthAttemptState.status` was `completed`, but `attemptStep1AuthorizationAndContinue()` only handled `failed`.
- The Instagram branch tried Plan B again; the external identity branch forced auth-entry; Plan B was already used/blocked.

Fix:

```js
if (authAttempt?.status === 'completed' && isLineIdentityAvailable()) {
  setStep1AuthStatus('verified');
  await goToStep(2);
  return true;
}
```

This is navigation, not a new authentication attempt.

It must not create a new auth-entry, create a new handoff, or consume the old handoff again.

Regression test:

```text
completed authentication does not block Step 1 to Step 2 after backward navigation
```

The test asserts:

```text
Step 2 reached
manual login hidden
auth-entry posts: 0
handoff posts: 0
```

## Plan A and Plan B

### Plan A — automatic LINE authentication

Primary path:

```text
Step 1 Next
→ existing auth-entry/LIFF flow
→ server verifies LINE ID Token
→ single-use handoff
→ restore Step 2
```

### Plan B — automatic fallback

Triggered only after genuine Plan A failure or when Plan A is unavailable.

```text
Step 1 Next
→ Plan A failure
→ automatic Plan B
→ existing legacy LINE authorization entry/LIFF login
→ server verification
→ single-use handoff
→ Step 2
```

There is no manual LINE Login button and no customer choice between plans.

### Instagram in-app browser

```text
Instagram IAB
→ Step 1 Next
→ no automatic auth-entry inside IAB
→ automatic Plan B
→ legacy /line-auth-entry flow
→ LINE authorization
→ callback
→ server verification
→ single-use handoff
→ Step 2
```

If IAB blocks the flow, the final fallback is a Safari/Chrome instruction. Do not claim success without a successful callback.

## Server-side verification

UAT endpoints:

```text
/api/line-auth-entry
/api/line-auth-consume
/api/auth-entry/sessions
/api/auth-entry/sessions/consume
/api/auth-entry/sessions/pending
/api/line-id-token/verify
```

UAT verifier:

```text
line-id-token-verifier.js
POST https://api.line.me/oauth2/v2.1/verify
```

Validation includes:

```text
iss
aud
exp
iat
sub
```

The raw ID Token is never persisted or sent to analytics.

## Single-use handoff

The server creates a handoff with a one-time token and TTL. The browser receives only the opaque handoff token through the protected auth-entry flow, not in the normal URL.

Consumption rules:

- consume once;
- reject repeat consumption;
- bind to browser/tab session;
- do not reuse a consumed handoff;
- do not store the raw handoff in analytics or localStorage.

After successful consumption, designer navigation must not require the handoff again while the verified UI session is valid.

## Authentication vs designer navigation

Keep these separate:

```text
Authentication state: unauthenticated | in_progress | completed | failed
Designer state:       Step 1 | Step 2 | Step 3
```

A completed authentication permits normal designer navigation. Backward navigation must not invalidate it.

Only a genuinely unavailable/expired authenticated session may start a deliberate new authentication attempt.

## Approved Redirect Page — preserve exactly

The Production release must preserve the previously approved Instagram redirect page.

Current approved Production implementation:

```text
frontend/index.html #instagramHandoffScreen
frontend/app.js instagramHandoffScreen / instagramHandoffImage / instagramHandoffCta
frontend/index.css .instagram-handoff-*
```

Assets:

```text
frontend/assets/instagram-handoff/safari.jpg
sha256 2b17b1d37f733f4213f3e9ab30cdcb14b57aeab80693ea6fc81bba903ab6912c

frontend/assets/instagram-handoff/chrome.jpg
sha256 f930898b10af9ac50f7c65b07fa4dc418837dcf31ff398f240c632f1e96cc708
```

UAT-approved image copies:

```text
assets/Redirect/Safari.jpg  sha256 2b17b1d37f733f4213f3e9ab30cdcb14b57aeab80693ea6fc81bba903ab6912c
assets/Redirect/Chrome.jpg  sha256 f930898b10af9ac50f7c65b07fa4dc418837dcf31ff398f240c632f1e96cc708
```

Do not replace these with an older version, a generic redirect page, generated imagery, cropped/resized imagery, or different CTA positioning.

Preserve:

- Safari image for iPhone.
- Chrome image for Android.
- transparent CTA hotspot aligned to the embedded image CTA;
- no additional buttons or text over the image;
- existing Instagram handoff behavior.

## UAT and Production configuration differences

| Item | UAT | Production |
|---|---|---|
| Origin | `https://uat.customize.luckycolorstone.com` | `https://customize.luckycolorstone.com` |
| LIFF ID | `2010525799-Sw5UFc6E` | `2010525799-qImIuhla` |
| Channel ID | `2010525799` | `2010525799` |
| API/Render host | `lucky-colorstone-uat.onrender.com` | Production Render service |
| Auth cookie | `__Host-uat-line-auth-browser` | `__Host-lc-line-auth-browser` |
| Environment marker | `APP_ENV=uat` | Production environment |

Never copy UAT credentials, UAT API URLs, UAT LIFF ID, or UAT cookies into Production.

## Working files and functions

```text
app.js
  isLineIdTokenExpired()
  refreshExpiredLineIdToken()
  getLineIdTokenDiagnostics()
  readLineAuthAttemptState()
  beginLineAuthAttempt()
  completeLineAuthAttempt()
  failLineAuthAttempt()
  startAutoAuthEntryForCustomization()
  startAutomaticPlanB()
  attemptStep1AuthorizationAndContinue()
  handleAutoAuthEntryReturn()
  handleInitialHandoffCallback()
  completeCustomizationStartResume()

line-auth-entry.js
line-id-token-verifier.js
server.js
api/line-auth-entry.js
api/line-auth-consume.js
```

Tests:

```text
tests/line-auth-ux-browser.test.mjs
tests/plan-b-automatic-uat.test.mjs
tests/start-to-step1-regression.test.mjs
tests/line-auth-ux-improvements.test.mjs
```

Run:

```text
node --test tests/line-auth-ux-browser.test.mjs tests/plan-b-automatic-uat.test.mjs
node --test tests/*.test.mjs tests/*.test.cjs
```

## Release mapping

UAT working commit:

```text
935f069d8581ae39623a0a6bcd96241ccbffd99d
```

Production release commits:

```text
69d50d5e158a468211e49ae7e009e4a1092e3184
6bc97859bd15faacdedd0362b068c32f12b9d043
```

The release is based on the live Production `app.js` plus the verified auth/navigation
changes, preserving Production configuration and the approved redirect assets.

Production deployment:

```text
dpl_9Q77YefGBUGWqV9E9adFhmyEMeFf
https://lucky-colorstone-designer-lj03jhamn-lucky-colorstone.vercel.app
https://customize.luckycolorstone.com/
```

Previous Production deployment:

```text
dpl_3FCDAKcSVKuWX57QAp38seNY732e
commit 630cc00f8de6fc1c932b3213e4d04f5ff11b5bd6
```

## Do not regress

Never reintroduce:

- manual LINE Login buttons;
- cached-profile-only authentication;
- a new handoff on every Step 1 Next;
- reuse of a consumed handoff;
- expired-token submission as success;
- duplicate callback authorization loops;
- Step 2 entry without server verification and single-use handoff;
- completed-session navigation blocking;
- UAT constants in Production;
- replacement of the approved redirect assets.

## Production safety

Production changes require a separate release review. Do not change Production LINE Console, channel IDs, Supabase, Render, CRM, checkout, payment, orders, inventory, catalog, or pricing without specific approval.
