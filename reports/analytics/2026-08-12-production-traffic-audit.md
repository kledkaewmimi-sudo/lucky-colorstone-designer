# Production Traffic & Unique Visitor Audit

| Field | Value |
| --- | --- |
| Date | 2026-08-12 |
| Environment | Production |
| Project | Lucky Colorstone |
| Audit type | Analytics / Traffic Attribution / Unique Visitor Identity |
| Status | Completed — follow-up migration required |
| Related commit | `9d454ea` |
| Manual action pending | `supabase/add_analytics_visitor_id.sql` |

## Scope and method

This was a read-only audit of the current production analytics summary API and the analytics implementation. No production analytics, orders, payments, Stripe, LINE, or business data was changed.

The default report excludes sessions where `first_campaign = prelaunch_test` (case-insensitive), unless `include_test=1` is explicitly used. Current production responses were read on 2026-08-12 in the Bangkok reporting timezone. No customer PII, raw IP addresses, service-role keys, payment secrets, or raw analytics exports are included in this report.

## A–Z requested answers

### A. Current reportable sessions

- Default 7-day report: **30** reportable sessions.
- 30-day/all available report: **80** reportable sessions.
- With tests included: **82** all-period sessions. The current rule excluded **2** `prelaunch_test` sessions.

### B. Current unique visitors

**Not reliably available.** The system has no separate `visitor_id` field or first-party visitor identifier. It must not report a historical unique-visitor count.

### C. Can the current system reliably calculate unique visitors?

**PARTIAL.** A persistent analytics `session_id` can approximate a browser-profile identifier, but it is not a true browsing-session identifier and cannot separate repeated sessions by the same browser/profile. Therefore the system cannot reliably answer “39 sessions came from how many people/devices?”

### D–J. Current traffic source analysis

#### Current reportable traffic: 30-day/all available population

| Owner group | Sessions | Share of 80 | Checkout started | Paid orders | CVR | Revenue |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Others | 65 | 81.25% | 0 | 0 | 0% | ฿0 |
| LINE | 6 | 7.50% | 0 | 2 | 33.33% | ฿544 |
| Instagram | 5 | 6.25% | 0 | 0 | 0% | ฿0 |
| Facebook | 4 | 5.00% | 0 | 0 | 0% | ฿0 |

#### Original attribution breakdown

| Owner group | Source | Medium | Campaign | Sessions | Paid orders | Revenue |
| --- | --- | --- | --- | ---: | ---: | ---: |
| Others | `direct/unknown` | — | — | 59 | 0 | ฿0 |
| Others | `google` | — | — | 5 | 0 | ฿0 |
| Others | `manual` | `debug` | `test` | 1 | 0 | ฿0 |
| LINE | `line` | — | — | 5 | 2 | ฿544 |
| LINE | `line` | `oa` | `test_launch` | 1 | 0 | ฿0 |
| Instagram | `instagram` | — | — | 5 | 0 | ฿0 |
| Facebook | `facebook` | — | — | 4 | 0 | ฿0 |

#### D. Current Instagram sessions

**5** reportable sessions (6.25% of all available reportable sessions), all reported as `instagram / — / —`. No checkout starts, paid orders, or revenue.

#### E. Why were they identified as Instagram?

The client’s `getAnalyticsPlatformGuess()` searches `utm_source`, `utm_medium`, `document.referrer`, and `navigator.userAgent` for `instagram`; it then persists that classification as the first source when no `utm_source` is present.

For the five current reportable Instagram rows, the live read-only summary exposes `source/medium/campaign` but deliberately does **not** expose raw referrers or an attribution-mechanism field. It cannot prove, row by row, whether the matching evidence was an explicit source-only UTM, HTTP/document referrer, or browser user-agent. No stored-previous-attribution mechanism creates a separate session classification; first-touch attribution is preserved only after the initial classification.

Therefore the confirmed mechanism is **URL/referrer/user-agent platform-string inference implemented by the client**; the exact per-row sub-mechanism is **not determinable from the current production summary API**. It would be incorrect to claim that all five are UTM or all five are referrer traffic.

