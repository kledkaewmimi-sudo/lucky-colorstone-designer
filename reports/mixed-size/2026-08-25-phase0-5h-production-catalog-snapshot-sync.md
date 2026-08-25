# Phase 0.5H — production catalog snapshot sync

Date: 2026-08-25

## Scope and safety

This was a one-time, read-only capture from the public production API:

- `GET https://customize.luckycolorstone.com/api/stones`
- `GET https://customize.luckycolorstone.com/api/charms`
- `GET https://customize.luckycolorstone.com/api/spacers`
- `GET https://customize.luckycolorstone.com/api/settings`

No production write endpoint, credential, workspace, branch, deployment, Supabase resource, Stripe resource, LINE resource, Meta integration, or analytics endpoint was used. The captured response was copied into UAT committed fixtures only.

## Fixture changes

- Replaced `data/stones.json` with the 32-record production response.
- Replaced `data/charms.json` with the 14-record production response.
- Added `data/spacers.json` with the eight-record production response.
- Replaced `data/settings.json` with the production settings response needed by Landing and Steps 1–3.
- Updated the fixture-only backend to load `data/spacers.json` and to require it at startup.

Fixture records retain production API fields as supplied, including names, image paths, price fields, availability, display order, manual-cost fields, spacer dimensions/effective length, category/layout metadata, and stock fields. No values were invented or normalized.

## Snapshot parity

The serialized JSON parsed from each committed UAT fixture was compared directly with the captured production response.

| Dataset | Production records | UAT records | Result |
| --- | ---: | ---: | --- |
| Stones | 32 | 32 | Exact JSON equality |
| Charms | 14 | 14 | Exact JSON equality |
| Spacers | 8 | 8 | Exact JSON equality |
| Settings | 5 top-level fields | 5 top-level fields | Exact JSON equality |

This gives zero stone-price, charm, spacer, and size/availability differences. Because every response field is retained, it also gives zero remaining differences in fields used by Landing and Steps 1–3.

## Local UAT backend regression

Started `server.js` with `APP_ENV=uat`, `UAT_BACKEND=true`, and a local port. The fixture API returned exactly the snapshot data:

- `GET /api/stones`: 200, 32 records, exact snapshot equality
- `GET /api/charms`: 200, 14 records, exact snapshot equality
- `GET /api/spacers`: 200, 8 records, exact snapshot equality
- `GET /api/settings`: 200, exact snapshot equality

Blocked-route checks returned 403 for:

- `POST /api/orders`
- `POST /api/analytics/event`
- `POST /api/stones/save`
- `POST /api/charms`
- `POST /api/spacers`
- `POST /api/settings/save`

Startup without `APP_ENV=uat` and `UAT_BACKEND=true` failed as intended. Existing UAT guard and frontend safety tests passed. `node --check server.js` and `git diff --check` passed.

## Isolation review

The deployed frontend configuration continues to route `/api/*` only to `https://lucky-colorstone-uat.onrender.com/api/$1`. The fixture-only backend refuses any Supabase credentials and accepts only the four catalog/settings GET routes. Existing frontend safety checks confirm production LINE, Meta, analytics writes, Stripe checkout, and order creation remain disabled in UAT; Step 4 remains blocked by the UAT flow.

No runtime production Supabase or production Render request was introduced. The only production contact in this phase was the completed read-only snapshot capture.

## Deployment and live validation

Commit `bef6ac2` was pushed only to `origin/uat`. After the UAT Render deployment settled, both UAT public surfaces returned the expected record counts: 32 stones, 14 charms, eight spacers, and five settings fields.

The live Vercel API responses at `https://lucky-colorstone-uat.vercel.app/api/*` were parsed and compared directly with the captured production snapshot. Stones, charms, spacers, and settings each matched exactly. Both direct Render and Vercel-routed mutation requests returned 403 for orders, analytics, and catalog/settings mutations.

The live landing document still contains the visible UAT banner. Its deployed JavaScript contains the explicit UAT Step 4 block and the UAT guards for LIFF, analytics, Meta, order creation, and checkout/payment. The live document/JavaScript contains no production Render host, production Supabase host, production LINE SDK, or Meta SDK reference.

Browser-driven clicking through Landing and Steps 1–3 could not be initialized because no browser was available in this execution environment. The affected live API data, deployed UAT safety guards, and Step 4 block were verified; no production service is in scope.
