# Direct Final Step 4 After Friendship Fix

## Root causes

Two independent paths caused the visible regression:

1. `liff.requestFriendship()` hid the existing transition overlay before its returned friendship result was checked and before `goToStep(4)` completed. In the external friendship-return route, a successful recheck was also discarded because `resumeLineOaFriendshipAfterReturn()` returned `false` after calling the recheck helper. Startup then treated the result as a failure and could restore Step 3.
2. The customer Step 4 static markup still included the legacy `Bracelet Design & LINE Receipt Export` card, its two preview boxes, and Download controls. CSS tried to reshape/hide it after it had already been mounted, allowing a visible first-frame flash.

## Fix

- The native friendship transition remains mounted through `liff.requestFriendship()`, the subsequent current friendship recheck, and the final Step 4 render.
- `recheckLineOaFriendshipAndResume()` now enters the existing callback hold before checking friendship, keeps it until the final permitted render finishes, and returns a real success/failure result.
- The external friendship-return path propagates that result rather than incorrectly reporting failure after a successful Step 4 resume.
- Cancellation, unavailable friendship state, and non-friend results release the hold back to the safe Step 3 state; they never enter Step 4.
- The static legacy export/download card is removed from customer Step 4 markup. A dedicated bracelet-preview mount remains for the normal preview only; no receipt preview or download control is mounted.
- Step 4 preview generation is awaited as part of `renderStep4()` rather than scheduled after the customer-visible render. A valid callback therefore releases the hold only after its normal Step 4 preview and summary are prepared.

## Preserved behavior

- Existing OA friendship transition copy and UI are unchanged.
- Step 4 and checkout remain protected by the centralized current LINE identity plus `friendFlag === true` guard.
- Canonical design restoration, catalog reconciliation, pricing, Beryl, Stripe, webhook, CRM, analytics, UTM, Meta Pixel, and buyer/admin LINE notifications are unchanged.
- Broad deferred login remains off; private QA is still required.

## Verification

- Full automated suite: 52 passed.
- Added regressions verify callback-hold ordering, successful friendship resume, removal of legacy export/download markup, dedicated preview mounting, and synchronous preview preparation before hold release.
- `node --check app.js` and `node --check server.js`: passed.
- `git diff --check`: passed.

Real LIFF/browser timing cannot be verified from this environment. Owner real-device retest is required after deployment.
