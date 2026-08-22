# Phase 3B.1 real callback pre-reset hook

`app.js` now calls `planLineCallbackBootstrap()` immediately after reading URL parameters and before `loadPersistedState()` and the legacy `resetStep3DesignState('customization-login-resume')` branch. Only a parsed legacy `{ ts, step: 1 }` intent sets `shouldResumeCustomizationStart`; its downstream behavior is unchanged.

A V2 handoff intent is now explicitly classified before that destructive reset. Because `DEFER_LINE_LOGIN_TO_STEP4` remains false, the planner returns its dormant safe fallback and no V2 restoration, Step 4 routing, guest access, LINE redirect, analytics, Pixel, or state mutation occurs. This is the exact Phase 3B.2 hook: when the flag is later enabled, V2 restore must execute at this point before the legacy reset branch.

The integration adds no render, renderer, pricing, Stripe, CRM, order, notification, analytics, UTM, or Meta Pixel behavior. Refresh/idempotency and loop protection remain in the Phase 3A planner/guard and are covered by its tests. Rollback is immediate: keep the flag false; legacy startup remains the only active branch.
