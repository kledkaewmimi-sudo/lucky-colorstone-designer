# Single Delete Duplicate Placeholder Root Fix — UAT

## Owner Forensic Evidence

The owner-exported desktop trace captured the shared runtime state after one deletion from a complete 17-stone bracelet: canonical and component list each contained 17 entries with 16 occupied and one empty, while resolved layout and SVG DOM each contained 18 entries: 16 stones and two placeholders. The desktop capture proves duplicate placeholder generation. It does not by itself prove mobile repaint behavior.

## Proven State Counts

Before deletion: canonical 17/17 occupied, resolved 17/17 occupied, DOM 17 stones, complete.

After one deletion before this change: canonical empty 1; component-list empty 1; resolved placeholders 2; DOM placeholders 2. The extra node is structural, not an angular rendering inference.

After this change: canonical empty 1; component-list empty 1; resolved placeholders 1; DOM placeholders 1.

## Retained vs Trailing Placeholder

`createBraceletComponentList()` converts the deleted sequence entry into an empty loop component. `createResolvedBraceletLayout()` converts that component into a placeholder with subtype `RETAINED_EMPTY` and its original source index.

Independently, the resolved-layout completion calculation was adding a `TRAILING_PLACEHOLDER` whenever physical length became incomplete. Following a delete, this produced both the retained placeholder and a trailing capacity placeholder.

## Exact Root Cause

`trailingPlaceholderCount` used only completion status. A retained empty slot reduces physical used length to zero by design, so completion becomes incomplete and the renderer appended a second add target even though the retained delete slot was already the replacement target.

## Minimal Fix

Only the resolved-layout semantic input changed: `trailingPlaceholderCount` is zero whenever `emptySlotCount > 0`, as well as when complete. The circular distribution, start angle, radius, node dimensions, physical-length semantics, and completion helpers are unchanged.

## Single Delete Contract

For 17 x 10mm, deleting source index 9 now produces 17 resolved/DOM nodes: 16 stones and one `RETAINED_EMPTY`; `TRAILING_PLACEHOLDER` is zero. Re-adding 10mm consumes the retained source position and returns empty and placeholder counts to zero when complete.

## Multi-Delete Contract

Two deletes produce 15 occupied components, two retained empties, and zero trailing placeholders. One re-add leaves 16 occupied, one retained empty, and zero trailing placeholders. A second re-add restores 17 occupied and no placeholders. Existing first-retained-slot placement ordering remains unchanged.

## Mixed Regression

A realistic 170mm Mixed 4/6/10 sequence remains complete under the existing target-minus-5mm rule. Removing a retained 10mm component produces one retained placeholder and no trailing placeholder despite temporary under-completion. Re-adding it restores complete status and no placeholders. The 1/2/3mm final-gap behavior was not changed.

## Re-add Regression

Existing retained-slot identity behavior is preserved: additions consume the first retained slot before append and keep its stable `uniqueId`. Re-add tests cover same, smaller, and legal larger physical sizes without changing geometry rules.

## Tests

Passed: `node --check app.js`; 23 targeted Node tests covering the new duplicate-placeholder contract, existing slot forensics, retained-slot re-add, Fixed completion, Mixed completion/final gaps, and renderer invariants; `git diff --check`.

## UAT Deployment

The diagnostic/root fix is committed and deployed only to the isolated UAT project.

## Owner Real-Device Retest

Owner mobile retest is required. Confirm after one delete: 17 DOM nodes, 16 stones, one dotted retained slot, and no second trailing add target. Then re-add and confirm the slot is consumed and no placeholder remains when complete.

## Production Isolation

Only `uat` is changed. Production code, deployment, payment, pricing, LINE/OA, catalog, and Step 2/Step 4 behavior are unchanged.
