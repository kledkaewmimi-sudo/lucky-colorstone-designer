# Owner-Approved UAT Promotion

## Owner Approval

Owner real-device UAT QA passed. This promotion carries the approved bracelet completion and retained-slot runtime state only.

## Approved UAT SHA

- Approved UAT SHA: `0edfee171083628497c252a38fb435d3d9b3bc2a`
- `origin/uat`: identical.
- The public UAT `bracelet-geometry.js` SHA-256 fingerprint matched that exact local runtime source before promotion.

## Production Base SHA

- Remote production base: `a8478f7929cf68d955b6b1c76f1044ac688018c7`.
- Local production `main` was not used because it had unrelated asset/report changes and did not equal the remote production tip.

## Promotion Strategy

An isolated detached candidate was created from the remote production base. The production branch already contained the accepted dotted slot renderer and retained-slot model. The promotion ports only the UAT completion/placement authority and its Step 3/Step 4 wiring, preserving production-specific LINE, LIFF, OA, handoff, analytics, backend, catalog, Stripe, Supabase, and Vercel configuration.

## Promoted Commits / Files

- Runtime promotion commit: `8c618bdc872c85cd8e394d024302c72b59532c61`.
- Files: `app.js`, `bracelet-geometry.js`, `tests/production-mixed-geometry-fit.test.mjs`, and `tests/production-owner-approved-uat-completion.test.mjs`.
- No UAT-only auth/debug, server, catalog, environment, or persistence commit was promoted.

## Environment Isolation Audit

- Candidate has no UAT URL, UAT LIFF, UAT Supabase, or `line_debug` marker.
- `vercel.json`, `server.js`, data, payment, and production LINE/OA modules are unchanged from the production base.
- Production frontend and backend health endpoints returned HTTP 200 before promotion.

## Fixed Preservation

Fixed completion remains pre-Mixed discrete capacity behavior. At 16cm / 175mm target: 17x10mm, 29x6mm, and 43x4mm complete; the next same fixed bead is rejected.

## Mixed Final Rule

Mixed uses the manufacturing target `(wrist + 1.5cm) * 10` and completes inclusively from target minus 5mm through target. At 16cm this is 170mm through 175mm: 17x10mm completes; 169mm is incomplete; 176mm is overflow; at 168mm only 4mm and 6mm are placeable.

## Delete/Re-Add Preservation

Empty retained slots contribute 0mm. A replacement occupies the retained sequence position but its actual current size supplies the physical footprint; a deleted 10mm replaced by 4mm contributes 4mm, with no stale 10mm footprint or sequence reflow.

## LINE Known Issue Isolation

No landing, initial login, LIFF, callback, OA friendship, or handoff behavior was changed by this promotion.

## Tests

- `node --check app.js` and `node --check bracelet-geometry.js`: passed.
- Full production test suite: 130 passed, 0 failed.
- `git diff --check`: passed before commit.

## Production Deployment

Normal non-force `main` push and Vercel production deployment are performed after this controlled report commit. Render is not deployed because no backend code changed.

## Production Smoke Test

After Vercel reports Ready, validate page load, fixed terminal completion, Mixed 17x10mm completion, retained-slot replacement, Step 3/Step 4 physical eligibility, catalog loading, and checkout endpoint reachability without attempting payment.

## Rollback SHA

`a8478f7929cf68d955b6b1c76f1044ac688018c7`

## Final Status

Pending normal production push, Vercel Ready, and post-deploy smoke validation. Production is otherwise isolated from UAT configuration and backend changes.
