# Catalog polling Option E — UAT implementation

**Status:** UAT-only local implementation. Production was not changed or deployed.

## Change

- Removed the repeating 3-second customer catalog refresh timer.
- Preserved the existing startup warmup: settings, stones, charms, spacers, categories, and layout order remain loaded through the existing functions.
- Added a shared `customerCatalogRefreshPromise` in-flight guard. Concurrent Step 3/resume requests reuse the same promise; `.finally()` clears the guard after success or failure.
- Added a non-blocking Step 3 entry refresh after the Step 3 shell has rendered. Repeated `renderApp()` calls do not trigger a refresh.
- Added a visible-only `visibilitychange` listener for active Step 3/4 customer sessions. It does nothing while hidden, does not navigate/reset state, and has a 5-second resume debounce.
- A successful refresh repaints Step 3 only when it is still the active step. It does not assign/reset bracelet selection, wrist size, bead size, or navigation state.

## Request counts

| Scenario | Before | After |
|---|---:|---:|
| Idle Step 3, 60 seconds | ~80 catalog API requests (four reads every 3 sec) | **0 periodic catalog API requests** |
| One Step 3 entry | Timer continues thereafter | One deliberate bundle: settings indirectly via `refreshCatalog`, plus stones, charms, spacers (four effective reads) |
| One visible resume at Step 3 | Timer may already be running/throttled | One guarded deliberate bundle, unless within 5-second debounce or an in-flight bundle exists |

The exact UAT browser request count after deployment remains owner/device verification work. Local source contracts prove no catalog timer remains and only these deliberate trigger points exist.

## State and authority safety

- Step 3 refresh preserves current bracelet state and repaints only the current designer.
- If catalog data changes, the UI refreshes without silently modifying the bracelet. Existing server validation remains the authority for unavailable items, stock, current prices, and discounts.
- `/api/stripe/checkout-session` still builds the authoritative order, reads current settings/catalog data, validates stock before Stripe creation, and retains checkoutAttemptId/idempotency behavior.
- Inventory deduction remains paid-webhook-only. LINE notifications, analytics heartbeat, CRM behavior, Meta/TikTok attribution, and Supabase schema/data were not changed.

## Verification

- `node --check app.js`: PASS
- `node --test tests/catalog-polling-option-e.test.mjs tests/customer-funnel-navigation-safety.test.mjs tests/line-oa-friendship-gate.test.mjs`: **45/45 PASS**
- `git diff --check`: PASS
- Focused tests cover no 3-second timer, preserved warmup, one Step 3 trigger, no render trigger, visible-only resume, in-flight guard, failure guard release contract, state preservation contract, analytics heartbeat, checkout price/stock authority, paid-webhook inventory, LINE, and Meta authority.

## Files changed

- `app.js`
- `tests/catalog-polling-option-e.test.mjs`
- `reports/infrastructure/catalog-polling-option-e-uat.md`

## Deployment and risk

No deployment has occurred at the time of this report. Before production consideration, deploy only UAT and verify at 390px: Step 1→4, one idle 60-second Step 3 period, one mobile background/resume, return to Step 3, and checkout entry without payment. Expected loop-driven quota reduction for long-lived tabs is >99%.

**Production recommendation:** promote only after UAT mobile request capture and owner acceptance; do not alter backend checkout authority.