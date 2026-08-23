# Phase 3B.3 Step 3 auth boundary

## Scope

This phase adds only the pre-redirect Step 3 mandatory-LINE boundary behind the existing false-by-default resolver. It does not consume handoffs, restore design state, resume Step 4, or change the callback planner. Production remains on the legacy mobile login-before-Step-1 path.

## Real integration

`setupNavigationEvents()` now invokes `beginDeferredStep3AuthBoundary()` after normal Step 3 completeness/stock validation and before `bracelet_completed`/`goToStep(4)`.

`beginDeferredStep3AuthBoundary()` creates the production instance of `createDeferredStep3AuthBoundary()` with the current real dependencies:

1. `saveGuestDesignSnapshot()` creates the Phase 1 canonical local snapshot.
2. `createDeferredLineAuthHandoff()` posts the snapshot and bounded continuity fields to the existing Phase 2 `/api/auth-handoffs` endpoint.
3. `persistCustomizationLoginIntent()` stores the V2 `{ version: 2, step: 3, targetStep: 4, handoffToken, mode: 'guest_design_handoff' }` intent.
4. `startDeferredLineLoginWithPersistedIntent()` starts the existing LIFF or LINE-entry path without overwriting the already-persisted V2 intent.

The controller invokes a later operation only if every earlier operation succeeded. Snapshot, handoff, intent, and login-start failures return a handled failure and keep the user on Step 3. A login-start failure clears the just-persisted V2 intent; a created server handoff simply expires under its existing short TTL.

The existing `startLiffLoginForCustomization()` and `openLineConnectEntryForCustomization()` preserve their original default behavior. Their new opt-in arguments are used only by this boundary to preserve an already-stored V2 intent and provide a start-status result. Legacy callers still write the old `{ ts, step: 1 }` intent.

## Flag, desktop, and fast path

The controller defaults to `resolveDeferredLineLoginFlag()`, whose shipped value is `DEFER_LINE_LOGIN_TO_STEP4 = false`. With that default, it returns `handled: false` before snapshot, handoff, intent, login, or navigation work, so the existing Step 3 route is unchanged.

Controlled tests create the identical controller with a resolver returning true. An authenticated mobile user and a desktop/non-LINE-required context likewise return `handled: false`, preserving their direct Step 3-to-Step 4 route. The unauthenticated mobile test runs the full ordered pre-redirect sequence.

## Data and downstream safety

- The handoff uses the existing Phase 2 API and includes the Phase 1 snapshot, target step 4, and bounded visitor/session plus UTM `source`, `medium`, `campaign`, `content`, and `term` continuity values.
- The snapshot contains canonical design state only; it has no trusted price, LINE credentials/profile, shipping details, payment data, or secrets.
- The existing checkout and CRM submit functions retain `requireLineLoginForCustomization()` before Stripe or CRM work. This boundary stops at login initiation and does not expose operational guest checkout.
- No renderer, ResolvedLayout, Beryl, pricing, catalog, inventory, Stripe, webhook, CRM, paid-order notification, analytics event definition, UTM generation, or Pixel definition changed.
- No callback consume/restore/resume behavior is activated in this phase. Phase 3B.4 owns that work.

## Tests

`tests/deferred-step3-auth-boundary.test.mjs` covers:

- exact snapshot → handoff → V2 intent → LINE start order;
- disabled flag, authenticated mobile, and desktop direct paths;
- snapshot, handoff, and intent failures without login launch;
- login-start failure cleanup;
- old-intent parsing compatibility; and
- source assertion that the real Step 3 handler invokes the production boundary before `goToStep(4)`.

The focused suite passed 30 tests. `node --check` passed for `app.js`, `deferred-step3-auth-boundary.js`, and `line-redirect-restore.js`; `git diff --check` passed. Node emitted only the existing package-module-type warnings. No real-device or browser validation was performed.

## Rollback and Phase 3B.4 readiness

Rollback is immediate: keep `DEFER_LINE_LOGIN_TO_STEP4 = false`; no database or code rollback is required. The production default remains false after deployment. The pre-redirect contract is ready for Phase 3B.4 to consume the V2 handoff after LINE callback, restore canonical state, and resume Step 4.
