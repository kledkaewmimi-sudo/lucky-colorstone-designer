# First-tap LINE authentication root fix

## Owner Video Evidence

The owner real-device video is authoritative: one tap on `เริ่มออกแบบ` waited briefly, changed the CTA to `เข้าสู่ระบบด้วย LINE`, and remained on Landing without starting LINE authentication.

## Why Previous Fix Was Incomplete

The prior Start correction changed the visible result of a failed `canContinue` result from a normal button reset to `showLineConnectPrompt`. It did not change the login-start functions that produced the failure, creating a two-tap prompt instead of authentication navigation.

## Exact Login-Start Root Cause

Both `startLiffLoginForCustomization` and `openLineConnectEntryForCustomization` returned before invoking LINE navigation when `rememberCustomizationLoginIntent()` returned false. That lightweight localStorage write is not required for initial identity, which occurs before any bracelet design exists. As a result, first-tap authentication could be silently blocked in storage-restricted mobile/LIFF contexts.

## Browser Environment Branching

- A true LIFF client (`liff.isInClient() === true`) does not call `liff.login`; the already-established LIFF session is synchronized to canonical identity.
- A LINE in-app browser that is not a true LIFF client and an external mobile browser both invoke `liff.login()` directly when unauthenticated.
- If the SDK login invocation is unavailable, the configured LIFF entry URL is used as the direct navigation fallback.

## One-Tap Authentication Fix

`invokeInitialLineAuthentication` now performs the semantic login/entry invocation. A successful `liff.login()` call is treated as `STARTED` even though the SDK ordinarily returns no success payload before navigation. The Start handler therefore retains loading/navigation state after the first tap rather than exposing a normal retry CTA.

## Initial Intent Persistence

Initial intent persistence is best-effort only. Its result is recorded on the non-secret invocation result but cannot block initial `liff.login()` or LIFF entry navigation. Existing deferred Step 3 design/OA handoff behavior is not changed.

## Callback Resume

The existing `line_auth=identity` direct and LIFF-wrapped callback handling remains intact: callback bootstrap holds Landing, initializes LIFF, synchronizes identity, commits Step 1 and `landingDismissed`, renders, then releases the hold.

## Failure Diagnostics

Real failed starts emit a UAT-only non-secret diagnostic with: LIFF initialization status, LIFF-ID presence, `isInClient`, `isLoggedIn`, canonical-identity presence, attempted method, invocation status, and the existing F05E failure code. No LINE user ID, token, or secret is emitted.

## Tests

35 focused tests passed.

- True LIFF client profile synchronization with zero `liff.login()` calls.
- LINE in-app and external mobile first-tap login invocation exactly once.
- Normal login invocation, synchronous throw, and missing/blocked localStorage intent behavior.
- Initial callback Step 1 resume without Landing re-render.
- Existing canonical identity Start, callback bootstrap, identity flow, local Step 2 -> Step 3 atomicity, and restored Step 3 renderer contracts.

`node --check app.js`, `node --check initial-line-auth.js`, and `git diff --check` passed.

## UAT Deployment

Frontend commit `d1e637fa0e257699978c6138a1d03beaf1b15604` was pushed to `origin/uat`. The UAT custom domain resolves to a Ready Vercel deployment and its served `app.js` contains the initial-auth adapter and UAT failure diagnostic. Render is not required.

## Owner Retest

Required before declaring the real-device issue fixed: tap Start once in a first-time mobile/LINE context, complete LINE authentication, and confirm callback proceeds to Step 1 without another Landing state.

## Production Isolation

Only Landing/LIFF initial identity code and its tests are changed. Step 2, Step 3 renderer and slots, geometry, fit, catalog, Supabase, OA friendship, Step 4, payment, backend, and production are untouched.
