# Product-card badge visual correction — local/UAT

## Scope

Presentation-only local/UAT change. No mapping identities, catalog data, products, images, assets, polling, checkout, backend, or production state changed. No commit, push, or deployment was performed.

## Root cause and correction

The previous bestseller string omitted the Thai final mark and sparkle in the source label; it was not only a CSS clipping problem. The corrected literal content is `ขายดี✨` (no intervening space). The new badge content is `ใหม่`.

The shared badge has been adjusted to **58px × 22px** with `line-height: 1.5`, a Thai-capable font fallback sequence, and `overflow: visible`. This gives Thai combining marks and the emoji vertical room without changing any card or grid dimensions. The bestseller treatment is deep red `#c8102e` with white text; lavender new treatment remains `#eee8ff`. The info control stacks above the decorative, pointer-inert badge.

## Files changed

- `product-card-badges.js`
- `index.css`
- `tests/product-card-badges-uat.test.mjs`
- `reports/ui/product-card-badges-visual-fix.md`

## Verification

- Focused tests assert codepoint-complete Thai labels, no whitespace before sparkle, red/lavender treatments, explicit shared dimensions, non-clipping CSS, and unchanged selection handlers.
- Local mobile visual verification is pending a local dev-server run; no UAT deployment is permitted for this correction.

## Deployment

**Not performed.** Production changes: **none**.