# Fresh Entry Customization State Reset

## Root cause

Startup unconditionally loaded `lucky_colorstone_state` and the `lucky_colorstone_landing_dismissed` session marker. That persisted the prior wrist/bead choices, components, charm selection, current step, and hidden landing state into a manually reopened customer URL.

## Fresh-entry behavior

Before loading persisted design state, startup now classifies the URL/session as either a valid protected return or a new public entry.

A new public/manual entry clears only customization-session keys:

- `lucky_colorstone_state`
- `lucky_colorstone_guest_design_snapshot`
- `lucky_colorstone_customize_login_intent`
- `lucky_colorstone_line_oa_friendship_resume`
- `lucky_colorstone_line_oa_friendship_resume_fallback`
- `lucky_colorstone_landing_dismissed`
- checkout-summary and pending Stripe order-payload keys

It resets runtime design state to the normal defaults: 16 cm wrist size, 6 mm beads, empty components, empty charm/spacer selections, Step 1, and Landing visible. It does not use `localStorage.clear()` and does not touch analytics visitor/session/UTM keys, Meta data, or the server-validated QA cookie/session.

The Home action now intentionally discards the active design session before returning to Step 1. It preserves an already-synced LINE identity in memory, but no design can reappear after a later fresh visit.

## Protected returns

Persisted design state is retained only for a current valid legacy LINE resume, a current flagged V2 callback, or a bounded OA friendship-return marker. Those paths continue through the callback visual hold and existing LIFF/friendship/handoff restore sequence.

An explicit private QA activation fragment is always a fresh entry after activation, even if a previous V2 intent remains in browser storage. It activates QA normally, removes the fragment, and starts at Landing.

## Stale/consumed handoffs

The server now distinguishes a definitive 404 consume result from a temporary handoff-service failure. A confirmed missing, expired, or consumed handoff returns `handoff_not_found` and does not fall back to a local snapshot. Startup clears the stale customization session and returns to Landing. A network/service-unavailable handoff remains eligible for the existing same-context local snapshot fallback.

## Preserved behavior

- Callback bootstrap hold remains active for valid callbacks, so no intermediate landing/step flash is introduced.
- LINE OA friendship hard gate, native/fallback OA flow, checkout guard, canonical restoration, Beryl behavior, and pricing are unchanged.
- Stripe, webhook, CRM, buyer/admin notifications, analytics, UTM, and Meta Pixel semantics are unchanged.

## Verification

- Focused callback, handoff, snapshot, and OA friendship suites — 28 passed.
- Full automated suite — 50 passed.
- `node --check app.js`, `node --check line-redirect-restore.js`, `node --check server.js`, and `git diff --check` — passed during focused verification.

Real LINE/device behavior requires owner retest after deployment.
