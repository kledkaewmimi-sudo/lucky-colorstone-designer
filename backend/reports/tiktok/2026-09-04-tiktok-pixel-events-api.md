# TikTok Pixel + Events API implementation

Date: 2026-09-04

## Outcome

The production feature snapshot has a complete TikTok Pixel and Events API integration, ready for owner review. No merge or deployment was performed.

## Completed integration

- Browser attribution retains genuine first- and last-touch UTM, `ttclid`, and `_ttp` values in separate TikTok state.
- The browser fetches the public-only `/api/tracking/config` endpoint, loads the configured Pixel once, and queues one `PageView`.
- `ViewContent` and `InitiateCheckout` remain bound to their existing genuine customizer and successful Stripe-session call sites.
- Browser `CompletePayment` remains paid-response-only and uses `stripe_checkout_<session>` for deduplication.
- The paid Stripe webhook persists the authoritative paid order and then invokes TikTok Events API `CompletePayment` with isolated error handling.
- The public config response contains only `tiktokPixelId`; it never includes the Events API access token or test code.

## Safety

- Stripe payment authority, pricing, inventory, CRM, and Meta behavior were not changed.
- TikTok delivery failures are logged without payload, token, customer, or matching-identifier values and do not fail the webhook.
- Events API payloads use the authoritative paid-order THB total and the same deterministic CompletePayment event ID used by the browser.

## Validation

- `node --check server.js` and `node --check tiktok-events-api.js` passed.
- Focused TikTok tests passed for attribution, Pixel initialization/PageView/event ID, Events API payloads, optional test-event code, and server config/webhook boundaries.
- Existing Meta CAPI/browser-purchase regression tests passed.
- Final `git diff --check`, including each new untracked implementation/test file, passed.

## Remaining operational work

- Configure `TIKTOK_PIXEL_ID` and `TIKTOK_EVENTS_API_ACCESS_TOKEN`; `TIKTOK_TEST_EVENT_CODE` is optional and should be set only for TikTok test delivery.
- Review the uncommitted diff and perform an owner-controlled deployment/test-event verification before enabling live optimization.
- No merge, deployment, push, or production-data change was performed. The temporary `patch-write-check.tmp` file was removed during final cleanup.

## Environment note

Node emitted existing module-type warnings while running mixed `.mjs` and browser-module `.js` tests. The tests passed; no package-module configuration was changed because that is outside this integration's scope.

## Final review

Files changed: `app.js`, `server.js`, `tiktok-attribution.js`, `tiktok-browser-tracking.js`, `tiktok-events-api.js`, `tests/tiktok-attribution.test.mjs`, `tests/tiktok-browser-tracking.test.mjs`, `tests/tiktok-events-api.test.cjs`, and this report.

Config returns only public `tiktokPixelId`; the browser never receives the Events API access token or test code.
Browser mapping: `PageView` at initialization, `ViewContent` at genuine customizer entry, `InitiateCheckout` after Stripe session creation, and `CompletePayment` only after paid-only confirmation.
Events API mapping: `CompletePayment` occurs only after authoritative paid-order persistence; its failure is caught and cannot fail the Stripe webhook or order persistence.
Browser/server dedup uses exact `stripe_checkout_<Stripe Checkout Session ID>` event IDs and the authoritative paid THB total.
Attribution keeps immutable first touch and external last touch, retaining only genuine UTM, `ttclid`, and `_ttp` values.
Required variables: `TIKTOK_PIXEL_ID` and `TIKTOK_EVENTS_API_ACCESS_TOKEN`; optional `TIKTOK_TEST_EVENT_CODE` is sent only to Events API, never to the browser.
Meta Pixel/CAPI semantics are unchanged; logs omit raw PII, tokens, and payloads.
Validation passed: syntax checks, TikTok-focused tests, Meta purchase regressions, and `git diff --check`.
Cleanup performed: `patch-write-check.tmp` removed.
Final Git status and commit SHA are recorded in the final handoff; a commit cannot contain its own resulting SHA.

## Final flags

TikTok base Pixel implemented: YES; Config endpoint implemented: YES; PageView implemented: YES; ViewContent implemented: YES; InitiateCheckout implemented: YES; Browser CompletePayment implemented: YES; Events API CompletePayment implemented: YES.
Browser/server dedup verified: YES; Stripe paid authority preserved: YES; Meta tracking changed: NO.
Production data modified: NO; Production deployed: NO; `patch-write-check.tmp` removed: YES; Focused commit created: YES; Owner review required before merge/deploy: YES.
