# Catalog Schema Alignment

## Scope

This document defines Phase 1 schema alignment for moving catalog source-of-truth responsibility into CRM without breaking the current customer frontend.

This phase is documentation only.

- No runtime code changes
- No pricing changes
- No charm behavior changes
- No order payload changes
- No renderer redesign

## Current State

### Frontend stone model

The customer app consumes stones from the shared API-backed `STONES` array.

Current stone record shape in practice:

```js
{
  id: "golden_rutile",
  name: "Golden Rutile Quartz",
  nameTh: "ไหมทอง",
  p4: 100,
  p6: 150,
  p8: 200,
  category: "wealth",
  meaning: "Attracts wealth, prosperity, and success in business.",
  meaningTh: "ดึงดูดความมั่งคั่ง โชคลาภ และความสำเร็จในหน้าที่การงาน",
  image: "assets/golden_rutile.png",
  color: "#E2C974",
  sizes: [4, 6, 8],
  inStock: true
}
```

Frontend usage in `app.js`:

- `id` identifies selected stones and order payload bead items.
- `name`, `nameTh`, `meaning`, `meaningTh`, `image`, `color` drive catalog cards, modal content, summary, and export displays.
- `category` drives Step 3 filter tabs.
- `p4`, `p6`, `p8` drive pricing through `getStonePriceForSize(...)`.
- `inStock` hides stones from the customer catalog.
- `sizes` exists in CRM and persisted JSON, but the current customer app does not enforce it in Step 3 because bead size is globally selected.

### Frontend charm model

The customer app consumes charms from static `CHARM_CATALOG` in `data.js`.

Current charm record shape in practice:

```js
{
  id: "px01",
  sku: "PX01",
  nameTh: "ปี่เซียะ PX01",
  nameEn: "Pi Xiu PX01",
  type: "pi_xiu",
  collection: "pixiu",
  image: "/assets/charms/pixiu/px01.png",
  sizeCm: 2.4,
  visualScale: 0.95,
  visualOffsetX: -0.01,
  visualOffsetY: 0,
  maxWidthRatio: 1,
  maxHeightRatio: 0.95,
  edgeFitMode: "horizontal_fill",
  targetWidthFillRatio: 1.02,
  contactInsetLeft: 0.14,
  contactInsetRight: 0.14,
  rotation: 0,
  anchor: "top",
  price: 490,
  meaningTh: "",
  meaningEn: "",
  inStock: true
}
```

Frontend usage in `app.js`:

- `id` is stored in `selectedCharmId`.
- `sku`, `nameTh`, `nameEn`, `type`, `sizeCm`, `price`, `image`, `inStock` drive charm selection, capacity reduction, pricing, summary, and order payload charm fields.
- Render-tuning fields drive Step 3 SVG and Step 4 showcase/hero placement through the shared charm render helper.
- `collection` is currently descriptive only.

### Current CRM data/editing model

CRM currently manages stones only.

Current CRM capabilities:

- Reads stones from `getSharedCatalog()`
- Writes stones through `saveSharedCatalog(...)`
- Deletes stones through `deleteSharedCatalog(...)`
- Renders inventory from the stone shape above
- Edits stone fields through a stone-only CRUD modal

Current editable stone fields in CRM:

- `id`
- `name`
- `nameTh`
- `p4`
- `p6`
- `p8`
- `category`
- `image`
- `color`
- `sizes`
- `inStock`
- `meaning`
- `meaningTh`

Current CRM limitations:

- No charm catalog CRUD
- No category master data CRUD
- No display-order management
- No active/inactive state beyond stone `inStock`
- No separation between business fields and render fields
- No normalized catalog entity model

## Schema Gap

The current split is uneven:

- Stones are API-backed and CRM-managed.
- Charms are static in frontend code and not CRM-managed.
- Categories exist as hardcoded UI constants, not shared catalog data.
- Ordering is implicit array order, not explicit `displayOrder`.
- Activation semantics are inconsistent: stones use `inStock`, charms use `inStock`, but the requested future model needs `isActive`.

### Migration risk

The main migration risk is mixing business-critical fields with renderer-only tuning fields without a stable schema boundary.

Specific risks:

- Frontend pricing depends on the current stone price field names (`p4`, `p6`, `p8`).
- Frontend category filters depend on current category keys (`wealth`, `love`, `calm`, `protection`, `all`).
- Charm capacity math depends on `sizeCm`.
- Charm pricing/order payload depends on current charm business fields.
- Renderer correctness depends on current charm tuning fields and defaults.
- CRM currently assumes stone-only records and would break if charms were forced into the same untyped shape.

