# Current UAT runtime parity promotion

## Owner Requirement

Production must use the current owner-approved UAT customer runtime, with only production integration values substituted.

## Current UAT Reference SHA

`0edfee171083628497c252a38fb435d3d9b3bc2a` matched local `uat`, `origin/uat`, and the deployed UAT static runtime for `index.html`, `index.css`, `app.js`, `bracelet-geometry.js`, and `data.js`.

## Previous Partial-Promotion Root Cause

The prior production release selectively carried completion and catalog work, leaving customer-facing UAT runtime modules and CSS behind. That created divergent Step 2/3/4 behavior.

## Runtime Parity Manifest

Exact UAT customer-runtime content was promoted for `bracelet-geometry.js`, `data.js`, `guest-design-state.js`, `mixed-order-model.js`, `mixed-size-state.js`, `mixed-size-transition-trim.js`, `deferred-step3-auth-boundary.js`, `line-auth-handoff.js`, `line-callback-bootstrap.js`, `line-redirect-restore.js`, `initial-line-auth.js`, `liff-environment-config.js`, `line-identity-before-design.js`, and `index.css`. Line-ending normalization is the only byte-level difference for those files.

`index.html`, `app.js`, and `api/liff-config.js` are documented environment variants: production Meta Pixel, production LIFF identity/configuration, production transaction and analytics mode, and no UAT banner/debug query activation. No customer-flow difference is intended.

## Step1-4 Parity

The UAT `app.js` and renderer/geometry state contract are the production candidate source, including Step 2 card order/surfaces, Step 3 sticky preview and retained-slot renderer, and Step 4 component preparation.

## Step4 Charm Investigation

The candidate takes UAT's selected-component and Step 4 preview wiring unchanged. Browser-level visual reproduction could not run in this environment because no controllable browser is available; post-deploy live/device validation remains required.

## Delete Dotted Ring Investigation

The candidate uses UAT's retained-empty-slot semantics and current renderer input contract. Empty slots contribute zero physical length and replacement footprints use the new component size.

## Catalog Full Parity

Live public catalog comparison found exact UAT/production records: 37 stones, 14 charms, and 8 spacers; no UAT-only or QA stone is present. Production Supabase remains the production catalog source, so UAT fallback JSON was not copied.

## Environment-Only Exceptions

Production retains its LIFF ID, backend/Supabase/Stripe integration, Meta Pixel, domain, and production analytics/order behavior. UAT diagnostics and QA-only backend/data artifacts are excluded.

## Completion Preservation

Focused tests verify fixed pre-Mixed discrete completion and Mixed manufacturing-target-minus-five through target completion, including the 16cm 17x10mm case.

## Tests

The current UAT focused suite passed 60 tests: renderer restoration, Step 2/3 contract, fixed/mixed completion, retained slots, pricing, LINE identity, and OA gate. Candidate syntax checks and direct candidate geometry parity checks passed. `git diff --check` passed.

## Production Deployment

Production commit `fc228ce798a3afcdab10b3a4dc277c652974b3cc` was pushed normally to `origin/main`. Vercel deployment `lucky-colorstone-designer-mcp6hp8ec-lucky-colorstone.vercel.app` is Ready and aliases `https://customize.luckycolorstone.com/`.

## Live UAT vs Production Verification

The live UAT and production `index.css` SHA-256 values match exactly: `0afdd47c2bb1f342374619ee1d41ba59d12c38cba1646f3dc96c3d46f4bbb479`. Their live `bracelet-geometry.js` SHA-256 values also match exactly: `33756b296aa1eb627da86235d67b5f4606b83fa2cfe314ec30348698ab5fde63`.

## Rollback SHA

`65ec61d8ddb04d9dd5e097b4bf1a81cea322cba6`

## Owner Retest

Required after production deployment; this report does not claim device retest completion.
