# Phase 2.36 CRM Shipped Status and LINE Notification Hotfix

Status: LIVE

Release date: 2026-10-25 (Asia/Bangkok)

Production domains:

- https://crm.luckycolorstone.com
- https://customize.luckycolorstone.com

## 1. Confirmed Root Cause

The CRM confirmed a successful order mutation by calling the paginated
`/api/crm/orders` endpoint and then treating the response as an array.
The endpoint actually returns `{ page, limit, total, totalPages, orders }`.
`getSharedCrmOrders()` therefore replaced its local order collection with an
empty array, after which `updateOrderStatus()` could not locate the saved
order and always displayed:

> The server did not confirm the saved order status and tracking number.

The backend had related correctness defects:

- A missing order returned HTTP 200.
- The success response did not include the authoritative saved order.
- The save was not read back and checked.
- LINE was attempted before the Shipped state was durably persisted.
- There was no durable per-order delivery claim, so retries could duplicate a
  customer message.
- The paginated CRM projection omitted the newer carrier and tracking fields,
  so a successful save could still appear blank after refresh.

Production data was inspected without exposing customer details. At audit time
there were 170 orders, including 107 paid payloads: 101 Shipped and 6 Payment
Received.

## 2. Release Candidate

Branch:

`release/phase2-36-crm-shipped-line-hotfix-20261025`

Verified Production baseline:

`003452f6dd403c9941d46b19b283aa84aeddbce2`

The candidate is based directly on the verified Production baseline. It does
not deploy or modify remote `main` or `uat`.

Final release SHA:

`dad934eef6a39aef5fd76b67ccbefcea4d30fab2`

## 3. Files Changed

- `server.js`
  - Validates order ID, status transition, carrier, custom carrier, and
    tracking number.
  - Returns 400, 404, 409, or 500 as appropriate.
  - Persists before notification.
  - Performs a targeted authoritative readback and returns the confirmed order.
  - Adds durable LINE delivery claim and result states.
- `order-workflow.js`
  - Shared transition validation and persisted-order comparison helpers.
- `data.js`
  - Removes paginated-list confirmation from `updateOrderStatus()`.
  - Uses the confirmed order returned by the mutation endpoint.
  - Correctly parses the paginated `getSharedCrmOrders()` response.
- `crm.js`
  - Displays durable LINE delivery state.
  - Reports notification failure independently from order persistence.
- `crm-order-read-model.js`
  - Carries status, carrier, custom carrier, tracking number, and tracking URL
    into the authenticated paginated order cards.
- `supabase/migrations/20261025035000_order_notification_outbox.sql`
  - Adds the backend-only notification outbox and its constraints.
- `tests/order-workflow.test.cjs`
- `tests/order-shipped-line-hotfix.test.mjs`

No Step 3 performance code was modified.

## 4. Supabase Migration

Production project:

`fjzchgjqwxfndkplztxq`

Migration:

`order_notification_outbox`

Production migration version:

`20261025072142`

The migration is additive. It does not alter or drop existing customer tables.

Verified in Production:

- RLS is enabled.
- No anonymous or authenticated table privileges exist.
- `service_role` has select, insert, update, and delete.
- One outbox row per `(order_id, notification_type)` is enforced.
- The outbox row has a cascading foreign key to its order.
- Order ID and notification state/type constraints are present.
- No paid Supabase branch or project was created.

An isolated PostgreSQL test also verified:

- Anonymous insert rejection.
- Duplicate and invalid-type rejection.
- Missing-order foreign-key rejection.
- One-winner concurrent delivery claim.
- Migration reapplication is idempotent.

Using the project publishable key, direct anonymous Data API reads and writes to
`order_notification_outbox` were rejected with HTTP 401.

A disposable Production database lifecycle check also passed:

1. Synthetic paid order inserted.
2. Pending outbox row inserted.
3. Duplicate insert rejected by the unique constraint.
4. Atomic pending-to-sending claim returned one row.
5. Repeating the pending claim returned zero rows.
6. Sending-to-sent transition succeeded.
7. Deleting the synthetic order cascaded to its outbox row.
8. Final verification returned zero order rows and zero outbox rows.

