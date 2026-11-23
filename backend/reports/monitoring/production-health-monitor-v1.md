# Lucky Colorstone Production Health Monitor v1

## Outcome

- Status: implemented and production-safe.
- Target: `https://customize.luckycolorstone.com/`
- Schedule: `0 */3 * * *` plus manual `workflow_dispatch`.
- Runtime: GitHub-hosted Ubuntu, Node 22, pinned Playwright 1.63.0, Chromium.
- Application deployment: none; the workflow only monitors.

## Customer-flow coverage

The 390×844 mobile test uses the live homepage, customer GET APIs, catalog, and
assets. It opens the landing page, enters Step 1, selects 10 mm in Step 2,
triple-clicks Next into Step 3, renders the designer/catalog, constructs a valid
bracelet, triple-clicks Next into Step 4, and validates the summary and price.
It stops before Pay and never calls the checkout endpoint.

The test samples up to 12 currently rendered images from each stone/charm tab
and all seven spacer images. It detects HTTP image errors plus loaded `<img>`
elements with zero natural width. The rotating Beryl card is handled using
atomic DOM snapshots rather than retained element handles.

## Safety controls

- All browser requests except GET/HEAD are fulfilled locally and never forwarded.
- Meta/TikTok network requests and LINE SDK/API calls are fulfilled locally.
- LIFF identity/friendship is synthetic and contains no customer PII.
- Pay is not clicked; no Stripe session, order, webhook, inventory, CRM, or DB write occurs.
- No Supabase key, Stripe key, analytics token, or customer data is used.
- Report fields contain endpoint URLs and timings only, never headers or bodies.
- `/api/liff-config` HTTP 404 is recorded as a handled fallback because the live
  customer journey uses the production fallback successfully.

## Thresholds and failure rules

| Check | GOOD | WARN | FAIL |
|---|---:|---:|---:|
| Step 2 → 3 visible | <500 ms | 500–2,000 ms | >2,000 ms |
| Step 3 → 4 visible | <500 ms | 500–2,000 ms | >2,000 ms |
| Customer GET API | — | reported | >10,000 ms |

Any uncaught page error, customer-facing request failure, HTTP 5xx, sampled
broken product image, duplicate transition/toast, invalid summary price, or
forwarded write also fails the run. Catalog completion after visible Step 3 is
measured separately and does not fail a responsive visible transition by itself.

## Verified production run

- Result: PASS on 2026-09-10 (Asia/Bangkok date).
- Homepage load: 2,212 ms.
- Step 2 → 3 visible: 0.5 ms (GOOD).
- Step 3 → 4 visible: 12.2 ms (GOOD).
- Initial catalog render after Step 3: 13 ms.
- Slowest API: `/api/settings`, 432 ms, HTTP 200.
- Catalog: 27 stones, 13 charms, 7 spacers.
- Images checked: 32; broken: 0.
- Failed requests / HTTP 5xx / page errors: 0 / 0 / 0.
- Triple-click activations: 1 for each transition; duplicate toasts: 0.
- Intercepted writes: 34; production mutation requests forwarded: 0.

## Failure artifacts and notifications

On failure, Actions uploads the JSON report plus Playwright screenshot and trace
for 14 days. Every scheduled or manual run attempts exactly one LINE push: a
concise health check summary for PASS or a concise alert for FAIL. A final step
restores the original health failure even if LINE delivery failed.

A controlled failure produced the expected FAIL report, screenshot, trace, and
redacted dry-run alert. Focused tests verify that simulated PASS and FAIL reports
each make exactly one LINE request and contain no token, target ID, or PII.

Required repository secrets:

- `LINE_CHANNEL_ACCESS_TOKEN`
- One of `ADMIN_LINE_GROUP_ID` or `ADMIN_LINE_USER_IDS`

Setup: Repository → Settings → Secrets and variables → Actions → New repository
secret. Do not paste secret values into source, issues, logs, or chat.

## Files

- `.github/workflows/production-health-monitor.yml`
- `tests/production-health-monitor.spec.mjs`
- `scripts/send-production-health-line-alert.mjs`
- `tests/production-health-monitor-contract.test.mjs`
- `package.json` and `package-lock.json` (pinned Playwright dev dependency)
