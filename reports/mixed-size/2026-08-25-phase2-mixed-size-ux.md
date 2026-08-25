# Phase 2 — Mixed Size UX

Date: 2026-08-25

## Precheck and isolation

- Work was performed only in the `uat` worktree.
- `main` and `origin/main` both resolved to `0e958ff63b322b179e8184c4c6640fb22518756a` before changes.
- No production workspace, deployment, catalog, Supabase resource, credential, payment service, LINE/LIFF resource, Meta resource, or analytics endpoint was used.
- The existing UAT backend and frontend safety tests pass. Step 4 remains blocked in UAT.

## UX changes

### Step 2

Added a fourth native-looking bead-size card labelled `คละไซส` with `data-bead-size="mixed"`. Existing fixed 4mm, 6mm, and 10mm cards remain intact.

- Fixed → mixed immediately preserves the placed sequence and initializes the mixed selector from the prior fixed size.
- Mixed → fixed first validates the catalog support for every placed stone. Unsupported stone names are shown and state is untouched. A valid conversion with existing components requires confirmation; cancel returns without changing state.
- The existing fixed-to-fixed behavior remains unchanged.

### Step 3

Completed the existing dormant mixed selector bar rather than adding a second section. It is now visible only while the current catalog tab is Stones and the current mode is `mixed`.

The compact filter labels are exactly: `ทงหมด`, `4mm`, `6mm`, `10mm`.

- Specific size filters update `mixedPlacingSize` and show only stones whose catalog `sizes` contains that value.
- `ทงหมด` is a browse-only state. It does not become a physical size or default placement to 6mm.
- A stone can be placed only when the retained explicit placement size is supported by that stone. Otherwise placement is blocked with a size-selection message; no alternative size is substituted.
- Filter changes update only `mixedSizeFilter`/`mixedPlacingSize`; they never rewrite existing stone components, sizes, or order.
- Mixed filter state persists in normal local state and survives Step 3 rerenders. Existing stone/charm/spacer tabs remain available in mixed mode.

## Verification

Passed:

- `node --check app.js`
- `node --check mixed-size-state.js`
- Focused Phase 1/2 mixed-size, guest restore, UAT backend guard, and UAT frontend safety suite: 32 passed, 0 failed.
- `git diff --check`

The focused UX tests cover the Step 2 controls/label, all three fixed→mixed initialization paths, mixed-only filter visibility, catalog support filtering for 4/6/10, non-mutating `ทงหมด`/filter changes, explicit placement/no 6mm fallback, conversion block/cancel paths, tab presence, and the UAT Step 4 block.

## Scope retained

No mixed geometry, overflow trimming, renderer-layout change, checkout, order, payment, or production integration change was made. Mixed layout/geometry remains Phase 3 work.

## Deployment and live validation

Commit `db5fb5c` was pushed only to `origin/uat`.

Read-only checks against `https://lucky-colorstone-uat.vercel.app` confirmed that deployed HTML contains the `คละไซส` Step 2 card and the `ทงหมด`/4mm/6mm/10mm filter controls. The deployed JavaScript contains the mixed filter/explicit placement guard and still contains the UAT Step 4 block. The UAT catalog endpoint returned 32 stones, and the deployed JavaScript contains no production Render host reference.

Interactive clicks through Step 2 and Step 3 could not be run because no browser surface is available in this execution environment. Therefore the required deployed click-through verification remains outstanding; no claim is made that the live interaction check passed.