No customer LINE identity was used and no real LINE message was sent.
The Production order total remained 170 (107 paid) after cleanup, and the
outbox table contains zero rows.

## 5. Before and After Behavior

Before:

1. CRM submits a valid Paid to Shipped update.
2. Backend may save the order.
3. Backend attempts LINE before persistence.
4. Backend returns only an ID and requested status.
5. CRM fetches the paginated list and discards its `orders` array.
6. CRM reports that the server did not confirm the save.
7. Refresh can make carrier/tracking appear missing.
8. A retry can send a second LINE message.

After:

1. Backend verifies the target order exists.
2. Backend validates the transition and shipping details.
3. Backend persists status, carrier, custom carrier, and tracking.
4. Backend reads the authoritative saved row and verifies every requested field.
5. Backend returns that confirmed order.
6. Only then does the backend atomically claim one durable notification row and
   attempt LINE once.
7. CRM uses the confirmed response and refreshes the real paginated card data.

## 6. Automated Test Results

Focused backend suite: 17/17 PASS.

Verified cases:

- Paid to Shipped.
- Persistence strictly before LINE.
- Carrier and tracking persistence.
- Custom carrier persistence.
- Missing carrier and tracking rejection.
- Invalid ID, unknown status, and missing order.
- Backward/invalid transition rejection.
- Unauthorized CRM update rejection.
- Order persistence failure returns 5xx and sends no LINE.
- Duplicate and concurrent saves produce one notification attempt.
- LINE success.
- Definitive LINE rejection, with safe text fallback only after HTTP 400.
- LINE timeout becomes uncertain and is never automatically resent.
- Explicit Shipped retry after a definitive failure.
- No LINE recipient produces a durable `skipped` state.
- Other order statuses remain non-notifying.
- CRM list projection retains carrier and tracking.
- CRM overview omits carrier and tracking.

Browser CRM test: PASS on simulated iPhone WebKit and Android Chromium.

- Paid to Shipped completed.
- Carrier and tracking persisted.
- Notification state appeared.
- Refresh retained the confirmed state.
- Fresh re-login retained the confirmed state.
- No post-mutation unfiltered paginated confirmation request occurred.
- No page or console errors.

Checkout geometry browser contract: 2/2 PASS.

Birthday consent browser suite: 9/9 PASS.

Focused order, LINE, Birthday, and checkout contract run: 56/60 PASS. The four
failures are stale source-string expectations that also fail on the untouched
Production baseline. They are not behavioral regressions from this hotfix.

The canonical `qa:predeploy` command was run. Its doctor stage passed 24/24.
Its suite stage fails on the same known baseline source drift plus an
unavailable historical backend test-tree path. The run is recorded as a
repository QA maintenance defect, not a hotfix PASS.

The build artifact gate passed 39/39 with aggregate SHA-256
`a952cc2352613893ae4219ca3755e5a29741618d621d95ca4837db552630951d`.
The protected staged deployment matched the local artifact on all seven checked
routes.

Production read-only smoke passed 22/22. The live Landing to Step 4 funnel
passed at 390 px with no page, console, response, or write errors.

The automated unauthenticated LINE redirect probe did not observe a LINE
navigation after the Next tap. It reported no page, console, or response
errors. A separate real Chrome check reached Step 2 using the browser's existing
LINE identity. The Production `app.js` hash is byte-identical to the pre-release
deployment, so this is not evidence of a frontend regression, but a fresh OAuth
callback was not completed in this release window.

## 7. Production Deployment

Render deployment ID:

`dep-dbequnbrjlhs738jh32g`

Render status: LIVE

Render source commit:

`dad934eef6a39aef5fd76b67ccbefcea4d30fab2`

Render build and deploy events both ended in success. No `server_failed` event
was recorded for the release.

Vercel deployment ID:

`dpl_Hkotao697pQUUc7DtEApnVWLWLfB`

Vercel status: READY and promoted to both custom domains

Vercel source commit:

