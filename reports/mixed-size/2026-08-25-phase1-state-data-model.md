# Phase 1 — Mixed Size state/data model

Date: 2026-08-25

## Precheck

- Working branch: `uat`.
- `main` and `origin/main` both resolved to `0e958ff63b322b179e8184c4c6640fb22518756a` before changes.
- No production URL, deployment command, credential, database operation, or production workspace was used.
- Existing UAT isolation tests still pass: the fixture-only backend requires `APP_ENV=uat` and `UAT_BACKEND=true`, production integrations remain disabled, and Step 4 remains blocked.

## State model

Added `mixed-size-state.js`, a pure state-policy module. It defines the four canonical bracelet size modes: fixed `4`, fixed `6`, fixed `10`, and `mixed`.

- `mixed` is a design mode, never a catalog stone size.
- A placed stone keeps its own `size`; catalog filtering/placement uses `mixedPlacingSize` only while in mixed mode.
- Fixed → mixed returns a state copy that retains component identities, sizes, and order, and initializes `mixedPlacingSize` from the prior fixed size.
- Mixed → fixed validates every placed stone against catalog `sizes` before changing state. An unsupported item produces a blocked result with its stone ID and leaves the input state unchanged. A valid, explicitly chosen fixed conversion makes all stone component sizes that chosen fixed size.
- The placement-size helper accepts only 4, 6, or 10 and safely falls back without touching placed stones.

## Restore and persistence

Local state persistence retains `mixedPlacingSize`. The restore path now accepts `mixed`, restores the saved placement selector safely, and preserves saved individual component sizes rather than rewriting them from a global size.

The dormant guest-design snapshot now preserves each stone component `size` and `mixedPlacingSize`; fixed legacy snapshots without a component size remain readable by deriving their historical fixed mode size. `ResolvedLayout` remains derived at render time and is not stored in local state or guest snapshots.

## Tests and verification

Passed:

- `node --check app.js`, `guest-design-state.js`, and `mixed-size-state.js`.
- Focused mixed-size, guest-design, UAT backend guard, and UAT frontend safety tests: 20 passed, 0 failed.
- `git diff --check`.

The focused mixed-size tests cover fixed regressions for 4/6/10, all three fixed→mixed defaults, placement-size immutability, mixed 4/6/10 sequences, valid and blocked mixed→fixed transitions, non-mutation on a blocked conversion, restore order/sizes, catalog-size helpers, and no `ResolvedLayout` persistence.

An exploratory all-tests command reported four existing unrelated failures: two server analytics tests were launched without the required UAT environment variables, and two static/module tests (`analytics-tracking` and `beryl-visuals`) fail independently of the files changed here. The focused Phase 1 regression suite passed.

## Scope retained

No visible Mixed Size control was added. Fixed Step 2 cards continue to operate as before. UAT checkout/order/payment, production LIFF, Meta, analytics writes, and production service access remain disabled.
