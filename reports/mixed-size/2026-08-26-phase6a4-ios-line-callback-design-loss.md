# Phase 6A.4 — iOS LINE callback design-loss root cause and fix

Date: 2026-08-26  
Worktree: `D:\Projects\lucky-colorstone-prod-promotion`  
Branch: `feature/mixed-size-production-promotion`

## Root cause

The deferred V2 handoff token was stored only in `localStorage` under `lucky_colorstone_customize_login_intent`. `getLiffRedirectUri()` returned only the site origin and path, so it did not carry that opaque token across the LINE return. In a new iOS Safari/WebView context, the in-memory `State`, `sessionStorage`, and that local-storage intent can be absent. Startup then classified the visit as `normal`, set `shouldStartFreshCustomization`, and ran `resetCustomizationSessionForFreshEntry()` before server recovery could begin. That reset clears the guest snapshot and login intent, producing the observed Landing-page loss.

This is a real fresh-reset race caused by new-context callback-marker loss. Production Beryl, mixed-size geometry, pricing, payment, and CRM behavior were not implicated.

An additional server-handoff compatibility defect was found during the audit: the handoff normalizer accepted only fixed bead sizes and omitted per-stone physical sizes, `mixedPlacingSize`, and component unique IDs. It would not safely carry a mixed design through the server-first path. The handoff normalizer now preserves the canonical mixed/fixed snapshot fields only; derived layout, pricing, and fit data remain excluded.

## Event order

```text
Step 3 Continue
  -> setupNavigationEvents validates stock
  -> beginDeferredStep3AuthBoundary()
  -> saveGuestDesignSnapshot() [local key: lucky_colorstone_guest_design_snapshot]
  -> POST /api/auth-handoffs [server row: line_auth_handoffs; opaque 43-char token; 20 min TTL]
  -> persistCustomizationLoginIntent() [local key: lucky_colorstone_customize_login_intent]
  -> liff.login({ redirectUri }) / LIFF entry
  -> redirect URI contains line_handoff=<opaque token>&line_resume=guest_design_handoff
  -> LINE authentication / OA friendship path
  -> callback bootstrap parses URL marker before fresh-entry reset
  -> initLIFF() establishes LINE identity
  -> canEnterOperationalStep4() verifies existing LINE/OA requirements
  -> GET /api/auth-handoffs/:token [read server handoff; no premature consume]
  -> applyCanonicalGuestDesignSnapshot() [canonical components and physical sizes]
  -> POST /api/auth-handoffs/:token/consume [ack after apply]
  -> clear local intent/snapshot and callback query marker
  -> authorized Step 4 resume
```

OAuth query cleanup still removes only OAuth parameters. It leaves the LINE callback marker available until restore succeeds or a server-confirmed missing handoff makes it terminal. A successful recovery removes that marker from browser history; a temporary failure preserves it for retry.

## Fix

- `line-redirect-restore.js` creates/parses a bounded callback resume URL containing only an opaque handoff token and explicit resume marker. It contains no design data and cannot authorize Step 4.
- `app.js` prefers a valid callback URL intent over browser storage during bootstrap. Recognized callback intent therefore defers fresh reset in a new iOS browsing context.
- `app.js` carries the callback marker in LIFF redirect and LIFF entry URLs, retrieves the server handoff before applying it, acknowledges consumption only after successful apply, and removes the marker only on success or server-confirmed terminal absence.
- `server.js` adds a read-only handoff retrieval endpoint (`GET /api/auth-handoffs/:token`) and retains the existing consume endpoint as a post-apply acknowledgement. No Stripe, webhook, payment, order, or CRM behavior changed.
- `line-auth-handoff.js` accepts canonical fixed/mixed snapshot state and preserves physical 4/6/10 sizes, mixed placement size, ordering, charms/spacers, and component unique IDs. It still excludes derived geometry, pricing, and fit data.

## Security and failure handling

- A URL marker must contain a valid opaque token, resolve to an unexpired server handoff, pass existing LINE identity verification, and pass existing OA friendship verification. It cannot independently authorize Step 4.
- Invalid/expired/consumed tokens return `handoff_not_found`; no local design is resurrected and no Step 4 authorization occurs.
- A temporary apply or acknowledgement failure leaves the server record readable until normal expiry, allowing callback retry/reload without immediately losing the design.
- True public visits without a valid callback marker still take the existing fresh reset path with `beadSize = null` and Landing.

## Verification

- New iOS integration simulation covers same context, new context with no `State`/session/local intent, mixed component preservation, callback retry after apply interruption, true fresh visits, and invalid tokens.
- Focused callback/restore/OA/deferred-auth/guest-state/analytics suite: 53 passed, 0 failed.
- Complete wildcard suite: 110 passed, 0 failed.
- Syntax checks passed for `app.js`, `server.js`, `line-auth-handoff.js`, `line-redirect-restore.js`, and `line-callback-bootstrap.js`.
- `git diff --check` passed.

No production deployment, main-branch push, environment change, Supabase mutation, Stripe checkout, or LINE message occurred.
