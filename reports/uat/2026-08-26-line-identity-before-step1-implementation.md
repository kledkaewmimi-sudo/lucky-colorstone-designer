# LINE Identity Before Step 1 — UAT Implementation

## Owner-Approved Flow

Mobile UAT now uses the approved primary flow:

`Landing → Start → verified LINE identity → Step 1 → Step 2 → Step 3 → OA friendship → Step 4`

OA friendship is not required during initial identity establishment. It remains a hard requirement before operational Step 4.

## UAT Environment

- UAT hostname: `https://uat.customize.luckycolorstone.com/`
- UAT LIFF ID: `2010525799-Sw5UFc6E`
- The client reads UAT LIFF configuration from `/api/liff-config`; it fails closed when the UAT LIFF ID is absent and cannot fall back to the production LIFF ID.

## Landing Identity Gate

The Landing Start handler now calls the shared `establishLineIdentityBeforeDesign()` gate before opening Step 1.

- Existing canonical `State.lineUserId`: proceeds directly to Step 1.
- LIFF reports logged in but application identity is missing: awaits `syncLineProfileFromLiff()` and proceeds only once a valid `profile.userId` has set the canonical application identity.
- No LIFF session: starts secure LIFF login. This initial flow does not create a bracelet snapshot or server design handoff.

## Initial Auth Callback

Initial login uses an absolute UAT redirect URL carrying only `line_auth=identity`. Startup classifies this marker before normal fresh-entry rendering. It clears stale design state, initializes LIFF, and opens a clean Step 1 only after canonical identity is available. The marker is removed only after successful identity establishment.

## Step 3 Simplification

Step 3 no longer owns first-time LINE authentication in UAT. It fails closed with `line_identity_required` if identity is unexpectedly absent; it does not recreate the retired first-auth bracelet-handoff path.

## OA Friendship Handoff

The existing Step 3 OA-friendship gate remains the sole durable bracelet handoff path:

1. Save canonical design snapshot.
2. Mark bounded OA-friendship resume state.
3. Open the existing LIFF/OA add-friend experience.
4. On return, restore design, re-check `friendFlag`, and enter Step 4 only after it is true.

The existing callback’s server-first read/apply/consume behavior and new-context recovery are retained.

## Fresh Entry Semantics

A true fresh visit still clears stale bracelet state and begins with `beadSize = null`. A recognized initial identity callback is not rendered as Landing or a stale prior bracelet: it resumes a clean Step 1. OA/design callbacks retain their existing pre-reset classification and canonical design recovery.

## getProfile Failure Handling

`syncLineProfileFromLiff()` now has an explicit success contract: success requires both a valid LIFF profile `userId` and canonical application identity availability.

- `F05E3A`: `getProfile()` throws or times out.
- `F05E3B`: profile lacks a user ID.
- `F05E3C`: identity is not available after assignment.

These failures fail closed with a sanitized diagnostic; no user ID is fabricated and no speculative logout/reauth was added.

## Retained / Retired Deferred Auth Components

Retained:

- Server design handoff APIs.
- OA friendship resume state and callback recovery.
- Server-first restore, apply-before-consume, retry/fallback behavior.
- Callback bootstrap and useful diagnostics.

Retired from the UAT primary flow:

- Landing’s deferred-initial-login bypass.
- Step 3 as the normal first-time LIFF-login owner.
- First-auth bracelet handoff creation.

## Security

- Canonical LINE identity is set only from a valid LIFF profile.
- A URL marker and a handoff restore state only; neither authorizes Step 4.
- `friendFlag === true` remains required before Step 4.
- OA friendship checks, payment, Stripe, pricing, and production configuration are unchanged.

## Tests

Focused relevant suite: **48/48 passed**.

Coverage includes landing identity conditions, first-time login start, LIFF-logged-in profile synchronization, sanitized profile failure, initial callback classification, deferred callback restore, OA friendship, guest-design restore, mixed/fixed compatibility, fresh reset, and analytics continuity.

Checks passed:

- `node --check app.js`
- `node --check line-identity-before-design.js`
- `git diff --check`

The broad wildcard suite has unrelated existing UAT failures: the fixture-backend tests require their UAT environment variables and the Beryl visual test has the pre-existing concatenated-module harness defect. Those are outside this migration; the relevant suite above is green.

## UAT Deployment

Committed UAT implementation: `3b5e3bc29b227e364b2d584cfe265abecfe02c5b` (`feat: gate UAT design flow on LINE identity`).

The linked `lucky-colorstone-uat` Vercel project deployed this commit successfully:

- Deployment ID: `dpl_Gr9wDmKHxeE4GBRsikmPd2Bw5Zhz`
- Status: `READY`
- Stable alias: `https://uat.customize.luckycolorstone.com/`
- Verified `GET /api/liff-config`: HTTP 200 and `{ "environment": "uat", "liffId": "2010525799-Sw5UFc6E" }`

Production main, production Vercel/Render, production LIFF, and Stripe were not changed.

## Owner Real-iPhone QA Matrix

1. First-time identity: Landing → Start → LINE auth → clean Step 1.
2. Existing session: Landing → Start → Step 1 without redundant login.
3. Build a fixed and a mixed bracelet through Step 3; no first-time login starts there.
4. Not OA friend: add friend, return, exact bracelet restored, friendship rechecked, then Step 4.
5. Existing OA friend: Step 3 → Step 4 directly.
6. Fresh reopen: old bracelet is cleared.
7. Verify mixed 4/6/10 and fixed 4/6/10 designs render and resume correctly.

## Production Promotion Gate

Production promotion is blocked pending explicit owner approval after real-iPhone UAT QA on the stable UAT hostname.

## Final Status

The UAT identity-before-design migration is deployed and the relevant automated checks pass. Owner real-iPhone verification is required before any production change.

## Next Action

Owner tests the stable UAT URL on a real first-time iPhone from Landing Start through LINE identity, bracelet design, OA friendship, and Step 4.
