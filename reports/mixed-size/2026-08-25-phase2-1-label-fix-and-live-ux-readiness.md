# Phase 2.1 — Mixed Size labels and live UX readiness

Date: 2026-08-25
Workspace: `D:\Projects\lucky-colorstone-uat`
Branch: `uat`

## Scope and safety precheck

- `main` and `origin/main` both resolved to `0e958ff63b322b179e8184c4c6640fb22518756a` before the UAT-only commit.
- No production workspace, branch, deployment, catalog, credentials, or external production integration was changed.
- The existing UAT frontend and backend safety guards passed, including the UAT Step 4 block and disabled checkout path.

## Label result

The supplied “current” and “required” Thai strings are byte-for-byte identical. The UAT customer markup was already using the required exact strings, so no application UI text was changed.

- Step 2 mixed option: `คละไซส`
  - visible label and `aria-label` present exactly once each.
- Step 3 mixed filter: `ทงหมด`
  - present exactly once, followed by `4mm`, `6mm`, and `10mm` in filter order.

The Phase 2 UX test had mojibake label literals. It was corrected and now asserts the exact approved Thai copy, exact customer-facing occurrence counts, and the Step 3 filter order. This prevents a future encoding regression without changing the mixed-size state model or geometry.

## Regression verification

Commands completed successfully:

```text
node --check app.js
node --check mixed-size-state.js
node --test tests/mixed-size-state.test.mjs tests/mixed-size-ux.test.mjs tests/guest-design-state.test.mjs tests/uat-backend-guard.test.cjs tests/uat-frontend-safety.test.cjs
git diff --check
```

Result: 33 tests passed, 0 failed. The only output was the existing Node module-type warning.

Coverage confirms:

- fixed 4mm, 6mm, and 10mm state behavior remains intact;
- mixed selection initializes from the preceding fixed size;
- the mixed filter is only rendered for mixed Stones mode;
- 4/6/10 filters use catalog size support;
- changing filters does not mutate placed stones, their sizes, or order;
- a mixed placement requires an explicit compatible size and does not silently fall back to 6mm;
- mixed-to-fixed validation and cancellation remain non-mutating;
- UAT catalog tabs, Step 4 block, checkout block, and external-integration guards remain present.

## Live static check

Read-only request to `https://lucky-colorstone-uat.vercel.app/` returned the deployed document with:

```text
คละไซส occurrences: 2
ทงหมด occurrences: 1
mixed card present: true
all-size filter button present: true
```

An interactive browser was unavailable in this environment. Therefore this report deliberately records only static deployment confirmation; the owner click-through is the remaining interactive validation.

## Outcome

- Step 2 label exact: PASS
- Step 3 label exact: PASS
- Phase 2 tests: PASS
- Production untouched: YES
- Ready for owner click-through: YES
- Ready for Phase 3: NO