#### F. Current LINE sessions

**6** reportable sessions (7.50%):

- `line / — / —`: 5 sessions, 2 paid orders, ฿544 revenue.
- `line / oa / test_launch`: 1 session, no paid order.

#### G. Why were they identified as LINE?

The client classifies LINE when `utm_source`, `utm_medium`, `document.referrer`, or `navigator.userAgent` contains `line`, and the server uses `utm_source` first or the resulting `platform_guess` when `utm_source` is absent.

One current row has explicit UTM evidence: medium `oa`, campaign `test_launch` (and source `line`). The other five have no recorded medium or campaign in the summary; the summary cannot distinguish whether they were classified by source-only UTM, referrer, or user-agent matching. No exact per-row mechanism must be inferred beyond that implementation.

#### H. Current Facebook sessions

**4** reportable sessions (5.00%), all reported as `facebook / — / —`. No checkout starts, paid orders, or revenue.

#### I. Why were they identified as Facebook?

The client classifies Facebook when the joined attribution evidence contains `facebook`, `fb_iab`, or `fban`; those values can come from UTM source/medium, document referrer, or the Facebook in-app browser user agent. The server then stores `utm_source` or the resulting platform guess as the first source.

The current summary does not include raw referrer/user-agent or an attribution-mechanism field, so the four current reportable rows cannot be divided accurately among explicit UTM, referrer, and user-agent cases. The confirmed classification route is the implemented platform-string inference, not an unsupported assertion that the owner created Facebook UTM links.

#### J. Current Others sessions and breakdown

**65** reportable sessions (81.25%):

- Direct / Unknown: 59
- Google: 5
- Other / Unknown: 1 (`manual / debug / test`)

### K–M. Checkout, orders, and revenue

| Metric | Default 7d | 30d / all available |
| --- | ---: | ---: |
| Checkout started | 0 | 0 |
| Paid orders | 2 | 2 |
| Paid revenue | ฿544 | ฿544 |
| CVR | 6.67% | 2.50% |
| AOV | ฿272 | ฿272 |
| Sessions today | 1 | — |

Paid conversion and revenue use webhook-linked converted sessions as the authoritative source.

### N. Current funnel by stage

The following is the current 7-day funnel, which is also the event-count pattern returned for the all/30-day report.

| Stage | Sessions | Drop from previous | Conversion from landing |
| --- | ---: | ---: | ---: |
| Landing | 12 | — | 100% |
| Start Designer | 7 | 41.7% | 58.3% |
| Step 1 | 4 | 42.9% | 33.3% |
| Step 2 | 4 | 0% | 33.3% |
| Step 3 | 4 | 0% | 33.3% |
| Step 4 | 2 | 50.0% | 16.7% |
| Checkout Started | 0 | 100.0% | 0% |
| Paid | 2 | — | 16.7% |

### O. Largest current funnel drop-off

The raw largest reported drop is Step 4 → Checkout Started (100%). However, it is **not a reliable behavioural conclusion**, because there are two paid orders while `checkout_started` is zero. That indicates incomplete checkout-start instrumentation/coverage. The largest coherent observed drop is Start Designer → Step 1: 3 of 7 sessions (42.9%). All funnel conclusions are subject to small-sample noise.

### P. How `session_id` is generated and persisted

Implementation details:

- Function: `createAnalyticsSessionId()` in `app.js`.
- Generation: `window.crypto.randomUUID()` when available; fallback `lcs_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`.
- Storage: browser `localStorage`, key `lucky_analytics_session_id`.
- Start-time storage: `lucky_analytics_started_at` in `localStorage`.
- Attribution storage: first source in `lucky_analytics_first_source`; latest source in `lucky_analytics_latest_source`.
- Database table: `public.analytics_sessions`, column `session_id text not null unique`.
- Event tables: `public.analytics_events.session_id` and `public.analytics_errors.session_id`.

There is no expiry or inactivity timeout. Analytics emits heartbeat events every 60 seconds, but does not use them to expire/restart the stored ID.

### Q. Is `visitor_id` currently present?