`dad934eef6a39aef5fd76b67ccbefcea4d30fab2`

The repository's tracked worktree is clean. Vercel reported `gitDirty=1` because
local `node_modules` and Vercel build metadata exist outside the tracked source;
the artifact integrity and staged artifact checks prove the deployed bytes match
the tracked release source.

During deployment, Render's short-SHA picker initially resolved `92235ee` to a
different colliding commit. That build (`dep-dbequ21srm7s73d2dspg`) was
cancelled during clone, never became live, and was followed by the unique final
SHA deployment above.


Rollback references:

- Render live before release: `dep-dbenhkjncjis73eqlms0` / `003452f`
- Vercel live before release: `dpl_4HNbhF973i6fJAp5pw7ayvP7WZX7` / `003452f`

Pre-release customer assets:

- `app.js` SHA-256:
  `1BDC64EFFFE822853337C9EF76B844D2FD6CB72C50878D554797596687EA7A8B`
- `data.js` SHA-256:
  `444BC770240CF04AA29513084DCB46229F62897739CA18C11BADE2C7045EA179`
- `crm.js` SHA-256:
  `F3A410DA196E1B88621D76A4E5FC7DDBDC2A0FB404948B92EA606B45D2415F68`

Post-release customer assets:

- `app.js` SHA-256:
  `1BDC64EFFFE822853337C9EF76B844D2FD6CB72C50878D554797596687EA7A8B`
  (unchanged)
- `data.js` SHA-256:
  `DF3742E4BECAC91A225012A75B6B710B7A0FEA63A623C2325C32C890D4F29110`
- `crm.js` SHA-256:
  `E8AFC222E08712EB87A43FA80E4B9A5E7E0A4916FFE5A870F6DA8573E78DABC8`

Both `customize.luckycolorstone.com` and `crm.luckycolorstone.com` resolve to
the promoted Vercel deployment.

## 8. Production Data Test

Two disposable synthetic orders were created and deleted. Neither had a real
LINE recipient, and no customer order was changed.

The first synthetic order was intended for an authenticated Production API
write. The Production CRM's visible fallback credentials were rejected, so the
authenticated mutation was not forced or bypassed. The unmodified order was
confirmed still at `Payment Received` with zero outbox rows, then deleted.

The second synthetic order exercised the Production outbox constraints and
state lifecycle directly through Supabase. Duplicate insert, one-winner claim,
sent transition, cascading deletion, and final zero-row verification all
passed. This validates the Production database dependency independently, while
the full authenticated API/LINE path is covered by the 17/17 local integration
suite.

## 9. Remaining Risks

- A LINE timeout or 5xx is recorded as `uncertain` and is intentionally not
  retried automatically. An operator must reconcile that order before making a
  deliberate resend decision.
- An authenticated Production CRM write could not be executed because no valid
  owner/admin session was available and the visible fallback credentials are
  not valid. A valid CRM session is needed for the one remaining live
  mutation probe.
- Canonical QA contains stale source-snapshot tests and one missing historical
  backend fixture. They require a separate QA-maintenance change.
- Production support for real customer LINE delivery was not exercised because
  that would send a real message. Mocked LINE success, rejection, timeout,
  fallback, concurrency, and idempotency were exercised.
- Real iPhone hardware was not available. iPhone Safari behavior was simulated
  with Playwright WebKit; Android was simulated with Chromium.
- A fresh real-customer LINE OAuth callback was not completed. The automated
  unauthenticated redirect probe failed to observe navigation, while a real
  Chrome session with existing LINE identity reached Step 2. The unchanged
  `app.js` hash and passing progressive startup/redirect-intent browser suites
  limit this to an external authentication-environment verification gap.

## 10. Final Status

LIVE. Render and Vercel are serving the same exact release SHA, both custom
domains resolve correctly, the additive migration is applied, the outbox is
backend-only, and Production read-only/customer-flow smoke passes.

The authenticated Production CRM write probe remains an explicit verification
gap because no valid owner/admin session was available. It does not indicate a
deployment failure and must not be replaced with a real customer order test.
