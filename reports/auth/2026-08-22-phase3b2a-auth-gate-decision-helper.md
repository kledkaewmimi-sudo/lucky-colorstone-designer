# Phase 3B.2A deferred auth-gate decision helper

`shouldDeferInitialLineLogin({ featureEnabled, requiresLineLogin, isAuthenticated, isCustomization })` is a pure helper in `line-redirect-restore.js`. It returns true only for a feature-enabled, unauthenticated mobile/LINE-in-app customization context that would otherwise require LINE. Desktop (`requiresLineLogin: false`), authenticated users, malformed input, non-customization contexts, and a disabled flag all return false.

It has no storage, LIFF, DOM, redirect, analytics, UTM, Pixel, or intent side effects and is not imported by `app.js`. Thus the existing guard remains unchanged. Phase 3B.2B's exact hook is the early `requireLineLoginForCustomization()` decision, after its existing desktop/order exclusions and before it starts LIFF login.
