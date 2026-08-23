# Phase 3B.2C-2 isolated real-guard test seam

## Change

`deferred-initial-line-login.js` now exports `createInitialLineLoginGuard({ resolveFeatureEnabled })`. It returns the exact guard wrapper implementation used by `app.js`: it supplies a resolved boolean feature value to `shouldBypassInitialLineLogin()` with the real guard context.

`shouldBypassInitialLineLoginInProduction` is created once with the default `resolveDeferredLineLoginFlag` resolver. That resolver still returns the shipped `DEFER_LINE_LOGIN_TO_STEP4 = false` value. `app.js` remains unchanged and continues to invoke only this default wrapper.

Tests may instantiate the same wrapper with `createInitialLineLoginGuard({ resolveFeatureEnabled: () => true })`. This is ordinary isolated Node dependency injection, not a mutable application setting. There is no URL, global/window field, DOM, storage, cookie, endpoint, or runtime debug switch.

## Verification

- Default production wrapper: unauthenticated mobile customization returns `false`, preserving the existing LINE requirement before Step 1.
- Controlled test wrapper: the identical wrapper implementation with an injected `true` resolver returns `true` only for an otherwise eligible unauthenticated customization context.
- Removing the injected resolver by constructing the default wrapper immediately returns to false behavior.
- Desktop, authenticated, non-customization, and malformed contexts fail safe to false.
- `app.js` still imports only `shouldBypassInitialLineLoginInProduction` and has no direct feature-flag read.
- No LIFF, legacy intent, callback startup, V2 intent, server handoff, payment, CRM, analytics, UTM, Pixel, renderer, pricing, or catalog code changed.

## Rollback

No runtime rollback is needed: production always uses the default false resolver. The test factory is never invoked by customer code.

## Readiness

The isolated test seam now supports the next controlled Phase 3B.2C guest Step 1-3 harness validation without exposing a production switch.