**No.** The production `analytics_sessions` schema inspected for this audit has no `visitor_id` column, and client/server analytics payloads do not send one.

### R. Is raw IP currently stored for analytics?

**No.** The analytics schema stores optional `line_user_id`, attribution fields, timestamps, current step, order conversion fields, and user-agent. It does not store raw IP addresses for analytics.

### S. Recommended unique visitor mechanism

Use a privacy-safe, first-party, random anonymous `visitor_id`:

- Generate once per browser/profile using `crypto.randomUUID()` where supported.
- Persist using the existing first-party `localStorage` mechanism.
- Keep it distinct from an individual `session_id`.
- Count visitors with `COUNT(DISTINCT visitor_id)` and sessions with `COUNT(DISTINCT session_id)`.
- Do not derive it from name, email, phone, LINE identity, IP address, canvas/browser fingerprinting, or cross-device matching.

Conceptually:

```text
visitor_id
  session A
  session B
  session C
```

The recommended scope is one anonymous browser/device profile. Incognito/private contexts and cleared storage may create a new visitor ID; this is acceptable and must be documented. Historical rows with no visitor ID remain valid sessions but cannot be used to reconstruct unique visitors.

### T–V. Changes, files, and manual SQL action

No customer-facing analytics code, database, production business data, orders, Stripe, payment/webhook, LINE, pricing, inventory, renderer, Beryl, or CRM flow was changed during the audit.

One backward-compatible manual migration file was added for owner review:

- `supabase/add_analytics_visitor_id.sql`

It adds nullable `public.analytics_sessions.visitor_id`, adds a partial index for non-null visitor IDs, and documents the field’s anonymous first-party purpose. It intentionally does **not** backfill historical rows.

Manual action is required before any future application release writes `visitor_id`: review and execute `supabase/add_analytics_visitor_id.sql` in the correct production Supabase SQL Editor. Do not execute it automatically as part of this audit.

### W. Commit hash

`9d454ea` — `Add anonymous analytics visitor migration`.

### X. Deployment status

The migration file was committed and pushed to `origin/main`. No application tracking deployment was made, because the required production schema migration is manual and had not been executed/verified.

### Y. Privacy and security conclusions

The recommended identity is anonymous, random, first-party, and browser-profile-scoped. It must not collect or derive identity from PII, IP, fingerprinting, or cross-device resolution.

IP is not a suitable primary unique-person identifier because mobile networks rotate IPs, multiple people share public IPs, Wi-Fi/4G/VPN changes alter it, and proxies/CDNs can affect observed addresses. Storing raw IP would add privacy risk without providing reliable person-level identity.

### Z. Owner summary

Current reported traffic is mostly Direct/Unknown: 59 of 80 reportable sessions (73.75%). This means attribution quality is not yet sufficient for confident owner-channel decisions. LINE generated the only two paid orders (฿544 total), but the sample is very small. Instagram and Facebook sessions can appear even without owner-created UTM links because the client inspects available UTM values, referrer, and in-app-browser user-agent strings.

Consistent UTM adoption will materially improve campaign reporting. The current architecture should not replace Sessions with Visitors: after the recommended implementation, both should be reported separately. Channel-level unique visitors must not be estimated until `visitor_id` exists.

## Limitations and follow-up required

1. The current production summary API does not expose raw referrers/user agents or a separate attribution-mechanism field. It cannot support an exact current count of Instagram/Facebook/LINE sessions by UTM vs referrer vs user-agent. Add an explicitly privacy-safe mechanism field only in a future scoped tracking improvement if that reporting is required.
2. Existing `session_id` values persist indefinitely in `localStorage`; refresh and close/reopen retain the same ID. They do not model conventional browser sessions.
3. LINE WebView has no special session logic; it uses that WebView’s `localStorage`, which may persist or be isolated/cleared by the app/profile.
4. No reliable historical unique-visitor metric can be fabricated. Clearly distinguish reporting before and after visitor tracking begins.
5. Execute the reviewed Supabase migration before implementing client/server writes of `visitor_id`; then run focused same-browser/new-session, refresh, private-context, attribution, and deployment verification.
