# Phase 4C — Meta CAPI delivery observability

## Scope

This backend-only production-review patch adds safe operational logging to the existing Meta CAPI Purchase sender. It does not alter the CAPI endpoint, token handling, payload, event ID, value, currency, matching data, timeout, Stripe authority, checkout, payment, CRM, inventory, frontend Pixel, browser Purchase, or Meta Ads ingestion.

## Safe delivery markers

After the existing sender has a configured CAPI destination and a complete event, it emits:

```text
[meta-capi] Purchase attempt order=<Lucky order ID>
```

After a successful Meta HTTP response, it emits only:

```text
[meta-capi] Purchase accepted order=<Lucky order ID> events_received=<number|unknown> fbtrace_id_present=<true|false> http_status=<status>
```

The response parser tolerates malformed/unreadable bodies without affecting the already accepted request or the paid webhook. The existing redacted failure marker and eight-second timeout remain unchanged.

## Explicit exclusions

Logs exclude all token/URL secrets, raw or hashed customer data, external-ID hash, Stripe Checkout Session ID, event ID, CAPI payload, user agent, `fbclid`, `_fbp`, `_fbc`, and `fbtrace_id` itself. Only its presence is recorded.

## Files

- `server.js` — attempt/accepted markers and safe response summary use.
- `meta-capi-purchase.js` — parses only `events_received` and `fbtrace_id` presence.
- `tests/meta-capi-purchase.test.cjs` — validates response parsing and safe log contract.
- This report.

## Contract

- CAPI payload changed: **NO**
- CAPI event ID changed: **NO**
- CAPI value/currency changed: **NO**
- User data changed: **NO**
- Timeout changed: **NO**
- Stripe paid authority changed: **NO**
- Payment behavior changed: **NO**
- Browser Purchase changed: **NO**
- Frontend changed: **NO**

No Netlify deployment is required. After owner approval, this requires only a Render backend deployment.