## Proposed Normalized Schema

The safest Phase 1 target is a normalized catalog model with separate entity types for categories, stones, and charms, while preserving adapters for the current frontend shape.

## Category schema

```js
{
  id: "wealth",
  kind: "stone",
  slug: "wealth",
  nameEn: "Wealth & Luck",
  nameTh: "โชคลาภ/การงาน",
  displayOrder: 10,
  isActive: true
}
```

Notes:

- `id` should remain stable because frontend filters use stable keys.
- `kind` allows future separation such as stone categories vs charm collections if needed.
- `displayOrder` should define tab/card order explicitly.
- `isActive` should allow hiding a category without deleting it.

## Stone schema

```js
{
  id: "golden_rutile",
  entityType: "stone",
  sku: "ST-GOLDEN-RUTILE",
  slug: "golden_rutile",
  name: {
    en: "Golden Rutile Quartz",
    th: "ไหมทอง"
  },
  categoryId: "wealth",
  image: {
    primary: "assets/golden_rutile.png"
  },
  colorHex: "#E2C974",
  pricing: {
    p4: 100,
    p6: 150,
    p8: 200
  },
  availability: {
    sizesMm: [4, 6, 8],
    inStock: true,
    isActive: true
  },
  meaning: {
    en: "Attracts wealth, prosperity, and success in business.",
    th: "ดึงดูดความมั่งคั่ง โชคลาภ และความสำเร็จในหน้าที่การงาน"
  },
  displayOrder: 10
}
```

### Stone business fields

- `id`
- `entityType`
- `sku`
- `slug`
- `name.en`
- `name.th`
- `categoryId`
- `pricing.p4`
- `pricing.p6`
- `pricing.p8`
- `availability.sizesMm`
- `availability.inStock`
- `availability.isActive`
- `meaning.en`
- `meaning.th`
- `displayOrder`

### Stone presentation fields

- `image.primary`
- `colorHex`

Stones do not currently need renderer-tuning fields.

## Charm schema

```js
{
  id: "px01",
  entityType: "charm",
  sku: "PX01",
  slug: "px01",
  name: {
    en: "Pi Xiu PX01",
    th: "ปี่เซียะ PX01"
  },
  categoryId: "pixiu",
  type: "pi_xiu",
  collection: "pixiu",
  image: {
    primary: "/assets/charms/pixiu/px01.png"
  },
  pricing: {
    base: 490
  },
  business: {
    sizeCm: 2.4,
    footprintMm: 24
  },
  meaning: {
    en: "",
    th: ""
  },
  availability: {
    inStock: true,
    isActive: true
  },
  renderTuning: {
    visualScale: 0.95,
    visualOffsetX: -0.01,
    visualOffsetY: 0,
    maxWidthRatio: 1,
    maxHeightRatio: 0.95,
    edgeFitMode: "horizontal_fill",
    targetWidthFillRatio: 1.02,
    contactInsetLeft: 0.14,
    contactInsetRight: 0.14,
    rotation: 0,
    anchor: "top"
  },
  displayOrder: 10
}
```

### Charm business fields

- `id`
- `entityType`
- `sku`
- `slug`
- `name.en`
- `name.th`
- `categoryId`
- `type`
- `collection`
- `pricing.base`
- `business.sizeCm`
- `business.footprintMm`
- `meaning.en`
- `meaning.th`
- `availability.inStock`
- `availability.isActive`
- `displayOrder`

### Charm render-tuning fields

- `renderTuning.visualScale`
- `renderTuning.visualOffsetX`
- `renderTuning.visualOffsetY`
- `renderTuning.maxWidthRatio`
- `renderTuning.maxHeightRatio`
- `renderTuning.edgeFitMode`
- `renderTuning.targetWidthFillRatio`
- `renderTuning.contactInsetLeft`
- `renderTuning.contactInsetRight`
- `renderTuning.rotation`
- `renderTuning.anchor`

## Recommendations

### Category handling

Recommended model:

- Store categories as first-class CRM-managed records.
- Keep `id` values compatible with current frontend filters.
- Keep a separate category list for stone categories first.
- Charm categories can initially reuse `collection` values or get their own category set later.

Phase 1 recommendation:

- Introduce `categoryId` in schema.
- Keep current frontend `CATEGORIES` constants as a temporary adapter until CRM category endpoints exist.

### Display order handling

Recommended model:

