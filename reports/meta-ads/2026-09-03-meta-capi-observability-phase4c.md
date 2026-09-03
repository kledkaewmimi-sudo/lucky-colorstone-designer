# Phase 4C — Meta CAPI delivery observability

## Scope

This UAT-only change adds safe operational observability to the existing server-side Meta CAPI Purchase sender. It does not alter the CAPI endpoint, credentials, event payload, Stripe paid authority, checkout, orders, CRM, inventory, browser Pixel, browser Purchase, or Meta Ads ingestion.

## Previous gap

The paid Stripe webhook invoked `sendMetaPurchaseEvent()` after paid-order persistence, and failures emitted a redacted warning. A successful Meta HTTP response returned `{ sent: true }` but had no success log and discarded the response body. Therefore a future paid order could not prove CAPI acceptance from application logs.

## Safe logging added

After configuration and event construction succeed, the sender logs:

```text
[meta-capi] Purchase attempt order=<Lucky order ID>
```

After a successful Meta HTTP response, it safely parses the response body and logs:

```text
[meta-capi] Purchase accepted order=<Lucky order ID> events_received=<number|unknown> fbtrace_id_present=<true|false> http_status=<status>
```

The existing failure path is unchanged:

```text
[meta-capi] Purchase delivery failed for order=<Lucky order ID>: <error>
```

Malformed or unreadable success bodies produce `events_received=unknown` and `fbtrace_id_present=false`; they do not change the already accepted HTTP delivery or affect Stripe processing.

## Explicitly excluded from logs

No log emits a Meta token, request URL/token query, CAPI payload, customer email/phone, hashes, external ID hash, Stripe Checkout Session ID, `event_id`, `fbclid`, `_fbp`, `_fbc`, client IP, or customer user agent. `fbtrace_id` is represented only as a boolean presence marker.

## Files changed

- `server.js` — emits redacted attempt/accepted markers after the existing paid persistence path; retains the existing eight-second timeout and best-effort error handling.
- `meta-capi-purchase.js` — adds a tiny safe success-response summarizer for only `events_received` and `fbtrace_id` presence.
- `tests/meta-capi-purchase.test.cjs` — covers success metadata, malformed success bodies, safe log shapes, and existing payload/authority contracts.
- This report.

## Contract and safety

- CAPI payload changed: **NO**
- CAPI event ID changed: **NO**
- CAPI value/currency changed: **NO**
- Payment behavior changed: **NO**
- Browser Purchase changed: **NO**
- Frontend changed: **NO**
- Existing eight-second timeout: **UNCHANGED**
- Stripe webhook remains the sole paid-order authority: **YES**

The sender still runs only after paid persistence. CAPI timeout/error remains caught by the existing best-effort call site, so webhook completion, order persistence, CRM visibility, inventory/business processing, and customer confirmation remain independent of Meta delivery.

## Tests

Passed:

- `node --check server.js`
- `node --check meta-capi-purchase.js`
- `node --test tests/meta-capi-purchase.test.cjs` — 13 passing
- `node --test tests/meta-attribution.test.mjs` — 7 passing
- `node --test tests/meta-browser-purchase.test.mjs` — 9 passing
- `node tests/uat-frontend-safety.test.cjs`
- `git diff --check`

Blocked, not bypassed:

- `node --test tests/analytics-v2-server.test.mjs` — the existing UAT backend guard requires `APP_ENV=uat`, `UAT_BACKEND=true`, and UAT Supabase credentials. No guard or environment was altered merely to run this test.

## Production promotion requirement

Promote only the backend/helper/test/report changes through the normal clean production-review branch. A Render backend deployment would be required after explicit owner approval. No Netlify deployment is required because no frontend file changes.

## Final status

- CAPI observability improved: **YES**
- CAPI payload changed: **NO**
- CAPI event ID changed: **NO**
- CAPI value/currency changed: **NO**
- Payment behavior changed: **NO**
- Browser Purchase changed: **NO**
- Frontend changed: **NO**
- Production modified: **NO**
- Netlify deploy required: **NO**
