# Phase 2: LINE redirect and design restore engine

**Date:** 2026-08-22

## Scope and unchanged production behavior

Phase 2 prepares a future Step 3-to-Step 4 LINE handoff but does not activate it. `DEFER_LINE_LOGIN_TO_STEP4` is hard-coded `false`; no normal startup, landing CTA, Step 3 navigation, LIFF call, checkout, renderer, analytics event, or customer UI invokes the new handoff endpoints or restore controller. Mobile LINE login remains before Step 1 and the intentional desktop bypass remains unchanged.

## Current-flow hook points

- `requireLineLoginForCustomization()` is the existing gate and still decides mobile/LINE-in-app behavior through `requiresLineLoginForCustomization()`.
- `startLiffLoginForCustomization()` and `openLineConnectEntryForCustomization()` still call `rememberCustomizationLoginIntent()` with the existing legacy shape `{ ts, step: 1 }` and use the clean `getLiffRedirectUri()`.
- `initLIFF()` runs on callback, retrieves the profile when available, then startup calls `clearOAuthQueryParams()` and `restoreCustomizationIntentAfterLogin()`.
- The current `restoreCustomizationIntentAfterLogin()` deliberately sets Step 1. Phase 2 does not change it.
- `hasCustomizationLoginIntent()` now uses a safe parser that accepts the exact legacy format and is ready to recognize a future version-2 handoff intent. It does not alter the current write path or resume destination.

The future Phase 3 hook is: create the snapshot and server handoff immediately before initiating a new Step 3 login; write a version-2 intent; after LIFF identity is available and before callback query cleanup, invoke the restore controller; only then apply canonical state and render an allowlisted target step. None of this hook is invoked now.

## Storage backend decision

The backend is deployed on Render and can restart or run more than one instance. An in-memory `Map` is therefore rejected: it cannot provide cross-context durability. No existing project KV/cache was found. The selected production-capable backend is a small Supabase table, `public.line_auth_handoffs`, accessed only by the server's existing service-role REST path.

The table and atomic consume RPC are supplied as a **manual migration** in `supabase/line_auth_handoffs_migration.sql`. It has not been executed. Until it is intentionally applied, the dormant endpoint fails closed with `503 Handoff storage unavailable`; this does not affect current customers because no production flow calls it.

## Token, TTL, and payload

- Token: `crypto.randomBytes(32).toString('base64url')`, a 43-character URL-safe opaque random token (256 bits). It encodes no payload.
- TTL: 20 minutes (`1,200,000 ms`), intentionally shorter than the Phase 1 two-hour local snapshot TTL.
- One-time semantics: `consume_line_auth_handoff(token)` atomically updates the row only when unconsumed and unexpired; callback refresh/replay then returns no payload.
- Cleanup: expiration is enforced on consume. The migration documents a trusted-server scheduled cleanup of rows expired more than 24 hours; never run cleanup from a browser.

The stored JSON payload is capped at 16 KiB and contains only:

```json
{
  "version": 1,
  "createdAt": 0,
  "expiresAt": 0,
  "targetStep": 4,
  "designSnapshot": { "version": 1, "savedAt": 0, "expiresAt": 0, "step": 3, "design": {} },
  "analyticsContinuity": {
    "visitorId": "optional pseudonymous ID",
    "sessionId": "optional pseudonymous ID",
    "attribution": { "source": "", "medium": "", "campaign": "", "content": "", "term": "" }
  }
}
```

The server validates the canonical snapshot structure, bounded component/charm counts, and allowlisted target steps. It stores no price, discount, shipping, name, LINE user ID/token, Stripe data, Supabase key, IP, or browser fingerprint. Analytics continuity is optional and only permits bounded pseudonymous IDs plus five bounded UTM dimensions. It is continuity metadata, never authentication or pricing authority.

## Restore precedence and callback controller

`restoreLineRedirectHandoff()` implements the future precedence:

1. Consume a valid, unexpired server handoff.
2. If the server handoff is unavailable, restore a valid Phase 1 local snapshot in the same storage context.
3. If neither works, return a safe `handoff_unavailable` result and let the existing current flow remain in control.

The controller returns the source (`server` or `local`) and allowlisted target; it does not alter application state itself in Phase 2. Phase 3 must inject catalog reconciliation, canonical-state application, normal price recomputation, and renderer recalculation after a successful result. Since only normal ordered Beryl IDs are saved, the existing Green/Pink/Blue deterministic occurrence resolver continues to apply.

## Intent compatibility and feature flag

`parseCustomizationLoginIntent()` accepts the existing `{ ts, step: 1 }` intent as version 1. A future version 2 intent is constrained to:

```json
{
  "version": 2,
  "ts": 0,
  "step": 3,
  "targetStep": 4,
  "handoffToken": "43-character opaque token",
  "mode": "guest_design_handoff"
}
```

Its target is an allowlisted step, not an arbitrary URL. The future creator refuses to create it while `DEFER_LINE_LOGIN_TO_STEP4` is false. Thus the feature flag is prepared but inactive.

## Analytics and UTM continuity

Current localStorage remains the primary source for `lucky_analytics_session_id`, `lucky_colorstone_visitor_id`, and current first/latest attribution. The server record is only a cross-context fallback. It does not overwrite an existing active local identity; Phase 3 must restore it only when local values are absent and format-valid, and must retain existing event names/semantics. Storing the allowlisted UTM dimensions prevents the current clean LIFF redirect URI from turning a cross-context return into a false direct first touch. No new analytics event is emitted in Phase 2.

## Deterministic tests

`tests/line-redirect-handoff.test.mjs` covers minimized payload validation, opaque token format, 20-minute TTL, no trusted pricing/IP field, legacy intent parsing, version-2 parsing, server-first restore, local fallback, and both-unavailable safe failure. Existing Phase 1 snapshot/Beryl tests continue to cover complex component ordering, Beryl occurrence sequence, malformed/expired snapshots, catalog reconciliation, and localStorage failures.

No real Instagram, LINE in-app, Chrome Android, or Safari iOS browser test was performed because browser automation was unavailable. Phase 3 must run the documented live-device matrix: same/cross context, returning user, cancellation, failure, expiration, duplicate callback, and refresh. The server RPC's one-time update is the planned duplicate-callback control.

## Manual action and Phase 3 readiness

Before any feature flag or client flow can invoke the API, an authorized operator must review and execute `supabase/line_auth_handoffs_migration.sql` in the correct production Supabase project, then verify server-only access and RPC behavior. Do not execute it automatically.

Phase 3 readiness is conditional on that migration, API smoke testing in a non-customer debug harness, and real device/in-app browser QA. Current checkout, CRM, orders, Stripe, webhook, LINE notifications, catalog, pricing, and analytics remain untouched.
