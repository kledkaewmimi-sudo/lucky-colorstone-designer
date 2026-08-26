# UAT Auth Callback Step 1 + Step 2 Text Fix

## Real Device Evidence

Owner UAT testing confirmed that Landing Start now opens LINE authentication and Steps 1–3 are usable. For a first-time LINE login, however, the callback returned to Landing and required a second Start press before Step 1 opened. The owner also requested confirmation of the approved Mixed card text.

## Callback Root Cause

Startup classified an initial identity callback only when `line_auth=identity` appeared as a top-level query parameter. LIFF may instead return the original redirect query in its `liff.state` parameter, for example `liff.state=?line_auth=identity`.

When the marker was wrapped in `liff.state`, the existing classifier treated the successful callback as a true fresh public entry. The verified identity could still exist, but no initial-auth resume path set `State.landingDismissed` and Step 1, leaving Landing visible until the owner pressed Start again.

## Corrected Resume Behavior

`isInitialLineIdentityCallback()` now recognizes both supported marker forms before fresh-entry classification:

- direct `?line_auth=identity`
- LIFF-wrapped `?liff.state=%3Fline_auth%3Didentity`

On either recognized callback, startup clears the design state, initializes LIFF, verifies and synchronizes the canonical LINE identity, then sets `State.currentStep = 1` and `State.landingDismissed = true`. The callback marker is cleaned only after identity is available. No bracelet is restored because initial identity authentication begins on Landing before a design exists.

## Fresh Entry Protection

A direct visit without either initial-auth callback marker remains a true fresh entry and renders Landing, including when a previous LINE identity exists. A callback that cannot establish a valid canonical identity fails closed with the existing sanitized diagnostic and does not enter Step 1.

## Step 2 Text Correction

The current Mixed card already contains the exact approved UTF-8 text:

`สนก มมต`

No Step 2 markup or CSS was changed. The existing UAT regression test explicitly validates its Unicode code points, Mixed/10mm/6mm/4mm order, no default selection, right wrist imagery, and the accepted Mixed treatment.

## Step 3 Preservation

No Step 3 code or styles were changed. The accepted sticky preview behavior remains covered by the focused UAT regression test: one full-size sticky preview, `top: 0`, no debug overlay, no compact renderer, and no sticky-triggered design reset.

## Security

`liff.state` is used only as a callback-resume marker. It does not authorize Step 1 or Step 4 by itself. Step 1 requires successful LIFF profile synchronization, and the existing OA friendship / `friendFlag` gate remains required before Step 4.

## Tests

Passed focused verification:

- `node --check app.js`
- `node --check line-identity-before-design.js`
- `node --test tests/line-identity-before-design.test.mjs tests/line-callback-bootstrap.test.mjs tests/line-oa-friendship-gate.test.mjs tests/guest-design-state.test.mjs tests/mixed-size-ux.test.mjs tests/mixed-size-state.test.mjs tests/bracelet-geometry.test.mjs`
- `node tests/uat-frontend-safety.test.cjs`
- `node --test tests/uat-line-auth-enabled.test.mjs tests/liff-environment-config.test.mjs`
- `git diff --check`

Result: 75 passing, 0 failing, plus the UAT frontend safety contract passed.

## UAT Deployment

This change is deployed only to the `uat` branch and `lucky-colorstone-uat` Vercel project at:

`https://uat.customize.luckycolorstone.com/`

## Owner Retest

On a first-time UAT LINE session:

1. Landing → Start.
2. Complete LINE login.
3. Confirm the callback opens Step 1 automatically with no second Start press.
4. Continue to Step 2 and confirm `สนก มมต`.
5. Continue to Step 3 and confirm the approved sticky preview remains intact.

## Production Isolation

Production main, production Vercel, production Render, production LIFF, Stripe, and production domains were not changed.
