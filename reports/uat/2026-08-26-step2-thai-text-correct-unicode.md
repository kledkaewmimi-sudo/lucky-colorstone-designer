# UAT Step 2 Thai Text Correct Unicode

## Scope

UAT-only Step 2 Mixed description correction. No LINE callback, Step 3 sticky, renderer, mixed-size logic, OA friendship, or production files were changed.

## Correct Runtime Text

The Mixed description now uses the exact owner-provided Unicode sequence:

`U+0E2A U+0E19 U+0E38 U+0E01 U+0020 U+0E21 U+0E35 U+0E21 U+0E34 U+0E15 U+0E34`

Rendered text: `สนุก มีมิติ`.

## Regression Contract

`tests/mixed-size-ux.test.mjs` now explicitly asserts the required 11 code points and rejects both previous strings:

- `ส น ก ม ม ต` (missing vowel marks)
- `ส น ุ ก ม ม ต` (missing the second word’s vowel marks)

The existing test also continues to cover Mixed / 10mm / 6mm / 4mm order, no default selection, wrist images, Mixed treatment, and Step 3 sticky contracts.

## Verification

- `node --check app.js` passed.
- `node --test tests/mixed-size-ux.test.mjs tests/mixed-size-state.test.mjs` passed: 38/38.
- `git diff --check` passed.

## Deployment and Isolation

The change is deployed only to the UAT Vercel project and stable UAT hostname:

`https://uat.customize.luckycolorstone.com/`

Production is unchanged.

## Owner Retest

Verify first-time LINE callback auto-entry to Step 1, the exact Step 2 Mixed text, and the unchanged Step 3 sticky preview.
