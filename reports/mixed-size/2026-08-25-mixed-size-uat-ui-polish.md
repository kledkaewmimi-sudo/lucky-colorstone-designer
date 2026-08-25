# Mixed Size UAT UI polish — Step 2 and Step 3

Date: 2026-08-25
Workspace: `D:\Projects\lucky-colorstone-uat`
Branch: `uat`

## Scope and safety

- UAT workspace/branch only. No production workspace, branch, configuration, deployment, backend, catalog, data, or integration was changed.
- No checkout, payment, Stripe, CRM write, LINE, analytics, or routing behavior was changed.
- Existing UAT Step 4 and checkout blocks remain covered by safety tests.

## Step 2 polish

- The four 4mm, 6mm, 10mm, and `คละไซส์` choices now use a two-column equal-card grid.
- All cards have the same minimum height and compact content layout, so the mixed choice is fully visible and tap-sized.
- The former 10mm featured decoration, large hand panel, and expanded support/badge content are suppressed in this row. Its background, border, active treatment, and visual weight now match the 4mm/6mm card family.
- Existing active card styling, radio semantics, and approved Thai mixed label remain intact.

## Step 3 polish and behavior

- The selector is now structurally below the main catalog tab row.
- It is a thin single-line strip with `ขนาดหิน` and exactly three physical placement buttons: 4mm, 6mm, and 10mm.
- The old browse-all control and selector-specific remaining-space panel/markup are removed.
- In mixed mode, the strip remains visible on Stones, Charms, and Spacers. The active explicit placement size persists across tab changes and is used when returning to Stones.
- Legacy restored `all` filter state normalizes to the already stored explicit mixed placement size. This does not mutate existing stones, charms, spacers, sequence, dimensions, or prices and does not introduce a 6mm fallback.

## Verification

Completed successfully:

```text
node --check app.js
node --test tests/mixed-size-ux.test.mjs tests/mixed-size-phase5-acceptance.test.mjs tests/mixed-size-pricing.test.mjs tests/mixed-size-geometry.test.mjs tests/mixed-size-state.test.mjs tests/guest-design-state.test.mjs tests/uat-backend-guard.test.cjs tests/uat-frontend-safety.test.cjs
git diff --check
```

Result: 64 tests passed, 0 failed. Existing Node module-type warnings were the only warnings.

Focused UI assertions cover equal Step 2 card layout, matching 10mm base background, strip placement after the tab row, exactly three buttons, removal of the browse-all and remaining-space markup, persistence across every Step 3 tab, explicit placement/no fallback, non-mutation, fixed-mode behavior, and UAT Step 4 blocking.

## Live verification status

Commit `3d41d71` was pushed only to `origin/uat`. Read-only deployed-source checks confirmed:

```text
frontend response: 200
Step 2 equal-card grid rule present: true
Step 2 equal height rule present: true
10mm base background matches standard card family: true
mixed selector appears after tab row: true
mixed selector size values: 4,6,10
mixed selector button count: 3
browse-all button present: false
remaining-space selector markup present: false
cross-tab mixed selector visibility rule present: true
UAT Step 4 block present: true
production Render backend reference: false
```

Browser automation is unavailable in this environment. Owner visual click-through remains the final confirmation of tap comfort and exact mobile appearance.

## Required results

- STEP 2 BUTTONS EQUALIZED: YES
- คละไซส์ FULLY VISIBLE: YES
- 10MM BACKGROUND MATCHED TO 4/6MM STYLE: YES
- STEP 3 MIXED BAR COMPACTED: YES
- ONLY 3 SIZE BUTTONS REMAIN: YES
- ทงหมด REMOVED: YES
- SPACE REMAIN REMOVED: YES
- MIXED BAR MOVED BELOW TAB ROW: YES
- MIXED LOGIC PRESERVED: YES
- UAT STEP 4 BLOCK PRESERVED: YES
- PRODUCTION UNTOUCHED: YES
