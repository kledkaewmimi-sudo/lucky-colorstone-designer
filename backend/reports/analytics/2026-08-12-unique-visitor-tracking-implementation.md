# Unique Visitor Tracking Implementation

| Field | Value |
| --- | --- |
| Date | 2026-08-12 |
| Environment | Production |
| Project | Lucky Colorstone |
| Status | Implemented and production API validated |
| Implementation commit | `0bdde26` |
| Related schema migration | `supabase/add_analytics_visitor_id.sql` (owner-confirmed executed) |

## Result

Analytics now reports anonymous **Visitors** separately from **Sessions**. The existing session model was intentionally preserved. Conversion rate remains paid orders divided by sessions.

## Privacy model

- The customer app uses `lucky_colorstone_visitor_id` in first-party `localStorage`.
- It creates the value once with `crypto.randomUUID()` where available, with a cryptographic `getRandomValues()` UUID v4 fallback.
- It does not use IP address, email, phone, LINE user ID, customer name, canvas/browser/device fingerprinting, or cross-device matching.
- The value is sent only with analytics session writes and stored on `analytics_sessions.visitor_id`; events remain linked by the existing `session_id` architecture.
- Historical rows were not changed or backfilled. Their `visitor_id` remains `NULL` and is excluded from unique visitor counts.

## Session model preserved

The existing `session_id` remains generated with `crypto.randomUUID()` (with its pre-existing fallback) and stored under `lucky_analytics_session_id` in `localStorage`, with no expiration/inactivity timeout. Refresh and close/reopen keep that stored session ID while browser storage exists. LINE WebView uses the same storage-based behavior; its storage can be isolated or cleared by the WebView/profile.

The new visitor ID is deliberately separate from this existing session ID. A later session implementation change is out of scope; it should not be silently combined with visitor tracking.

## API and dashboard

The analytics summary now returns, for the selected date range and after the existing `prelaunch_test` exclusion:

- `totals.sessions`
- `totals.uniqueVisitors` — `COUNT(DISTINCT visitor_id)` for valid non-null anonymous IDs
- `totals.visitorTrackedSessions`
- `totals.legacySessionsWithoutVisitorId`

Owner channel rows now return both `uniqueVisitors` and `sessions`. A visitor who has sessions attributed to multiple owner channels is counted once within each applicable channel, but once globally. The CRM Analytics page now shows Visitors and Sessions as separate KPI cards and adds Visitors to each owner-channel card.

## Server safeguards

The analytics endpoint accepts only canonical UUID-shaped visitor values (versions 1–5 form, normalized lowercase). Malformed or oversized values are ignored, not persisted as arbitrary analytics identity fields, and not logged unnecessarily.

## Tests

Local automated test: `node tests/analytics-visitor-summary.test.mjs` — passed.

It verifies:

1. One visitor across three sessions counts as 1 visitor / 3 sessions.
2. Two visitors across two sessions count as 2 visitors / 2 sessions.
3. A historical `NULL` visitor value is not counted as a unique visitor.
4. Mixed tracked and legacy sessions return correct counts and coverage.
5. One visitor attributed to Instagram and LINE counts once globally and once in each applicable channel.
6. `prelaunch_test` traffic is excluded from default reporting and included only with `include_test=1`.

Production analytics-only verification, using controlled `prelaunch_test` landing events and no customer/order/payment data:

| Check | Result |
| --- | --- |
| Default population changed | No |
| Include-test session delta | +4 |
| Include-test unique visitor delta | +2 |
| Include-test visitor-tracked session delta | +3 |
| Include-test legacy/untracked session delta | +1 |
| Instagram visitor delta | +1 |
| LINE visitor delta | +2 |
| Orders created | 0 |
| Checkout starts created | 0 |

The controlled production events confirmed deployed API acceptance, UUID validation, session/visitor aggregation, channel counting, coverage reporting, and test exclusion. No real visitor IDs are recorded in this report.

## Deployment and remaining limitation

The production analytics summary API exposed the new visitor fields after deployment. The browser automation surface was unavailable in this environment, so a normal-browser UI/storage inspection was not possible here. The production API validation and local automated tests passed; a human browser follow-up may confirm the visual CRM card layout and browser persistence if desired.

No launch blocker was found for the implemented privacy-safe visitor tracking. The existing session semantics remain long-lived localStorage semantics, so they should be reconsidered separately only if the owner wants conventional time-bounded sessions in the future.
