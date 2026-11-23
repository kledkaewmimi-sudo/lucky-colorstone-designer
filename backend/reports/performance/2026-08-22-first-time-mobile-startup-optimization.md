# First-Time Mobile Startup Optimization

Date: 2026-08-22

## Scope and safety constraints

This change optimizes the path from the landing CTA to an interactive Step 1. It does not change mobile LINE authentication, LINE in-app behavior, desktop bypass rules, catalog identity, pricing, payments, CRM, analytics event names, Pixel, UTM, Beryl, or bracelet rendering.

## Previous startup architecture

On `DOMContentLoaded`, the customer app made the landing CTA interactive but held `customerStartupBootstrapPromise` unresolved until all of the following had completed:

1. LIFF initialization and, for an existing LINE session, `liff.getProfile()`.
2. Stones, charms, and spacers catalog requests.
3. Catalog layout and shared settings requests.
4. Initial application render.

The CTA awaited that single promise before calling `requireLineLoginForCustomization()`. This meant a first-time mobile visitor could wait on five non-Step-1 catalog/settings operations before the existing mandatory LINE flow even began.

The initial `renderStepViews()` also awaited `getLegacyCharmCatalog()` for every step, including Step 1. Step 1 only renders wrist-size state and does not need charms, stones, spacers, catalog layout, or images.

`refreshCatalog()` also fetches category settings internally, while startup separately fetched layout settings and shared settings. Those requests were concurrent but added unnecessary startup server load.

## Critical path after the change

1. Landing CTA click records the existing `start_customize_click` event and enters the existing loading/reassurance state.
2. CTA waits only for minimal startup readiness: DOM event setup, LIFF initialization, and existing LINE profile restoration when logged in.
3. Mobile and LINE in-app visitors still pass `requireLineLoginForCustomization()` exactly as before. A missing identity still triggers the existing LINE login/entry redirect.
4. Once the existing authentication requirement succeeds, Step 1 renders without waiting for catalog data or catalog images.
5. Stones, charms, spacers, layout, and shared settings load concurrently in a single background warmup promise.
6. Step 3 and Step 4 await that warmup before their catalog-dependent work. Step 1 and Step 2 do not.

## Changes made

- Started catalog hydration immediately but removed it from the CTA/Step-1 blocking promise.
- Deferred CRM-refresh polling until initial catalog hydration settles, preventing a redundant cold-start polling cycle while the first request is still in flight.
- Restricted `getLegacyCharmCatalog()` and selected-design normalization to catalog-dependent Step 3/4 rendering.
- Preserved the existing loading reassurance behavior.
- Added lightweight `Performance.mark()` markers only. They contain no identity data and log only when `?startupDebug` is present:
  - `T0_cta_click`
  - `T1_liff_ready`
  - `T2_auth_ready`
  - `T3_minimum_designer_ready`
  - `T4_step1_rendered`
  - `T5_step1_interactive`
  - `T6_catalog_ready`

## What is no longer on the Step 1 critical path

- `/api/stones`, `/api/charms`, `/api/spacers`
- catalog layout request
- shared settings request
- legacy charm-catalog adaptation
- Step 3 catalog/image rendering and Beryl catalog work
- catalog refresh polling

No all-catalog image preload was found on startup. Catalog image requests are initiated by card/preview rendering, primarily at Step 3. Canvas export image preloading remains confined to export generation.

## Validation

- `node --check app.js` passed.
- `node --check data.js` passed.
- `node --check server.js` passed.
- `git diff --check` passed.
- Fresh local server smoke check passed: `/app.js` contains the background warmup and Step 3 catalog gate; `/api/stones` returned 32 records.

## Timing

No real mobile browser, cold-cache, LINE in-app, or Instagram in-app browser was available in this environment. Therefore no before/after wall-clock claim is made. The performance marks above can be inspected locally with `?startupDebug` or browser Performance tooling without changing production analytics.

## Remaining risks and follow-up

- A user who reaches Step 3 unusually quickly can still wait for the existing catalog request if it has not completed; this is intentional so Step 1 remains prioritized and Step 3 has complete catalog data.
- End-to-end validation should be run on a real mobile cold cache for LINE and Instagram return paths after deployment.
- Existing network timeouts/fallback behavior in catalog helpers was not broadened in this focused change; catalog failure does not block Step 1, but catalog-dependent steps retain their existing fallback behavior.
