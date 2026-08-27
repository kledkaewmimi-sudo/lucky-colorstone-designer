# UAT LINE login callback no-Landing-flash polish

Date: 2026-08-27  
Scope: UAT frontend only. No backend, catalog, Supabase, Stripe, OA, Render, or production behavior was changed.

## Owner observation

After a first-time visitor tapped Start and completed LINE authentication, the static Landing screen could briefly appear again before Step 1. This made the flow feel like Start had to be pressed twice.

## Root cause

The document-head first-paint guard only held UI for deferred-design and OA-resume callbacks. It did not recognize the initial identity return marker, either directly as `line_auth=identity` or nested inside `liff.state`. The app recognized that marker only after `DOMContentLoaded` and an awaited deferred-QA startup check. During that interval, the static Landing markup could paint before `setCallbackBootstrapHold(...)` ran.

## Render and state ordering

The head script now classifies direct and LIFF-wrapped initial identity callbacks before the body can paint and adds `callback-bootstrap-hold`. The startup handler immediately reconfirms that hold before any async initialization. LIFF initialization/profile synchronization runs while only the existing neutral bootstrap overlay is visible. On verified canonical identity, the code sets `State.currentStep = 1`, sets and persists `State.landingDismissed = true`, then performs the single final render and releases the hold.

## Fix

Only `index.html` and `app.js` changed:

- The existing minimal callback overlay is used; no page or modal was added.
- Both `?line_auth=identity` and `?liff.state=%3Fline_auth%3Didentity` are first-paint guarded.
- A completely fresh visit remains a normal Landing visit, including when a LINE session happens to exist.
- Landing Start still establishes identity before Step 1. A pre-existing canonical identity/valid LIFF session reaches Step 1 without `liff.login()`.
- Initial identity authentication does not create a bracelet/design handoff.

## Failure behavior

If LIFF/profile synchronization fails, no identity is accepted and Step 1 remains blocked. The existing safe LINE retry/error path and F05/F05E diagnostics remain intact; successful callbacks alone suppress Landing during bootstrap.

## Regression safety

No Step 2, Step 3, mixed-size, renderer, catalog, Supabase, OA friendship, durable Step 3 handoff, `friendFlag`, or Step 4 authorization code was changed. Existing OA and deferred-design callback coverage remains passing.

## Tests

34 focused tests passed:

- Initial callback classification, existing-session no-redundant-login, first-time login/no-design-handoff, fresh-Landing behavior, and callback Step 1 state.
- Callback bootstrap and deferred-design recovery.
- LINE redirect/handoff behavior.
- OA friendship/Step 4 gate behavior.

`node --check app.js` and `git diff --check` passed. Existing Node module-type warnings were emitted; no test failed.

## UAT deployment and owner retest

This frontend-only change requires a UAT Vercel deployment from `uat`; Render is not required. Automated/local tests cannot establish real-device LIFF callback rendering, so the owner must retest:

1. First-time: Landing → Start once → LINE login → neutral callback transition → Step 1, with no Landing flash or second login.
2. Existing session: Landing → Start → Step 1, with no redundant login/callback loop.

## Production isolation and final status

No production system changed. Status: ready for owner real-device retest after the UAT frontend deployment is confirmed.
