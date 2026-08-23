# Callback Bootstrap Visual Hold

## Root cause

The callback planner already prevented the legacy reset for a valid V2 intent, but startup still called `loadPersistedState()` and `syncShellVisibility()` before LIFF identity, OA friendship, and handoff restoration completed. Those calls could expose the static landing/Step 1 shell. `initLIFF()` could also dismiss its loading overlay before the eventual restored render.

## Fix

`index.html` now sets a conservative document-head `callback-bootstrap-hold` marker for a valid V2 intent or bounded friendship-resume marker. This prevents the static landing markup from painting while the QA/status bootstrap is running.

`app.js` confirms the real callback state before persisted/default-state initialization and keeps the hold active for either:

- a flagged V2 handoff callback; or
- a bounded LINE OA friendship-return marker.

While held, the normal landing and designer shells are invisible and non-interactive. A single neutral overlay is shown instead: `กำลังกลับเข้าสู่แบบกำไลของคุณ`.

Startup still performs the required sequence under the hold:

1. LIFF initialization and LINE identity sync.
2. Current OA friendship verification.
3. Server-handoff/local-snapshot recovery and catalog reconciliation.
4. Pricing/layout reconstruction and final permitted step resolution.
5. One `renderApp()` call, then hold release.

If callback recovery cannot reach an authorized Step 4, a valid local canonical snapshot is restored to Step 3 without consuming or clearing the V2 recovery state. This remains fail-closed and preserves a later retry.

## Safety and regression coverage

- The centralized Step 4 and checkout friendship guards are unchanged.
- No Stripe, webhook, CRM, pricing, renderer, catalog, analytics, UTM, Meta Pixel, or notification logic changed.
- A normal visit has no callback marker, so the new hold is removed before persisted/default-state startup and existing behavior is unchanged.
- The callback bootstrap test asserts the hold is set before `loadPersistedState()` and released only after the first final `renderApp()`.

## Verification

- `node --test tests/line-callback-bootstrap.test.mjs` — 7 passed.
- `node --test tests/line-oa-friendship-gate.test.mjs` — 9 passed.
- `node --check app.js` — passed.
- `node --check server.js` — passed.
- `git diff --check` — passed.

No real-device test was performed in this implementation environment. Owner retest is required after deployment to validate LIFF/browser paint timing.
