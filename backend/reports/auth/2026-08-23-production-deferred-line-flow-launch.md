# Production deferred LINE flow launch

## Rollout

The only production rollout change is `DEFER_LINE_LOGIN_TO_STEP4` in
`line-redirect-restore.js`, changed from `false` to `true`. The main customer
URL remains `https://customize.luckycolorstone.com/`; no route, query parameter,
or UTM handling changed.

With the flag enabled, an unauthenticated mobile customer can complete the
designer through Step 3 before entering the existing LINE/LIFF and Lucky
Colorstone OA friendship flow. A current LINE identity and a current verified
`friendFlag === true` are still required by the existing centralized Step 4 and
checkout guards. Existing friends retain the direct Step 3-to-Step 4 path.

## Unchanged systems

This rollout does not modify `app.js`, `server.js`, Stripe, webhook, CRM/order
semantics, pricing, renderer/ResolvedLayout, catalog/Beryl, buyer or admin LINE
notifications, analytics, UTM attribution, or Meta Pixel definitions.

## Verification

- Full Node suite: 52 passing tests.
- The tests cover the production initial-login resolver, deferred Step 3
  boundary, callback-before-reset restoration, snapshot/handoff integrity,
  centralized OA friendship protection, checkout protection, Beryl, and pricing.
- Syntax and diff checks are run before commit and deployment verification.
- The owner completed successful real-device E2E testing before this rollout:
  fresh entry, guest designer steps, OA friendship, direct Step 4 resume, Stripe
  payment, CRM order, and buyer/admin LINE notifications.

## Immediate rollback

Set `DEFER_LINE_LOGIN_TO_STEP4` back to `false` in
`line-redirect-restore.js`, commit and push to `main`, then wait for the normal
Vercel production deployment. No database, payment, or analytics rollback is
required. This immediately restores the legacy mobile LINE-before-Step-1 flow.
