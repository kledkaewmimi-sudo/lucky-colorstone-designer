# UAT Landing LINE Auth Blocker

## Real Device Evidence

Owner testing on both iPhone and Android showed the same UAT failure: selecting **Start** on the Landing page displayed the LINE connection state ("กำลังเชื่อมต่อ LINE") indefinitely and never entered Step 1. The visible UAT banner also said that checkout, LINE, and analytics were disabled.

UAT configuration itself was available from `/api/liff-config` and resolved the dedicated UAT LIFF ID (`2010525799-Sw5UFc6E`). This was therefore a shared UAT runtime issue, not an iOS-only authentication issue.

## Exact First Failing Operation

The first failing operation was the Landing identity gate fallback in `openLineConnectEntryForCustomization()`:

1. UAT omitted the LIFF SDK script, so `initLIFF()` found `window.liff` unavailable and left `State.liffInitialized` false.
2. The mobile Landing identity gate then selected the LIFF entry fallback.
3. `getLiffEntryUrl()` returned an empty string whenever `IS_UAT_MODE` was true.
4. `window.location.assign('')` reloaded the same UAT page after the loading overlay was displayed.
5. Startup repeated, producing the observed endless connection state before Step 1.

No bracelet, handoff, callback, friendship, or payment path was reached.

## Legacy UAT Disable Audit

The outdated all-in-one UAT safety model had three coupled pieces:

- `index.html` intentionally omitted both the production Meta Pixel and the LINE LIFF SDK.
- The UAT banner stated that LINE was disabled.
- `getLiffEntryUrl()` intentionally returned an empty string for UAT.

Those rules were valid before UAT received its own LIFF application, but they now contradicted the dedicated UAT LIFF configuration. The codebase already has separate `IS_UAT_MODE` guards for analytics, Stripe checkout, order creation, and LINE order notifications; those safeguards do not need LINE identity authentication to remain disabled.

## LIFF Initialization Audit

The current startup sequence loads `/api/liff-config`, resolves the returned ID using `resolveLiffEnvironmentConfig`, stores it in `LIFF_ID`, then calls `initLIFF()`. `initLIFF()` calls `liff.init({ liffId: LIFF_ID })` only after a valid configured ID and an available LIFF SDK are present.

Before this fix the configured UAT LIFF ID could not be used because the SDK was deliberately absent. After this fix the UAT page loads the public LIFF SDK and the entry fallback uses the configured LIFF ID. The production LIFF ID is not embedded in the UAT frontend.

## Root Cause

An obsolete UAT blanket LINE-disable guard remained active after dedicated UAT LIFF configuration was introduced. It omitted the LIFF SDK and converted the LIFF entry URL into an empty string, creating a self-reload loop in the mobile Landing identity gate.

## Fix

The minimal UAT-only fix:

- Loads the LIFF SDK from `https://static.line-scdn.net/liff/edge/2/sdk.js`.
- Uses `https://liff.line.me/${LIFF_ID}` whenever a configured LIFF ID exists, including the UAT ID supplied by `/api/liff-config`.
- Rejects a missing entry URL before showing the loading state or setting `liffLoginInProgress`.
- Corrects the UAT banner to state that checkout and analytics remain disabled, without falsely claiming LINE identity is disabled.

No production LIFF ID, endpoint, environment variable, server route, payment code, analytics code, or production deployment was changed.

## UAT Safety Separation

UAT LINE identity authentication is enabled only through the dedicated UAT LIFF configuration. The independent UAT safety guards remain in place:

- Stripe checkout and payment remain disabled.
- Order/CRM creation remains disabled.
- Production analytics and Meta Pixel remain disabled.
- Production LIFF ID (`2010525799-qImIuhla`) is absent from UAT frontend source.

## Tests

Focused verification passed:

- `node --check app.js`
- `node tests/uat-frontend-safety.test.cjs`
- `node --test tests/uat-line-auth-enabled.test.mjs tests/liff-environment-config.test.mjs tests/line-identity-before-design.test.mjs tests/line-callback-bootstrap.test.mjs tests/line-oa-friendship-gate.test.mjs tests/guest-design-state.test.mjs`
- `git diff --check`

Result: 36 passing, 0 failing. The new UAT LINE-auth contract test proves that a configured UAT LIFF app is enabled while checkout and analytics remain disabled.

## Deployment

This change is deployed only through the `uat` branch to the `lucky-colorstone-uat` Vercel project and stable UAT hostname:

`https://uat.customize.luckycolorstone.com/`

Production main, production Vercel, production Render, production LIFF configuration, Stripe, and production domains are out of scope and unchanged.

## Owner Retest

On both an iPhone and Android device, open UAT and test:

1. Landing → Start.
2. First-time LINE authentication, when prompted.
3. Return to UAT and verify a clean Step 1 opens.
4. Repeat with an existing LIFF session and verify Step 1 opens without unnecessary login.

Continue to Step 2/Step 3 QA only after Landing → Step 1 succeeds on both devices.

## Production Isolation

Production was not changed. This is an UAT-only correction for the dedicated UAT LIFF environment.
