# Retained-slot re-add visual synchronization

## Owner Corrected Bug Description

After one delete and one re-add, the replacement was counted and checkout could proceed, but the old retained dotted slot remained visible.

## Why This Is Not Double Delete

The delete created one retained slot. The defect occurred when a replacement was accepted: it used a fresh component identity while the visual retained slot kept the original identity.

## Canonical State Trace

`10, 10, 6` becomes `10, EMPTY(slot 2), 6`; re-adding 4mm now becomes `10, 4(slot 2), 6` with zero empty entries.

## ResolvedLayout Trace

The consumed array entry is a stone with slot identity 2, so `createBraceletComponentList()` emits a component node rather than an empty placeholder node at source index 1.

## Exact Divergence Point

The direct add paths overwrote the retained array position with a newly generated `uniqueId` instead of consuming the retained slot identity.

## Root Cause

Canonical position was replaced, but stable visual identity was not. The renderer rebuild therefore had a stale slot identity path.

## Minimal Fix

All retained-slot replacement paths preserve the retained entry's `uniqueId` before replacement. Append remains possible only when no retained empty slot exists.

## Slot Identity Invariant

An empty slot is either empty/dotted/zero physical length or replaced/occupied/new physical footprint; it cannot remain both.

## Multi-Delete Re-Add Tests

Tests cover 10-to-10/6/4 replacement and first-empty consumption before append for multiple retained slots.

## Completion Preservation

Mixed target-minus-five through target completion was not changed.

## Passed Regression Preservation

Renderer geometry, dotted ring, fixed completion, Step 4 charm preview, sticky, catalog, LINE/OA, and pricing were not changed.

## UAT Deployment

Pending controlled UAT deployment.

## Owner Retest

Required before production promotion.

## Production Isolation

Production was not modified.
