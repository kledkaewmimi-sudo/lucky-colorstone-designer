# UAT Step 2 Mixed Description Unicode Fix

Date: 2026-08-26
Branch: `uat`
Implementation commit: `2e1c46d`

## Scope and safety

This is a UAT-only micro-fix limited to the Step 2 mixed-size description and its focused UX test. No Step 3 sticky code, mixed logic, geometry, pricing, Step 4, backend, production data, or production integration changed.

## Exact customer-facing copy

The mixed-size card title remains `คละไซส์`.

The description is exactly `สนุก มีมิติ` with this verified Unicode sequence:

`U+0E2A U+0E19 U+0E38 U+0E01 U+0020 U+0E21 U+0E35 U+0E21 U+0E34 U+0E15 U+0E34`

## Validation

- `node --test tests/mixed-size-ux.test.mjs` — passed: 24 tests, 0 failures.
- The focused UX test now asserts the full source string through code points and rejects the malformed runtime variants.
- A read-only UTF-8 source check confirmed the exact sequence above.
- Malformed runtime copies in `index.html`: 0.
- `git diff 03990b1 -- app.js index.css` — empty; Step 3 sticky code unchanged.
- `git diff --check` — passed.

## Required status

- STEP 2 MIXED DESCRIPTION EXACT: PASS
- UNICODE SEQUENCE EXACT: PASS
- MALFORMED RUNTIME COPIES REMAINING: 0
- STEP 3 STICKY CODE UNCHANGED: YES
- PRODUCTION UNTOUCHED: YES
