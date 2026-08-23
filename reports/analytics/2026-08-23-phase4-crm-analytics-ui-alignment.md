# Phase 4 CRM Analytics UI Alignment

Date: 2026-08-23
Scope: CRM Analytics aggregation and presentation only. Customer tracking, LINE/OA flow, Stripe, webhooks, CRM Orders, pricing, renderer, catalog, UTM capture, and Meta Pixel semantics were not changed.

## What changed

`/api/crm/analytics/summary` now returns the Phase 3 version-2 analytics model only. Legacy analytics events remain untouched and are excluded from these new-model cards rather than being mixed with the new LINE/OA journey.

- The funnel is now: Landing, Start Design, Step 1, Step 2, Step 3, LINE Connected, Step 4, Checkout Started, Paid.
- Each funnel row is a unique `session_id` set. Repeated v2 stage events cannot increase the row count.
- `line_connected` is counted only from the canonical event emitted after LINE identity and explicit OA friendship verification. `line_auth_success` remains diagnostic-only.
- The Analytics page now labels the v2/legacy boundary in its status text.
- Current customer stage is derived from the highest valid v2 stage for each active (last-seen within 30 minutes), unconverted session. The possible single contribution is Landing, Start Design, Step 1, Step 2, Step 3, LINE/OA, Step 4, or Checkout. Paid sessions are excluded.
- Owner channels use first-touch `analytics_sessions.first_source` and first-touch platform data. The groups are Instagram, LINE, Google, TikTok, Direct / Unknown, and Others. A later LINE/LIFF redirect cannot reattribute an Instagram session to LINE.
- Daily rows now show unique Landing sessions, unique Checkout Started sessions, authoritative Paid Orders, and authoritative revenue. The CRM table now has separate Checkout and Paid Orders columns.

## KPI authority and definitions

| KPI | Definition |
| --- | --- |
| Visitors | Unique valid `visitor_id` among v2 landing sessions in the selected range. |
| Sessions | Unique v2 sessions reaching `landing_view` in the selected range. |
| Checkout | Unique v2 sessions reaching `checkout_started`. |
| Paid Orders | Paid sessions linked by the existing Stripe webhook path only. |
| CVR | Authoritative paid sessions / unique v2 landing sessions. |
| Revenue | Existing webhook-linked paid revenue only. |
| AOV | Authoritative revenue / authoritative paid-order count. |

`payment_success` is now also marked as a converted analytics session when the existing webhook conversion link writes it. It does not change the webhook, payment state, order state, or financial authority; it corrects the CRM summary’s interpretation of the already-authoritative event.

## Historical compatibility

No analytics row was migrated, rewritten, or deleted. The summary explicitly returns `modelVersion: 2` and `legacyExcluded: true`; old records therefore cannot silently inflate or distort the new nine-stage funnel. Legacy data remains in storage for a separately labelled historical view if needed later.

## Files changed

- `server.js` — v2-only summary aggregation, unique stage/session sets, latest active-stage calculation, first-touch owner channels, and webhook-linked `payment_success` conversion recognition.
- `crm.html` — Daily Trends table separates Checkout from Paid Orders.
- `crm.js` — Current-stage display accepts the new named stages; Daily Trends renders Checkout and Paid separately and labels v2 summary status.
- `tests/analytics-v2-server.test.mjs` — deterministic summary regression coverage.
- `tests/analytics-visitor-summary.test.mjs` — fixture records identify as v2 analytics events.

## Validation

Passed:

```text
node --test tests/analytics-tracking.test.mjs tests/analytics-v2-server.test.mjs tests/analytics-visitor-summary.test.mjs
11 passed, 0 failed

node --check server.js
node --check crm.js
git diff --check
```

The fixture coverage verifies deduplicated v2 stages, a verified-only LINE Connected stage, first-touch Instagram attribution, one latest active current stage, LINE/OA pending state, v2 session/visitor counts, legacy event exclusion, and the existing webhook-before-analytics paid conversion path.

## Rollback

Revert only this focused CRM Analytics commit. No database migration, customer-storage cleanup, feature-flag change, or payment rollback is required.

## Remaining validation

After deployment, open CRM Analytics and confirm the v2 status label, nine funnel rows, separate Checkout/Paid daily columns, and responsive table layout. Live paid/revenue totals should be compared with authoritative Orders for the selected period.