- Every stone, charm, and category should have `displayOrder`.
- CRM should sort ascending by `displayOrder`, then by `name`.

Why:

- Current ordering is implicit array order and not safe once CRM becomes authoritative.
- Explicit ordering is required for stable catalog rendering and predictable merchandising.

### Active/inactive handling

Recommended model:

- Use `isActive` as the shared top-level publishing flag.
- Retain `inStock` as an inventory/availability flag.

Suggested semantics:

- `isActive = false`: hidden from customer-facing catalog and not selectable.
- `isActive = true`, `inStock = false`: visible in CRM, potentially hidden or disabled in frontend depending on final UX policy.

For backward compatibility in the current frontend:

- Map current frontend visibility to `isActive !== false && inStock !== false` for now.

## What should definitely live in CRM

### Stones

All current stone fields should live in CRM:

- identifiers
- names
- category assignment
- prices
- image reference
- color
- meanings
- size availability
- stock/active state
- display order

### Charms

These should definitely live in CRM as source-of-truth:

- `id`
- `sku`
- `name.en`
- `name.th`
- `categoryId`
- `type`
- `collection`
- `image.primary`
- `pricing.base`
- `business.sizeCm`
- `business.footprintMm`
- `meaning.en`
- `meaning.th`
- `availability.inStock`
- `availability.isActive`
- `displayOrder`

### Categories

These should live in CRM:

- `id`
- `kind`
- `slug`
- `name.en`
- `name.th`
- `displayOrder`
- `isActive`

## What can remain frontend-only temporarily

These can remain frontend-only during the transition if needed:

- Charm render helper defaults
- Charm tuning normalization rules
- Temporary `getCharmDisplayMeta(...)` override map
- Temporary static `CATEGORIES` constant as adapter data

These charm fields may also remain frontend-only temporarily if CRM Phase 2 does not yet include tuning UI:

- `renderTuning.visualScale`
- `renderTuning.visualOffsetX`
- `renderTuning.visualOffsetY`
- `renderTuning.maxWidthRatio`
- `renderTuning.maxHeightRatio`
- `renderTuning.edgeFitMode`
- `renderTuning.targetWidthFillRatio`
- `renderTuning.contactInsetLeft`
- `renderTuning.contactInsetRight`
- `renderTuning.rotation`
- `renderTuning.anchor`

However, the target end state should still move them into CRM-backed catalog storage, because they are per-item source-of-truth data, not renderer logic.

## Safest migration path

### Phase 1

Document and freeze the normalized schema.

- Keep current runtime untouched.
- Add schema documentation only.
- Identify adapters needed for backward compatibility.

### Phase 2

Add charm catalog persistence to the shared data layer.

- Introduce charm API storage without removing `CHARM_CATALOG` fallback.
- Keep the current order payload unchanged.
- Keep `data.js` able to hydrate charms from API or fallback static data.

### Phase 3

Introduce catalog adapters in `data.js`.

Adapters should convert normalized records into current frontend shapes:

- normalized stone -> current stone shape with `name`, `nameTh`, `p4`, `p6`, `p8`, `category`, `meaning`, `meaningTh`, `image`, `color`, `sizes`, `inStock`
- normalized charm -> current charm shape with `nameEn`, `nameTh`, `sizeCm`, `price`, plus current render-tuning fields

This preserves:

- current pricing logic
- current charm behavior
- current order payload
- current renderer expectations

### Phase 4

Extend CRM with read-only charm catalog visibility first.

- Show charm records in CRM
- Do not expose full CRUD yet
- Verify normalized records map cleanly into current frontend behavior

### Phase 5

Add limited CRM CRUD for charms and categories.

- Start with business fields and publish state
- Add render-tuning editing only after business schema is stable

### Phase 6

Migrate frontend from legacy field names to normalized access internally if desired.

This should be last, not first.

## Compatibility Rules During Migration

- Do not remove `p4/p6/p8` support until pricing code is deliberately migrated.
- Do not remove `sizeCm` support until charm capacity code is deliberately migrated.
- Do not change order payload fields in the migration bootstrap.
- Do not let CRM save partial charm records that omit required business fields.
- Do not mix render-tuning fields into stone records.

## Recommended next implementation phase

Phase 2 should be:

1. Add shared charm catalog persistence and API helpers in `data.js`
2. Keep `CHARM_CATALOG` as fallback
3. Add normalized-to-legacy adapter functions
4. Add CRM read-only charm catalog tab before any CRUD

That sequence has the lowest risk because it introduces source-of-truth storage first, while preserving the current frontend contract.
