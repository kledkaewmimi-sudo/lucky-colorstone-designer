# Product-card badges — UAT

## Scope

UAT-only presentation change. No catalog data, pricing, stock, availability, images, ordering, backend behavior, checkout, analytics, or polling code was changed.

## Stable matches

| Badge | Catalog identity | Size |
|---|---|---:|
| ขายด | `golden_rutile` | 10 mm |
| ขายด | `moonstone` | 10 mm |
| ขายด | `carnelian` | 10 mm |
| ขายด | `amethyst` | 6 mm |
| ขายด | `cherry_quartz` | 6 mm |
| ขายด | `lapis_lazuli` | 6 mm |
| ขายด | `golden_rutile` | 4 mm |
| ขายด | `tigers_eye` | 4 mm |
| ใหม | `green_jade` | 6 mm |
| ใหม | charm SKU `CL01` / id `cl01` | n/a |

Unmatched exactly: 4 mm Silver Sand Stone (`silver_sand_stone`) is not available in UAT catalog metadata; only 6 mm exists. It remains unbadged.

## Implementation

- `product-card-badges.js` contains a size-qualified stable ID allowlist.
- `app.js` passes the current catalog bead size for stones and the stable charm ID for charms.
- The shared `.product-badge` base is exactly 58 × 22 px, absolutely positioned on the top-left edge with `pointer-events: none`; it cannot change card dimensions or intercept a tap.
- Bestseller uses a distinct brown/gold treatment. New uses a soft lavender background (`#eee8ff`).

## Verification

- Focused tests verify every matched bestseller, unlisted sizes, Green Jade, Lucky Clover, other unbadged products, shared dimensions, and unchanged selection handlers.
- `node --check app.js`: PASS.
- `git diff --check`: PASS.
- Mobile 390 × 844 verification: PASS. Step 3 at 6 mm rendered five expected badges (three bestseller, Green Jade new, Lucky Clover new), with no horizontal overflow. An Amethyst card remained selectable on tap. No HTTP errors were observed.

## Files changed

- `app.js`
- `index.css`
- `product-card-badges.js`
- `tests/product-card-badges-uat.test.mjs`
- `reports/ui/product-card-badges-uat.md`

## Deployment

UAT deployment: `https://lucky-colorstone-b09cpqbfm-lucky-colorstone.vercel.app` (Ready; commit `c8ed865`). Production deployment: **not performed**.