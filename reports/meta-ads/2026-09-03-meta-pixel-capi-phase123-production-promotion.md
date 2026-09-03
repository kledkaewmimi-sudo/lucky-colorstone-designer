# Meta Pixel/CAPI Phases 1–3 — Production Promotion Review

## Base and branch

- `origin/main` base: `a4ff7199f41e65de0eff41431ba8c6959f99035e`
- Review branch: `meta-pixel-capi-production`
- Candidate implementation commit: `2c2d9f09c6386a21a27b8b8e383425b32a63f006`
- `main` modified: **NO**
- Production deployed: **NO**

This branch was created directly from the fetched `origin/main`, not from UAT. UAT commits were inspected but not cherry-picked. Only isolated Meta tracking hunks were reconstructed against current production code.

## Production-base verification

Before applying changes, `origin/main` was verified to contain the audit baseline:

- `index.html`: existing Meta Pixel base and `PageView`
- `app.js`: existing `ViewContent` and `InitiateCheckout`
- `server.js`: existing CAPI `Purchase` sent asynchronously only after authoritative Stripe paid persistence

No mismatch requiring a stop was found.

## Dependency closure and changed paths

Runtime:

- `app.js`
- `server.js`
- `meta-attribution.js`
- `meta-capi-purchase.js`
- `meta-browser-purchase.js`

Focused tests:

- `tests/meta-attribution.test.mjs`
- `tests/meta-capi-purchase.test.cjs`
- `tests/meta-browser-purchase.test.mjs`

No scheduler, GitHub Actions workflow, deployment configuration, Supabase migration, CRM, renderer, catalog, inventory, pricing, or unrelated UAT file is in the implementation commit.

## app.js hunk review

The only production behavior changes are Meta tracking additions:

1. Persist `metaAttribution` in first-party localStorage and include it in the existing order payload helper. First touch is immutable; last touch changes only on external UTM/fbclid/referrer evidence.
2. Add a delayed safe cookie hydration pass for real `_fbp`/`_fbc` availability without replacing touch source.
3. Extend the existing `trackMetaEvent` wrapper to accept an optional Pixel options object. Existing PageView/ViewContent/InitiateCheckout call patterns remain unchanged.
4. After the existing server-confirmed paid return flow, invoke a tracking-only minimal verification request and send Pixel `Purchase` with Meta `eventID`.
5. Store a first-party refresh/repeat marker keyed by the deterministic event ID.

No layout, renderer, pricing, checkout creation, order state, Stripe state, inventory, CRM, or operational analytics logic was changed.

## server.js hunk review

The only production behavior changes are Meta tracking additions:

1. Replace the existing CAPI payload construction with the Meta-only builder while keeping the same post-`saveOrderForApi` / post-analytics asynchronous trigger.
2. Pass the already-authoritative Stripe session to the builder for genuine matching data.
3. Add an 8-second abort timeout around the CAPI request; errors remain caught by the pre-existing best-effort caller.
4. Add `GET /api/stripe/purchase-tracking?session_id=...`, a read-only response that returns only `{ paid, event_id, value, currency }` for a persisted paid order.

Stripe webhook signature checks, accepted paid event types, payment/order persistence, stock deduction, amount/currency validation, duplicate webhook handling, LINE notification, and webhook response semantics are unchanged.

## Phase 1 contract

**Verified: YES**

- generic UTM capture: yes
- first touch immutable / external last touch: yes
- `fbclid` captured only when received: yes
- `_fbp` read only from valid existing cookie: yes
- `_fbc` kept from valid cookie or derived only from actual `fbclid`: yes
- no fabricated Meta identifiers: yes
- Linktree UTM landing: yes
- raw identifiers not logged: yes
- existing first-party session/order payload continuity: yes

## Phase 2 contract

**Verified: YES**

- CAPI remains post-authoritative paid persistence only: yes
- deterministic ID: `stripe_checkout_<Stripe Checkout Session ID>`
- persisted valid `_fbp`/`_fbc`: yes
- email normalized/lowercased and SHA-256 hashed: yes
- phone included only with explicit strict E.164 input, then SHA-256 hashed: yes
- `external_id` is SHA-256 immutable order ID: yes
- client user agent only from persisted customer browser analytics source: yes
- client IP omitted: yes
- event source is sanitized HTTPS Lucky Colorstone origin/path: yes
- value/currency from authoritative order total / THB: yes
- CAPI timeout: 8 seconds
- failure isolation and redacted logging: yes

## Phase 3 contract

**Verified: YES**

- browser Purchase is not triggered by success URL alone: yes; it requires minimal server response with persisted paid state
- browser `Purchase` uses `{ eventID: purchase.eventId }`: yes
- browser and CAPI share the identical deterministic event ID, value, and THB currency: yes
- first-party local refresh/repeat guard: yes
- Linktree/direct flow does not require fbclid/fbp/fbc: yes
- Pixel failure returns safely and has no payment/order effect: yes

## Purchase-tracking endpoint security review

The endpoint relies on the opaque Stripe Checkout Session ID already placed into the controlled Stripe success redirect. It does not accept order IDs and returns no order/customer/Stripe metadata. Guessing a valid Stripe Checkout Session ID is not a practical enumerable lookup mechanism; however, response existence/payment state could be inferred by anyone who already possesses that opaque URL token.

Minimal hardening included:

- response is exactly `paid`, `event_id`, `value`, `currency` or `paid: false`
- `Cache-Control: private, no-store`
- no email, phone, shipping, order payload, fbp/fbc, or credentials

The existing server applies its normal request handling. No separate rate limiter or authentication redesign was added because that would expand the existing checkout-return model without concrete evidence of enumeration abuse.

## Secret / PII scan

**PASS**

The candidate implementation/test diff contains no access token, Stripe secret, webhook secret, Supabase service-role value, or real customer data. Environment variable names remain as intended. Test values (`ORDER-123`, `cs_paid_123`, `Buyer@example.com`, sample Meta cookie formats) are synthetic fixtures.

## Tests

Passed:

- `npm ci` completed from existing lockfile (no lockfile change). npm reported 4 pre-existing dependency advisories and a pending optional `sharp` script approval; neither was changed.
- Meta phase tests: 7 passing assertions across attribution, CAPI and browser-dedup suites
- `tests/analytics-tracking.test.mjs`: 7 passed
- `tests/analytics-v2-server.test.mjs`: 4 passed
- `tests/production-checkout-completion-authority.test.mjs`: 5 passed
- `tests/production-mixed-server-validation.test.mjs`: 7 passed
- `node --check server.js`: passed
- `git diff --check`: passed

Blocked/unavailable:

- UAT-only `uat-frontend-safety` and UAT backend-guard tests do not exist on this production branch and were not copied, because they are unrelated UAT infrastructure.
- No live Stripe, Meta Events Manager, CAPI, or Pixel request was run.

## Final status

- Clean promotion branch created: **YES**
- Phase 1 included: **YES**
- Phase 2 included: **YES**
- Phase 3 included: **YES**
- Linktree support included: **YES**
- Browser/CAPI dedup contract preserved: **YES**
- Stripe authority preserved: **YES**
- Payment behavior changed: **NO**
- CRM behavior changed: **NO**
- Main modified: **NO**
- Production deployed: **NO**

Owner approval is required before merging this review branch to `main`.
