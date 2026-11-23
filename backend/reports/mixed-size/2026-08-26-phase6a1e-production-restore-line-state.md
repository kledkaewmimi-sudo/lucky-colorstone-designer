# Phase 6A.1E: Production mixed-state restore and LINE callback preservation

## Existing flow extended

The existing local customization state, guest-design snapshot, deferred Step 3
handoff, LINE callback bootstrap, and authorized Step 4 resume remain the only
persistence and redirect mechanisms. No LIFF credentials, callback URL, OA
friendship gate, authentication behavior, endpoint, or analytics logic changed.

Fresh public entry behavior remains unchanged: it clears customization recovery
state and starts with `beadSize: null`. Only a valid active callback/resume
context restores prior design state.

## Mixed state preservation

The existing version-1 guest snapshot now carries:

- `beadSize: 'mixed'`
- `mixedPlacingSize` (4, 6, or 10)
- ordered component records
- each stone's stored physical `size`
- component `uniqueId` where present
- existing charm/spacer and anchored-charm structures

No `ResolvedLayout`, derived geometry, pricing totals, or trusted browser price
is persisted. Geometry and pricing continue to derive after restoration from
the restored physical components and current catalog.

Mixed snapshots require an explicit physical 4/6/10 size for every stone. An
incomplete mixed component is rejected as invalid rather than defaulting to
6mm. Legacy fixed snapshots remain compatible: when their older stone records
lack a physical size, the size is safely derived only from their fixed 4/6/10
mode.

## LINE round trip

The existing deferred boundary saves this canonical snapshot before creating the
handoff. The existing server-first/local-fallback callback controller then
passes the same snapshot to the canonical application restore, which preserves
mixed placement size, physical stone sizes, sequence, and IDs before resuming
the already-authorized Step 4 target. No gate location or callback semantics
were changed.

## Verification

Passed:

- `node --check app.js`
- `node --check guest-design-state.js`
- `node --check mixed-size-state.js`
- focused mixed restore/callback tests
- existing guest snapshot and callback tests
- existing Phase 6A.1A through 6A.1D tests
- `git diff --check`

The complete focused run passed 51 tests.
