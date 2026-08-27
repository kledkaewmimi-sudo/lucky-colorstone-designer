# UAT catalog update: new stones and Amethyst image

## Scope and asset discovery

UAT-only catalog preparation found five of the six required assets: `Blue Cat eye.png`, `Gold sand stone.png`, `Silver sand stone.png`, `Amethyst quartz.png`, and replacement `amethyst.png`. No Blue Agate PNG exists, so Blue Agate is deliberately not inserted.

## Catalog records

Prepared UAT inserts: `blue_cat_eye` (6mm/19), `gold_sand_stone` (6mm/20), `silver_sand_stone` (6mm/20), and `amethyst_quartz` (6mm/32, 10mm/59). They use the existing `calm` category and explicit neutral owner-meaning-pending text; owner marketing meanings remain required before promotion.

Existing stable `amethyst` is updated only from `assets/amethyst.webp` to `assets/amethyst.png`; its ID, category, meanings, display order, sizes `[4,6,10]`, and prices 20/29/50 are unchanged.

## Promotion manifest and safety

`reports/catalog/uat-catalog-promotion-manifest.json` contains only four INSERTs and the Amethyst IMAGE_ONLY_CHANGE UPDATE; it has no DELETE and remains `DRAFT_OWNER_MEANING_PENDING`. No production SQL was executed.

## UAT catalog writes and live read-back

After the UAT Vercel deployment was Ready, the live UAT catalog API accepted only the four valid new records and existing Amethyst update (HTTP 200 each). `GET /api/stones` read back exact IDs, names, Thai names, sizes, prices, and image paths. The live count is 37: 32 seeded baseline + retained QA record + four valid additions. Blue Agate is not present.

All five deployed asset paths returned HTTP 200 from `https://uat.customize.luckycolorstone.com/`.

## Tests and remaining live work

The focused catalog contract test passed, as did `node --check app.js`, `node --check server.js`, and `git diff --check`. UAT Vercel is Ready; Render is not required. Step 3 visual/renderer interaction remains for owner real-device QA, along with supplying a Blue Agate PNG and marketing meanings before promotion. Production remains untouched.
