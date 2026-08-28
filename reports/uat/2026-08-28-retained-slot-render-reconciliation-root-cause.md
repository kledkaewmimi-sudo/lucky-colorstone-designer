# Retained-slot render reconciliation investigation

## Owner Evidence After Previous Fix

Owner device testing of `c9bf04a` still showed a dotted slot after a successful re-add.

## Why Previous Fix Was Insufficient

Source/state tests showed the re-add as occupied, but they did not inspect the real mobile SVG DOM.

## Four-Layer State Trace

`?slot_debug=1` records canonical slot kind, component-list kind, resolved kind, and rendered SVG `data-slot-kind` for each source index after every render.

## First Divergence Layer

Unknown until the owner device captures the four-layer trace. The local environment has no controllable browser runtime.

## Slot Identity vs Component Identity

The current candidate preserves slot identity on replacement while retaining a new component payload. The trace exposes both layer kinds without identity or customer data.

## Renderer Cache/Reconciliation Audit

No SVG node reuse cache exists: `renderBraceletCanvas()` clears and rebuilds SVG children on each render. The instrumentation identifies whether an expected render was skipped or a pre-render layer remains empty.

## Exact Root Cause

Not yet proven on device.

## Minimal Fix

No additional behavioral fix was applied. This UAT-only diagnostic adds non-visible data attributes and a debug-only panel.

## DOM-Level Red/Green Test

Existing source/geometry tests remain green; device DOM evidence is required for the mobile-only divergence.

## Multi-Slot Re-Add

Current tests cover first-empty consumption before append.

## Passed Regression Preservation

Completion, dotted geometry, fixed behavior, charm preview, sticky, catalog, pricing, and LINE/OA were not changed.

## UAT Deployment

Owner test URL: `https://uat.customize.luckycolorstone.com/?slot_debug=1`. Delete the middle stone in `10,10,6`, re-add 4mm, then screenshot the panel.

## Owner Retest

Required before an actual renderer correction.

## Production Isolation

Production was not modified.
