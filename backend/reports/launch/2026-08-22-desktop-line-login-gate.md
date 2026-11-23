# Desktop LINE-login gate correction

Date: 2026-08-22

## Requested behavior

- Desktop browsers must enter the bracelet designer without a mandatory LINE login.
- Mobile browsers must retain the existing mandatory LINE-login flow.
- LINE in-app behavior must remain unchanged.

## Audit result

The customer landing CTA calls `requireLineLoginForCustomization({ showLandingPrompt: true })`. Before this correction, that shared function required a LINE identity in every browser context. When a desktop user had no LINE identity, it reached the fallback that opens the LIFF entry URL; this blocked desktop designer entry.

The existing mobile detector is `isLikelyMobileBrowser()`, matching Android, iPhone, iPad, iPod, or `Mobile` in the user agent. The existing LIFF-in-client detector is `isLiffInClient()`. The app does not reference `liff.referrer`; it was not involved. `initLIFF()` already catches unavailable/failed LIFF initialization and continues, so it was not the root cause.

## Change

Added `requiresLineLoginForCustomization()`, which returns true only for existing mobile-browser or LINE in-app contexts. `requireLineLoginForCustomization()` now immediately allows desktop before checking LINE identity, LIFF state, or login state.

This preserves the exact existing mobile/LINE branch, including LIFF login and the LIFF entry-URL fallback. It does not change LIFF initialization, URL/UTM handling, analytics, Meta Pixel, Stripe implementation, product data, pricing, stock, renderer, Beryl, CRM, or LINE notification behavior.

## Verification

- Static code review confirms the desktop branch returns before all LINE/LIFF gating.
- Static code review confirms mobile and LINE in-app contexts continue through the existing login branch.
- `node --check app.js` and `git diff --check` are required before commit.
- Browser runtime was unavailable in this environment, so the final desktop/mobile interactive tests must be performed on production after deployment.
