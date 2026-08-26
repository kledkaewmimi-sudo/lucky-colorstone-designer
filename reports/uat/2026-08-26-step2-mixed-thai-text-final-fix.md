# UAT Step 2 Mixed Thai Text Final Fix

## Scope

This UAT-only micro-fix corrects the Mixed-card description Unicode sequence. No LINE callback, Step 3 sticky, renderer, mixed-size state, OA friendship, or production code was modified.

## Unicode Correction

The prior runtime text used the sequence `ส น ก` (`U+0E2A U+0E19 U+0E01`) and omitted the Thai vowel mark `ุ`.

The corrected runtime text is `สนุก มมต` with this exact sequence:

`U+0E2A U+0E19 U+0E38 U+0E01 U+0020 U+0E21 U+0E21 U+0E15`

The Step 2 regression test now asserts that exact sequence and explicitly rejects the previous vowel-less text.

## Preserved Behavior

- Mixed / 10mm / 6mm / 4mm order is unchanged.
- Step 2 has no default selection.
- Wrist images and Mixed gold/star styling are unchanged.
- Step 3 sticky/freeze implementation is unchanged.
- Landing identity-before-design and OA friendship behavior are unchanged.

## Verification

- `node --check app.js` passed.
- `node --test tests/mixed-size-ux.test.mjs tests/mixed-size-state.test.mjs` passed: 38/38.
- `git diff --check` passed.

## Deployment

The correction is deployed only to the isolated UAT environment:

`https://uat.customize.luckycolorstone.com/`

Production was not changed.

## Owner Retest

Verify the first-time LINE callback still opens Step 1 automatically, the Step 2 Mixed card displays the corrected Thai text, and Step 3 sticky behavior remains unchanged.
