# Phase 3B.4 LINE callback restore to Step 4

## Scope and production default

Phase 3B.4 completes the deferred-login callback path behind the existing false-by-default resolver. `DEFER_LINE_LOGIN_TO_STEP4` remains `false`; deployed customers continue using the legacy mobile LINE-before-Step-1 flow. The callback path is exercised only through controlled module injection in tests.

No Stripe, webhook, CRM, order, LINE paid-notification, renderer, ResolvedLayout, catalog, inventory, pricing authority, analytics event definition, UTM generator, or Meta Pixel definition changed.

## Callback-first lifecycle

At startup, `app.js` reads and classifies the customization intent before `loadPersistedState()` and either legacy or normal `resetStep3DesignState()` can clear the design.

For a valid, feature-enabled V2 intent, startup holds the pre-login state instead of taking the normal reset branch. It then initializes LIFF and attempts restore only after `isLineIdentityAvailable()` succeeds. The restore invocation is before the legacy `restoreCustomizationIntentAfterLogin()` route, so a V2 callback cannot be treated as the old `{ ts, step: 1 }` flow.

The production resolver is still false, so this hold/restore branch is inactive for normal customers.

## Restore sequence and precedence

`restoreDeferredLineCallbackBeforeReset()` uses the Phase 3A callback planner and restore guard. Its sequence is:

1. Validate the V2 intent and LINE identity.
2. Await catalog warmup so reconciliation uses current catalog data.
3. Atomically consume the existing Phase 2 server handoff.
4. If unavailable, read the existing Phase 1 local snapshot as same-context fallback.
5. Reconcile canonical components against current stones, charms, spacers, and valid charm placement.
6. Apply canonical wrist size, bead size, ordered components, and selected charms; assign fresh transient item IDs; recompute normal size/layout/pricing inputs; set the allowlisted target to Step 4.
7. Clear the V2 intent and local snapshot only after successful application.

No `ResolvedLayout`, canvas output, Beryl color variant, trusted price, LINE token/profile, payment data, or secret is restored. Beryl remains derived from normal occurrence order, and pricing remains derived by existing live business rules.

## Failure and idempotency

- Missing identity waits safely and does not restore or redirect again.
- Invalid, expired, consumed, or unavailable server handoffs cannot yield a server payload; the normal local snapshot fallback is tried once.
- If neither source is usable, the callback remains on its recoverable preserved Step 3 state rather than opening Step 4.
- The callback restore guard prevents duplicate successful consume/apply within a startup. After successful application the V2 intent is cleared, so refresh/back cannot replay it. The atomic Phase 2 consume also rejects a repeated token.
- Catalog reconciliation skips unavailable components without crashing and preserves valid remaining canonical design.
- Existing checkout and CRM code still require LINE identity before their first order/payment action, so an unauthenticated callback cannot create checkout/order/CRM side effects.

## Tests

The callback suite covers:

- flag-off legacy and normal startup classification;
- valid feature-enabled V2 restore after identity, server-first source, allowlisted Step 4 target, and one-time consume;
- local fallback, unavailable server/no-identity handling, callback refresh, and duplicate callback guard;
- old V1 intent compatibility;
- source ordering: V2 hold before normal reset, restore after LIFF, and before legacy resume;
- complex canonical snapshot, Beryl Green/Pink/Blue/Green, pricing-input safety, and safe corrupt/expired/local-storage snapshot handling via the Phase 1 suite; and
- Phase 2 token/handoff payload validation and server-first fallback behavior.

`node --check` passed for affected JavaScript. The focused callback, boundary, auth, handoff, snapshot, and Beryl suites passed **32 tests** with zero failures. `git diff --check` passed. Node reported only the existing ESM package-type warnings.

## Browser/device QA and rollout

Browser automation is unavailable in this environment, so no real browser, LINE in-app, Instagram, Chrome Android, or Safari iOS test was performed. Controlled real-device QA is now the next step; it must begin with the flag off and use an approved, scoped test procedure before any broad enablement.

Rollback remains immediate: keep `DEFER_LINE_LOGIN_TO_STEP4 = false`. No database rollback or schema migration is required.
