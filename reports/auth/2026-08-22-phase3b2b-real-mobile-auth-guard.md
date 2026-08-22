# Phase 3B.2B real mobile auth guard

The only guard hook is inside `requireLineLoginForCustomization()`, after the existing desktop/order exclusions and after the mobile/LINE-in-app requirement check. `shouldDeferInitialLineLogin()` is evaluated only when the landing caller supplies `allowDeferredInitialLogin: true`.

With the shipped `DEFER_LINE_LOGIN_TO_STEP4 = false`, the helper returns false and the existing pre-Step-1 mobile redirect is unchanged. Desktop remains outside the mobile requirement branch. LIFF initialization and authenticated identity/profile detection are unchanged. Checkout and other callers do not supply the initial-defer option, so they retain the normal required LINE guard; this phase creates neither server handoffs nor V2 intents.

Rollback is setting/keeping the flag false. No analytics, UTM, Pixel, renderer, pricing, Stripe, CRM, or order code changed.
