# Real retained empty-slot leak

## Owner Device Reproduction

Owner device showed a dotted node after re-add despite accepted state and completion.

## Realistic Bracelet Reproduction

17×10mm Mixed components use 170mm of a 175mm target: complete under the approved target-minus-five rule, but the prior layout added one 4mm trailing placeholder from the 5mm physical remainder.

## Count Trace By Layer

Canonical/component-list/resolved retained empties are zero after re-add. The remaining visual dotted node was a trailing-capacity placeholder, not a retained deletion slot.

## Full Slot Trace

The realistic red test verifies an 18-slot delete/re-add preserves total slot count and transitions empty counts 0 → 1 → 0.

## Add Path Audit

Add paths replace the first retained empty before append. No append occurs while a retained slot exists.

## Retained vs Trailing Placeholder

Retained placeholders come from empty loop components; trailing placeholders were generated independently from `floor(spaceLeft / placingSize)`.

## Exact Divergence Point

ResolvedLayout trailing-placeholder generation.

## Exact Root Cause

Trailing capacity placeholders remained generated after Mixed entered its complete target-minus-five interval, visually imitating an unconsumed retained slot.

## Minimal Fix

Trailing placeholder count is zero when completion eligibility is complete. Renderer geometry and retained-slot behavior are unchanged.

## Post-Add Invariant

For a retained re-add, empty counts transition 1 → 0 without increasing total slots.

## Regression Matrix

19 focused tests passed, including realistic 17×10 completion, retained re-add identity, multi-empty consumption, fixed completion, and final-gap regressions.

## UAT Deployment

Pending controlled UAT deployment.

## Owner Retest

Required before production promotion.

## Production Isolation

Production was not modified.
