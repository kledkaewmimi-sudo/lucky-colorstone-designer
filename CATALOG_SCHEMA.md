# Catalog Schema Alignment

## Scope

This document defines the normalized catalog model used by CRM, the customer app, and the shared adapters.

The implementation goal is to keep the current frontend working while moving catalog master data into CRM-backed persistence.

- No pricing changes
- No order payload changes
- No renderer redesign
- Render tuning stays separate from business data

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

CRM now manages stones, charms, and shared categories through the shared persistence layer.

Current CRM capabilities:

- Reads stones from `getSharedCatalog()`
- Writes stones through `saveSharedCatalog(...)`
- Deletes stones through `deleteSharedCatalog(...)`
- Reads charms from `getSharedCharmCatalog()`
- Writes charms through `saveSharedCharmCatalogEntry(...)`
- Deletes charms through `deleteSharedCharmCatalogEntry(...)`
- Reads and writes shared categories through `getSharedCategoryCatalog(...)`, `saveSharedCategoryCatalogEntry(...)`, and `deleteSharedCategoryCatalogEntry(...)`
- Renders inventory and catalog tables from normalized data while keeping render tuning read-only

Current editable stone fields in CRM:

- `id`
- `name`
- `nameTh`
- `p4`
- `p6`
- `p8`
- `category`
- `categoryId`
- `image`
- `color`
- `sizes`
- `inStock`
- `meaning`
- `meaningTh`

Current editable charm business fields in CRM:

- `id`
- `sku`
- `nameTh`
- `nameEn`
- `type`
- `collection`
- `categoryId`
- `image`
- `sizeCm`
- `price`
- `meaningTh`
- `meaningEn`
- `inStock`
- `isActive`
- `displayOrder`

Current CRM limitations:

- Render tuning remains read-only
- Category IDs are intentionally stable to protect catalog references
- Customer-facing render logic still relies on adapters for compatibility

### Image handling

Image fields are treated as URL or asset-path strings in both CRM forms:

- Stone records keep a single `image` string
- Charm records keep `image.primary`

CRM should preview the current image, allow paste/replace of the URL or asset path, and fall back safely when the URL is broken or empty. Local repo asset paths remain valid for development and seeded data.

Production-safe uploads should target external storage or hosted media URLs, then persist the returned URL in the catalog record. CRM must not attempt to write uploaded files into the Git repo assets folder from production/mobile sessions.

The upload flow is now routed through `/api/uploads/image`, which expects these deployment variables when production upload is enabled:

- `IMAGE_UPLOAD_ENDPOINT`
- `IMAGE_UPLOAD_METHOD` `POST` by default
- `IMAGE_UPLOAD_FILE_FIELD` `file` by default
- `IMAGE_UPLOAD_RESPONSE_URL_FIELD` `secure_url` by default
- `IMAGE_UPLOAD_EXTRA_FIELDS_JSON` for provider-specific extra form fields
- `IMAGE_UPLOAD_AUTH_HEADER` and `IMAGE_UPLOAD_AUTH_VALUE` for authenticated providers

### Upload contract summary

- CRM sends a JSON payload containing `entityType`, `fileName`, `mimeType`, and `dataUrl`.
- The proxy only accepts `image/*` content.
- The external upload service must accept multipart form data.
- The proxy reads the returned URL from the response path configured by `IMAGE_UPLOAD_RESPONSE_URL_FIELD`.
- If the provider returns nested URL data, set `IMAGE_UPLOAD_RESPONSE_URL_FIELD` to a dotted path such as `data.url` or `result.secure_url`.
- Manual URL entry remains a valid fallback for both stones and charms.

## Schema Gap

The current split is now more balanced, but the schema still needs to stay normalized:

- Stones are API-backed and CRM-managed.
- Charms are backend-backed and CRM-managed for business fields.
- Categories are shared master data stored in CRM-backed settings.
- Ordering is explicit through `displayOrder`.
- Activation semantics are still mixed in the customer app, so the normalized schema keeps `isActive` separate from `inStock`.

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
  entityType: "stone",
  slug: "wealth",
  nameEn: "Wealth & Luck",
  nameTh: "โชคลาภ/การงาน",
  displayOrder: 10,
  isActive: true
}
```

Notes:

- `id` should remain stable because frontend filters use stable keys.
- `entityType` separates stone categories from charm categories while keeping one shared catalog store.
- `displayOrder` should define tab/card order explicitly.
- `isActive` should allow hiding a category without deleting it.
- Category records are stored in shared settings and surfaced through CRM-managed adapters.
- Frontend code should treat missing category references as recoverable and show an explicit fallback label instead of failing.

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

- Store categories as first-class CRM-managed records in shared settings.
- Keep `id` values compatible with current frontend filters and item references.
- Use one shared category catalog with an `entityType` scope of `stone` or `charm`.
- Keep `displayOrder` and `isActive` on every category record.

Current implementation:

- Keep the customer `CATEGORIES` map as a legacy adapter derived from active stone categories.
- Keep charm `collection` aligned to the managed charm category id for compatibility.

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
