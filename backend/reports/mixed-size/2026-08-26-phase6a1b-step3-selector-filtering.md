# Phase 6A.1B — Step 3 mixed selector and stone filtering

## Scope and safety

This isolated promotion-branch change completes only the Step 3 mixed-size selector, stone catalog filtering, and physical size assigned to the next stone. It does not modify geometry, fit validation, pricing, order payloads, server behavior, LINE callback state, restore, CRM, checkout, or production deployment.

## Implemented

- The selector appears only when `State.beadSize === 'mixed'` and contains exactly `4 มม`, `6 มม`, and `10 มม` under `ขนาดหิน`.
- Fixed 4/6/10 modes set the selector’s `hidden` attribute; the existing selector CSS resolves this to `display: none !important`, so there is no retained layout gap.
- Selector selection is normalized to the allowed physical values, updates `State.mixedPlacingSize`, persists it, and refreshes only the stone catalog. It does not alter placed stones, charms, or spacers.
- The selector is synchronized by mode rather than active catalog section, so it remains visible on Stones, Charms, and Spacers in mixed mode.
- Catalog availability uses the current physical placement size. Fixed modes use their fixed size; mixed mode uses `mixedPlacingSize`.
- A shared physical-placement helper returns 4/6/10 or `null`, never `mixed`, and is used by single-stone and fill-entire placement paths.

## Verification

- `node --check app.js` — pass
- `node --check mixed-size-state.js` — pass
- `node --test tests/production-mixed-step2-state.test.mjs tests/production-mixed-step3-selector.test.mjs` — 13 passing
- `git diff --check` — pass

## Production safety

- Production main remains at `0e958ff` and was not modified.
- No production deployment was triggered.
- No production backend, LINE/OA, Step 4, checkout, analytics, or CRM behavior was changed.

## Deferred

Per-component geometry and fit calculation remain intentionally deferred to Phase 6A.1C.
