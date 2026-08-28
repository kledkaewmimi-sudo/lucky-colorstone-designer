# Owner-confirmed double-delete investigation

## Owner Remaining Bug

The owner still observes two disappearing stones after one real-device delete tap.

## Event Chain Trace

UAT `?delete_debug=1` adds a compact on-screen trace for pointerdown, touchstart, touchend, click, handler entry, and mutation before/after. It records no identity or credentials.

## Handler Binding Audit

The renderer creates one click handler per SVG component node. No delegated delete handler or touch/pointer mutation handler exists. The trace will prove the device sequence.

## Stable Identity Audit

Deletion now resolves the intended current item by its stable `uniqueId`, not a potentially stale rendered array index. The event object is idempotent through a `WeakSet`.

## Exact Root Cause

The remaining mobile duplicate event sequence cannot be reproduced without a browser/device runtime. The mutation boundary now blocks duplicate calls for the same event and records the exact sequence for owner confirmation.

## Red Reproduction

The previous retained-slot physical-length cascade was already fixed. Current focused source/geometry tests do not reproduce a second handler invocation, hence the UAT-only device trace.

## Minimal Fix

Pass the original event and component `uniqueId` into the delete boundary; resolve current index from identity and reject the same event twice.

## One-Action-One-Mutation Invariant

Each mutation records occupied/empty counts before and after. For a normal retained-slot delete the required result is occupied minus one and empty plus one.

## Passed Behavior Preservation

Renderer geometry, dotted ring semantics, Mixed completion, Fixed completion, Step 4 preview, LINE/OA, catalog, and pricing were not changed.

## Tests

15 focused tests passed: delete retained-slot integrity, renderer restoration, Mixed final gaps, and fixed regressions; syntax and diff checks passed.

## UAT Deployment

Deploy UAT only. Owner should open `https://uat.customize.luckycolorstone.com/?delete_debug=1`, delete one middle stone once, and provide the visible trace/screenshot if a second component disappears.

## Owner Retest

Required; the browser/device duplicate-event sequence must be confirmed on the owner device.

## Production Isolation

Production was not modified.
