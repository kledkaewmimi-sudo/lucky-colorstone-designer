# CRM Shipped Mobile Hotfix

Status: LIVE

Date: 2026-10-25 (Asia/Bangkok)

## Root Cause

Carrier, tracking, and status each triggered an independent auto-save. Every
save called `loadDashboardData()`, rebuilding the order card. On mobile Safari,
leaving the tracking field could start a shipping-only save and disable the row
just as the Shipped selection occurred. The resulting shipping save correctly
reported `Payment Received` with LINE skipped, while the Shipped update was
lost.

## Fix

- Removed auto-save from carrier, custom-carrier, and tracking field changes.
- Added an explicit `Save Shipping` action that does not rebuild the card.
- Paid to Shipped now sends status, carrier, custom carrier, and tracking in one
  atomic request.
- Successful saves update only the affected card controls, shipping summary,
  status styling, and notification state in place.
- Failed saves retain entered shipping values and restore the last confirmed
  status instead of reloading the table.
- Messages now distinguish shipping-only saves, status updates, and LINE
  sent/skipped/failed/uncertain outcomes.
- LINE remains backend-controlled, after confirmed persistence, through the
  existing durable outbox. No notification architecture was rewritten.

Changed runtime file: `crm.js`.

Regression coverage and CRM test harness were updated; `data.js`, `server.js`,
the database schema, and Step 3 performance code were unchanged.

## Verification

- Order workflow, authorization, validation, persistence, and mocked LINE:
  18/18 PASS.
- Concurrent saves: one LINE attempt.
- Duplicate/retry behavior: no duplicate LINE.
- iPhone Safari WebKit, synthetic order:
  carrier and tracking edits made zero save requests; selecting Shipped made one
  atomic request; status, carrier, and tracking remained visible.
- Android Chromium: same behavior.
- Rapid tracking edits made no competing writes.
- Shipping-only save retained Shipped status and tracking without rebuilding
  the card.
- Refresh and fresh re-login retained the saved status and tracking.
- Artifact integrity: 39/39 PASS.
- Protected staged artifact comparison: 7/7 PASS.
- Production read-only smoke: 22/22 PASS.
- Production Landing to Step 4 smoke: 5/5 PASS.
- No real customer order was modified and no real LINE message was sent.

## Production

- Inspected Production backend: `dad934eef6a39aef5fd76b67ccbefcea4d30fab2`
- Backend deployment: `dep-dbequnbrjlhs738jh32g` (unchanged)
- Hotfix commit: `d04455f1415c7443bfbdf4e7fea94dc30b436be5`
- Vercel deployment: `dpl_6M8T8sRAE3zKhrSAKgw2m2NUen2x`
- Vercel status: READY and promoted
- Both custom domains resolve to the new Vercel deployment
- Live `crm.js` SHA-256:
  `226EEF2598F7FD45E1A3FFE6D0DD6153E7BA3E439551D04C62CB0B7E33108B85`
- Previous Vercel rollback: `dpl_Hkotao697pQUUc7DtEApnVWLWLfB`

## Remaining Risk

The mobile tests used Playwright WebKit and Chromium, not physical iPhone
hardware. Real-customer LINE delivery was intentionally not exercised.
