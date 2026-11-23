# CRM Cost final Production release and historical backfill

## Pre-Release State

Production baseline was \`64e2ed6\`. The approved all-time exact-variant dry-run had 22 paid eligible orders, 22 resolved orders, zero unresolved orders, and zero existing snapshots.

## Owner Approved Cost Model

Live paid orders retain the first snapshot created at the existing Stripe-confirmed paid persistence boundary. It uses exact physical Purchases identities and current weighted-average unit costs with source \`purchases_weighted_average_exact_variant\`.

Historical snapshots use the owner-approved all-time exact-variant weighted average, source \`purchases_all_time_weighted_average_exact_variant\`, status \`backfilled\`, and \`historicalEstimate: true\`. Delivery cost is fixed at THB 80. Total cost is material plus delivery; profit uses the saved final paid amount after discount; margin is profit divided by final paid amount.

## Test Reconciliation

Four stale test files were reconciled without changing runtime code.

| Test area | Old contract | Why stale | New contract | Coverage preserved |
|---|---|---|---|---|
| guest design state | Required ephemeral \`uniqueId\` in a canonical persisted snapshot | Approved canonical serializer intentionally removes ephemeral render identifiers | Exact type, catalog identity, physical size, ordering, and anchors persist; pricing/PII do not | Yes |
| initial deferred login | Required removed private guard imports and QA initializer | App now delegates to the approved fail-safe Step 3 boundary | App invokes the current boundary and has no URL/local-storage bypass | Yes |
| Step 3 auth boundary | Required old uppercase reasons, unpersisted login, and private LIFF APIs | Current boundary fails closed unless the redirect intent is persisted and exposes normalized safe reasons | Snapshot, handoff, intent, and login ordering plus fail-closed behavior are tested | Yes |
| iOS callback | Imported removed URL callback helpers and asserted obsolete implementation details | Current V2 uses in-memory redirect intent and callback bootstrap modules | Identity gate, server-first restore, and invalid-token no-local-resurrection behavior are tested | Yes |

## Regression Gate

\`node --test tests/*.mjs tests/*.cjs\` passed 150 tests, with 0 failures and 0 skips. \`node --check crm.js\`, \`node --check server.js\`, \`node --check server-order-cost-snapshot.js\`, and \`git diff --check\` passed.

## Customer Runtime Freeze

No customer runtime files were changed: \`index.html\`, \`index.css\`, and \`app.js\` are unchanged. No renderer, Steps 1–4, completion, checkout, Stripe authority, LINE/LIFF/OA, Pixel, analytics, or customer pricing change was made.

## Production Diff

The release commit contains only CRM COST UI, cost snapshot backend integration, the create-only maintenance script, focused cost/backfill tests, and stale-test reconciliation.

## Production Commit

Pre-deploy main SHA: \`64e2ed6\`. Production commit: \`9b8a55a34983ac487e1dd9d0555cd5ef8bfdb038\`. It was pushed to \`origin/main\`.

## Vercel Deployment

Vercel Production deployment \`dpl_9Y9DX9dokyqYstt2Ln6f861h8wWM\` was Ready and aliased to \`customize.luckycolorstone.com\` and \`crm.luckycolorstone.com\`.

## Render Deployment

The backend has no version/health endpoint that exposes its Git SHA. The direct backend \`/api/orders\` probe returns 404 because the endpoint is hosted through the frontend proxy. Render deployment SHA could not be independently confirmed from this controlled worktree.

## Live Runtime Verification

Vercel confirmed the Production frontend deployment as Ready. A live content probe from this Windows runner was subsequently blocked by the local Schannel credential provider; no claim is made that browser visual verification completed.

## Pre-Backfill Audit and Final Dry-Run

The most recent authorized Production read-only dry-run after owner provisional Purchases entry: paid 22, already snapshotted 0, eligible 22, resolved 22, unresolved 0, overwrite candidates 0, errors 0. Estimated material THB 1988.9939936763421; delivery THB 1760; total THB 3748.9939936763417; profit THB 9072.006006323656.

## Historical Backfill Execution

Not executed. The controlled worktree has neither \`SUPABASE_URL\` nor \`SUPABASE_SERVICE_ROLE_KEY\`. The backfill script requires both plus \`PRODUCTION_BACKFILL_CONFIRM=CREATE_ONLY_COST_SNAPSHOTS\`; no alternate write path was invented.

## Snapshot, Aggregate, and Idempotency Verification

Not performed because no historical snapshot was written. The script is paid-only, exact-identity-only, re-reads every order before PATCH, skips existing snapshots, and is create-only; its second run is designed to produce zero writes.

## Production CRM Verification and Customer Site Smoke

Await manual/browser verification after backend deployment is confirmed. No payment or fake Production order was created.

## First Genuine New Paid Order

Pending a genuine customer payment. The expected live source is \`purchases_weighted_average_exact_variant\`; it must not be inferred or marked passed until observed.

## Rollback

Runtime rollback is a normal \`git revert 9b8a55a\`; never force-reset main. Backfilled accounting records, once authorized and written, are additive and must not be deleted without separate owner approval.

## Owner Acceptance

Confirm the deployed CRM shows PRICING → COST → STATUS and a representative historical record displays its persisted Backfilled estimate after the separately authorized credentialed backfill.

## Final Status

**BLOCKED_PRODUCTION_BACKFILL_CREDENTIAL**. Source regression and Vercel frontend deployment passed. Supply the existing authorized Production Supabase service credential to the controlled maintenance environment, confirm Render has deployed commit \`9b8a55a\`, then rerun the final read-only dry-run before executing the create-only backfill.
