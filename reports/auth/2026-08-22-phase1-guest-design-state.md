# Phase 1: guest design state persistence foundation

**Date:** 2026-08-22

## Scope and production safety

This phase adds dormant, testable client-side snapshot helpers only. No current code path calls the helpers. Mobile customers still authenticate through LINE before Step 1, the desktop bypass is unchanged, and no login UI, analytics event, server route, Supabase record, payment flow, CRM flow, renderer, or catalog behavior changed.

## Canonical state inventory

| State | Classification | Snapshot treatment |
| --- | --- | --- |
| `wristSize` | CANONICAL | Persist. |
| `beadSize` | CANONICAL | Persist. |
| Ordered `selectedStones` components | CANONICAL | Persist as minimal ordered `components`: empty, stone ID, slot-placeable charm ID, or spacer ID. Empty slots are retained to preserve placement order. |
| `selectedCharmIds` | CANONICAL | Persist for anchored charm selection order. |
| `currentStep` | TRANSIENT return target | Persist as bounded snapshot metadata (Steps 1–3 only), not as customer identity. |
| `mixedPlacingSize` | DERIVED / legacy compatibility | Exclude; derive from bead size. |
| Component sizes, spacer footprint, charm footprint | DERIVED | Exclude; resolve from current bead size/catalog. |
| `uniqueId`, `uniqueCounter`, `newlyAddedIds`, active slot/category/section | TRANSIENT | Exclude; regenerate/reinitialize. |
| ResolvedLayout, geometry, pixel coordinates, canvas/DOM output | DERIVED renderer output | Exclude. |
| Beryl image/layer/animation state | DERIVED | Exclude; derive from restored component occurrence order. |
| Discount, prices, totals, preview image/key | DERIVED / server-authoritative | Exclude. |
| Owner name, shipping information, LINE user ID/profile/LIFF state | AUTH-RELATED or PII | Exclude. |
| Visitor/session IDs, UTM/source attribution, Meta identifiers | ANALYTICS-RELATED | Exclude; existing analytics storage remains authoritative. |

## Snapshot format and storage

- **Storage key:** `lucky_colorstone_guest_design_snapshot`
- **Schema version:** `1`
- **TTL:** two hours (`7,200,000 ms`), selected to comfortably cover an OAuth redirect/retry while limiting stale browser state.
- **Maximum payload:** 32 KiB; maximum 240 ordered components and two anchored charms.

Schema:

```json
{
  "version": 1,
  "savedAt": 1760000000000,
  "expiresAt": 1760007200000,
  "step": 3,
  "design": {
    "wristSize": 16,
    "beadSize": "6",
    "selectedCharmIds": ["gold-anchor"],
    "components": [
      { "type": "stone", "id": "beryl" },
      { "type": "spacer", "id": "silver-spacer" },
      { "type": "empty" }
    ]
  }
}
```

The implementation uses a dedicated key and does not alter or delete `lucky_colorstone_state`.

## Validation and catalog reconciliation

Parsing rejects malformed JSON, oversized payloads, unsupported versions, invalid timestamps/TTL, unsupported steps, unsupported bead sizes, wrist sizes outside the existing 14.0–20.0 half-centimetre choices, unknown component types, invalid IDs, excessive component/charm counts, and structurally invalid arrays.

On restore, supplied current catalog IDs reconcile the snapshot. Removed/unavailable stones, charms, and spacers are skipped; remaining components retain their original order. Slot components must also be recognized as slot-placeable charms. The helper returns skipped IDs for DEV diagnostics but does not display UI or change the current flow. Storage exceptions are caught and return a safe `storage_unavailable` result.

## Beryl, renderer, and pricing safety

The snapshot stores Beryl only as the ordinary stone ID in the ordered list. It does not store a color. Reconstructing occurrences through the existing `getBerylVisualImage()` rule produces Green, Pink, Blue, Green for occurrences 1–4. ResolvedLayout and all renderer geometry remain untouched and are recomputed from current canonical state.

No price, discount, total, preview, or catalog data is stored in the snapshot. A future restore therefore feeds the normal application state and must use existing catalog/business-rule calculations and server-authoritative Stripe validation; it cannot trust a client-supplied price.

## Privacy review

The snapshot contains no LINE access token, LINE user ID, display name, email, phone, shipping information, Stripe data, Supabase credential, raw IP, Meta identifier, visitor ID, session ID, or UTM/source payload. It is bracelet design data only.

## Tests and representative size

`tests/guest-design-state.test.mjs` covers simple and complex round trips, component ordering, anchored charms, spacers, repeated stones, four Beryl occurrences, pricing exclusion, corrupt JSON, expiration, unsupported version, unknown catalog items, storage exceptions, and a representative 30-component payload. The representative payload is asserted below 4 KiB (well below the 32 KiB hard ceiling); no image, catalog, or renderer binary is serialized.

Existing Beryl tests continue to verify the catalog sequence and renderer integration. No renderer calculation was edited.

## Phase 2 prerequisites and limitations

This local snapshot is deliberately dormant and is not an OAuth recovery solution by itself. Phase 2 should introduce the documented hybrid server handoff: a short-lived, opaque, random token and temporary server-side canonical snapshot, paired with this minimized local snapshot for same-context recovery. It must carry no raw design/PII in a URL, be parsed before OAuth parameter cleanup, use TTL/idempotency, preserve the existing analytics identity architecture, and be tested in Instagram, LINE, Chrome Android, and Safari iOS contexts.

No server handoff was implemented in Phase 1 because it would add a production route/state lifecycle without an active gate to exercise it safely.
