# Phase 3 — New Analytics Tracking Implementation

Date: 2026-08-23
Status: implemented tracking/data semantics only. CRM Analytics presentation was not changed.

## Scope

Implemented the version-2 tracking model from [2026-08-23-new-flow-analytics-model.md](2026-08-23-new-flow-analytics-model.md) for the live customer journey:

```text
Landing → Start Design → Step 1 → Step 2 → Step 3 → LINE Connected
→ Step 4 → Checkout Started → Paid
```

No customer-flow, LINE/OA gate, QA, checkout, Stripe, webhook, order, CRM Orders, pricing, renderer, catalog, Beryl, Meta Pixel, or notification behavior was changed.

## Files changed

- `analytics-tracking.js` — new pure v2 session/stage/continuity helper.
- `app.js` — uses the helper for session lifetime, callback continuity, v2 events, and LINE/OA diagnostic events.
- `line-auth-handoff.js` — accepts bounded session timestamps and platform classification alongside existing analytics continuity.
- `server.js` — de-duplicates v2 canonical stage writes and records v2 `payment_success` correlation only through the existing authoritative order-conversion path.
- `tests/analytics-tracking.test.mjs` — session, callback continuity, funnel-stage and real-integration assertions.
- `tests/analytics-v2-server.test.mjs` — server de-duplication, first-touch retention, legacy compatibility, and webhook-authority assertions.
- `tests/line-redirect-handoff.test.mjs` and `tests/line-oa-friendship-gate.test.mjs` — focused compatibility coverage.

## Session and visitor behavior

- A session now has a 30-minute inactivity window (`ANALYTICS_SESSION_TIMEOUT_MS`).
- `visitor_id` remains the persistent anonymous browser identifier and remains separate from LINE identity.
- `session_id`, start time, last-seen time, current v2 stage, and sent stage keys are stored in first-party analytics keys only.
- A refresh, back/forward navigation, or normal same-context return within 30 minutes continues the same session.
- A fresh manual entry still resets the customer design as before. It begins a new analytics session only after the 30-minute inactivity boundary; it does not generate a new visitor identity merely because the design is fresh.

## LINE/LIFF/OA callback continuity

The existing opaque handoff now carries bounded analytics continuity:

- session ID
- visitor ID
- session start / last-seen timestamps
- first-touch source, medium, campaign, content, term, and platform classification

`consumeDeferredLineAuthHandoff()` now returns this continuity with the design snapshot. The callback restore path validates and applies it before deferred analytics initialization and before its callback/stage events are emitted. A callback in another storage context therefore retains the originating session, visitor, and first-touch Instagram (or other) attribution instead of becoming LINE/direct/unknown.

Invalid, expired, or inactive (>30 minutes) continuity fails closed and does not overwrite a newer active analytics session. It also carries no LINE token, profile, payment data, secret, raw IP, or fingerprint.

## Version-2 events and idempotency

Every new client event carries:

- `schema_version: 2`
- `funnel_version: 2`
- `current_stage`

Canonical stage events additionally carry a stable per-session `funnel_stage_key`:

```text
v2:<session_id>:<stage>
```

The canonical stages are:

1. `landing_view`
2. `start_design`
3. `step_1_view`
4. `step_2_view`
5. `step_3_view`
6. `line_connected`
7. `step_4_view`
8. `checkout_started`
9. `payment_success`

The client retains sent stage keys for the active session, and the server checks the stage key before storing a v2 canonical stage. This controls repeated renders, refreshes, back/forward, callback restoration, and repeated checkout attempts without changing legacy-event retention.

## LINE/OA diagnostics

The implementation normalizes diagnostics to:

- `line_auth_started`
- `line_auth_success`
- `line_auth_error`
- `line_auth_unavailable`
- `oa_friend_required`
- `oa_friend_verified`
- `oa_friend_cancelled`
- `line_callback_resume`

`line_connected` is emitted only by the already verified-friend path: a LINE identity is available and the current OA friendship check returned `friendFlag === true`. LINE login success on its own cannot emit `line_connected`.

## Current-stage groundwork

The active analytics session now records the highest v2 stage reached in `current_stage` event metadata, using this precedence:

```text
landing < start_design < step_1 < step_2 < step_3 < line_connected
< step_4 < checkout_started < payment_success
```

This is tracking groundwork for the Phase 4 CRM current-stage calculation. The CRM UI still uses its existing presentation/calculation code in this phase.

## Checkout, paid, and revenue authority

- `checkout_started` is a canonical, de-duplicated per-session stage after a Stripe Checkout Session is created.
- `payment_success` v2 correlation is recorded by `linkAnalyticsOrderConversion()` only for v2 order payloads.
- The existing Stripe webhook paid-order save happens before analytics correlation and remains the only authority for paid status, revenue, and AOV.
- Legacy records retain their existing event behavior and are not rewritten.

## Compatibility

- The server continues to alias `start_design` to the current legacy `start_designer` summary key, so the existing CRM card remains populated until the planned Phase 4 UI/model update.
- Legacy funnel events remain append-only; v2 duplicate suppression applies only to explicitly versioned canonical stages.
- No database migration is required. Existing `analytics_events.properties` stores version/stage metadata, and existing `analytics_sessions` continues to hold attribution/conversion linkage.

## Tests and verification

Passed:

```text
node --test tests/analytics-tracking.test.mjs
            tests/analytics-v2-server.test.mjs
            tests/analytics-visitor-summary.test.mjs
            tests/line-redirect-handoff.test.mjs
            tests/line-callback-bootstrap.test.mjs
            tests/line-oa-friendship-gate.test.mjs

35 tests passed, 0 failed
node --check app.js
node --check server.js
node --check analytics-tracking.js
git diff --check
```

Coverage includes Instagram first-touch callback continuity, direct/session expiry behavior, one canonical stage per session, verified-friend-only `line_connected`, callback sequencing, server stage de-duplication, checkout stage semantics, paid webhook correlation, legacy event compatibility, and existing callback/friendship/handoff behavior.

## Follow-up

Phase 4 can update CRM Analytics calculations and UI to filter `funnel_version: 2`, display the nine-stage funnel, derive one active latest stage per session, and label legacy analytics separately. No historical data migration is needed.
