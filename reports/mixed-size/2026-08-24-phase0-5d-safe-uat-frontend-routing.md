# Phase 0.5D — Safe UAT Frontend Routing

## Scope

Prepared only `D:\Projects\lucky-colorstone-uat` on branch `uat` for a future UAT Vercel deployment. This work changes no production workspace, branch, deployment, configuration, data, or external production service.

The UAT frontend remains limited to the landing page and Steps 1–3 for Mixed Size state, UX, renderer, and geometry work. Checkout, order creation, LINE, Meta Pixel, analytics, and payment flows are deliberately unavailable.

## Findings

- The prior UAT frontend configuration routed `/api/*` to `lucky-colorstone-designer.onrender.com`, the production Render backend.
- The prior customer HTML loaded the production Meta Pixel and LINE LIFF SDK, and the client contained the production LIFF ID.
- The customer application uses root-relative `/api/*` requests for catalog data. A UAT Vercel rewrite is therefore sufficient to direct catalog requests to the UAT backend without changing catalog client calls.
- The client contained a production CRM order-detail fallback. It is now unreachable in UAT because the UAT guard returns an empty fallback list and refuses all order-detail startup handling.

## Decisions and implementation

- `vercel.json` now serves the customer root only for `uat.customize.luckycolorstone.com` and rewrites `/api/*` to `https://lucky-colorstone-uat.onrender.com/api/*`.
- `_redirects` matches that same UAT backend target for compatible static-host routing.
- The UAT `index.html` no longer loads the Meta Pixel or LIFF SDK and includes a visible, non-secret UAT banner.
- `app.js` has an explicit `APP_ENV = 'uat'` / `IS_UAT_MODE` marker. In UAT it fails closed before analytics transport, Meta calls, deferred LINE QA/auth handling, LIFF initialization, Stripe-return handling, checkout, order creation, LINE order handling, and CRM order-detail fallback requests.
- Step 4 navigation is blocked with a UAT-only message. Steps 1–3 remain available.
- Added `tests/uat-frontend-safety.test.cjs` to lock the API rewrite, UAT marker, integration guards, and removal of the production browser identifiers.

## Validation

Passed locally in the UAT worktree:

- `node tests/uat-frontend-safety.test.cjs`
- `node --check app.js`
- `node --check data.js`
- `git diff --check`
- Static routing inspection confirms neither `vercel.json` nor `_redirects` references the production Render backend.

Live, read-only UAT backend probes on 2026-08-24:

| Endpoint | Status | Result |
| --- | --- | --- |
| `GET /api/stones` | 404 | Render response includes `x-render-routing: no-server` |
| `GET /api/charms` | 200 | UAT JSON fixture endpoint responded |
| `GET /api/spacers` | 404 | Render response includes `x-render-routing: no-server` |
| `GET /api/settings` | 404 | Render response includes `x-render-routing: no-server` |

The failed endpoints were reached only at `https://lucky-colorstone-uat.onrender.com`; no request redirected to, read from, or wrote to a production backend. The live UAT backend must be repaired/redeployed independently before a Vercel UAT frontend can support the complete Phase 1–3 catalog flow.

## Risks and blockers

- **Blocker:** the live UAT backend does not currently serve all required fixture endpoints consistently. Deploying the UAT frontend now would leave Step 3 without a reliable catalog.
- The UAT frontend has not been deployed in this phase; its rewrites have been verified statically, not through a live Vercel request.
- All browser integration guards are intentionally UAT-branch-only. They must never be merged to production as part of this phase.

## Rollout and rollback

- Rollout: after the UAT backend reliably returns 200 fixture responses for stones, charms, spacers, and settings, create a separate Vercel project connected only to `origin/uat`, configure only `uat.customize.luckycolorstone.com`, and deploy that project.
- Rollback: remove or roll back only the UAT Vercel project/deployment. No production rollback is relevant because production was not changed.

## Production safety assertions

- Production main unchanged: **YES** — local and `origin/main` remain at approved baseline `0e958ff63b322b179e8184c4c6640fb22518756a`.
- Production worktree modified by this phase: **NO**.
- Production deployment triggered: **NO**.
- Production data accessed or written: **NO**.
- UAT branch active: **YES**.
- UAT frontend API route targets production Render: **NO**.

## Final status

**BLOCKED for UAT Vercel deployment** until the UAT backend restores all four read-only fixture endpoints. The UAT frontend routing and fail-closed client isolation changes are complete, locally validated, and ready to commit and push only to `origin/uat`.
