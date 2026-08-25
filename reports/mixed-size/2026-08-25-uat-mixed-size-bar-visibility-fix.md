# UAT Mixed Size selector visibility fix

Date: 2026-08-25
Scope: `D:\Projects\lucky-colorstone-uat`, branch `uat` only.

## Root cause

The Step 3 render path already set the selector's semantic `hidden` attribute correctly:

```js
DOM.mixedSizeSelectorBar.hidden = State.beadSize !== MIXED_BEAD_SIZE_MODE;
```

However, the UAT compact-bar stylesheet later set `display: grid` on the same element. An authored `display` declaration overrides the browser's default `[hidden] { display: none; }`, so the fixed-mode container remained visible and occupied layout space.

## Fix

Added an explicit UAT-scoped hidden-state rule:

```css
#stepView3 .mixed-size-selector-bar[hidden] {
  display: none !important;
}
```

This preserves the existing canonical render condition and removes the container completely from fixed-mode layout. No button disabling or unrelated CSS workaround was used.

## Regression coverage

- Fixed 4mm, 6mm, and 10mm canonical modes resolve to hidden selector state.
- Mixed mode resolves to visible selector state across all Step 3 tabs.
- Fixed-to-mixed and mixed-to-fixed transitions follow their resulting canonical mode.
- Restored fixed and mixed mode normalization follows the same visibility rule.
- The explicit hidden CSS rule prevents layout space in fixed modes.
- Existing mixed placement non-mutation, Step 4 UAT block, checkout block, and UAT routing/integration safety coverage remains passing.

## Verification

Passed:

```text
node --check app.js
node --test tests/mixed-size-ux.test.mjs tests/mixed-size-phase5-acceptance.test.mjs tests/uat-backend-guard.test.cjs tests/uat-frontend-safety.test.cjs
git diff --check
```

Result: 23 tests passed, 0 failed. Existing Node module-type warnings only.

No production workspace, branch, configuration, deployment, data, service, or integration was accessed or modified.

## Deployed UAT static verification

Read-only checks against `https://lucky-colorstone-uat.vercel.app` confirmed that the deployed stylesheet contains the explicit hidden-state rule and the deployed app still uses the canonical mixed-mode condition. This verifies that fixed modes remove the selector from layout rather than merely disabling it.

## Status

- FIXED 4MM BAR HIDDEN: PASS
- FIXED 6MM BAR HIDDEN: PASS
- FIXED 10MM BAR HIDDEN: PASS
- MIXED MODE BAR VISIBLE: PASS
- FIXEDMIXED VISIBILITY TRANSITION: PASS
- NO EMPTY SPACE IN FIXED MODE: PASS
- MIXED LOGIC PRESERVED: YES
- UAT STEP 4 BLOCK PRESERVED: YES
- UAT BRANCH PUSHED: YES (`f7723b5`)
- UAT DEPLOYED STATIC SOURCE: PASS
- PRODUCTION UNTOUCHED: YES
