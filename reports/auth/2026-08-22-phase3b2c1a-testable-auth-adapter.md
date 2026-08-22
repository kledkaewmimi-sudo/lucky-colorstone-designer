# Phase 3B.2C-1A testable auth-gate adapter

## Scope

This change extracts only the deferred initial LINE-login decision boundary from `app.js`. It does not enable deferred login, create a handoff or V2 intent, change the Step 3 boundary, or alter any customer-facing route.

## Adapter

`deferred-initial-line-login.js` exports:

- `shouldBypassInitialLineLogin({ featureEnabled, requiresLineLogin, isAuthenticated, isCustomization })`: pure, directly testable decision adapter.
- `shouldBypassInitialLineLoginInProduction(context)`: the sole application entry. It resolves the feature with `resolveDeferredLineLoginFlag()` and therefore uses the shipped `DEFER_LINE_LOGIN_TO_STEP4 = false` value.

`app.js` calls the production entry inside `requireLineLoginForCustomization()`, after the existing desktop/order exclusions and `requiresLineLoginForCustomization()` check, at the former direct `shouldDeferInitialLineLogin()` call site. There is no URL, query parameter, global/window property, storage key, cookie, DOM control, or endpoint that can change the production value.

## Behavior and safety

With the deployed default false, the adapter returns false and the existing mobile/LINE-in-app login process remains unchanged. Desktop remains outside the requirement branch. Authenticated users retain the existing identity path. LIFF initialization, the legacy `{ ts, step: 1 }` intent, and the Phase 3B.1 startup callback hook are untouched.

The direct `featureEnabled: true` path exists only as a function argument in the isolated Node test; it is not reachable from customer input. This proves the future decision without activating guest Step 1-3, Step 3 LINE redirect, V2 intent, server handoff, or Step 4 restore.

## Verification

- Production adapter returns false for an otherwise eligible mobile customization context.
- Pure adapter returns true only for explicit `featureEnabled: true`, an unauthenticated customization context, and a LINE-required context.
- Desktop, authenticated, non-customization, disabled, and malformed contexts return false.
- A source assertion verifies `app.js` uses the production adapter and no longer reads `DEFER_LINE_LOGIN_TO_STEP4` directly.
- Existing redirect-handoff and callback-bootstrap tests remain part of the focused regression run.

## Rollback and next step

Rollback is immediate and requires no user-visible action: the shipped resolver remains false. The next phase may test a controlled integration by dependency-injecting the pure adapter at a test harness boundary; it must not introduce a public runtime switch.
