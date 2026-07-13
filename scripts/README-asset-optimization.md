# Asset WebP Optimization

This workflow creates optimized `.webp` copies of existing catalog images under `assets/`.

It does not delete or modify the original `.png`, `.jpg`, or `.jpeg` files. Current catalog paths should keep using the original files until a later migration updates the catalog data safely.

## Install Dependencies

The real conversion uses `sharp`.

```bash
npm install
```

## Dry Run

Preview which files would be converted without writing anything:

```bash
node scripts/optimize-assets-to-webp.js --dry-run
```

## Real Conversion

Create `.webp` files beside each source image:

```bash
node scripts/optimize-assets-to-webp.js
```

Example output:

```text
assets/amethyst.png -> assets/amethyst.webp (1.60 MB -> 90.12 KB, saved 1.51 MB)
```

## Force Regeneration

By default, the script skips a `.webp` file when it already exists and is newer than the source image. Regenerate everything with:

```bash
node scripts/optimize-assets-to-webp.js --force
```

## Generated Files

The script:

- recursively scans `assets/`
- converts `.png`, `.jpg`, and `.jpeg`
- skips existing `.webp` source files
- writes the generated `.webp` beside each original image
- resizes large images to fit within `800px x 800px`
- uses WebP quality `82`

## Git Guidance

After conversion, review generated files before committing:

```bash
git status --short assets
```

Add generated `.webp` files carefully. Do not delete PNG/JPG originals until every catalog path that needs WebP has been migrated and verified in the customer app and CRM.

## Next Phase

After the WebP files are generated and reviewed, migrate catalog image paths in a separate phase. That phase should update only the intended stone/charm/spacer records and verify CRM Inventory plus the customer designer still render all images.
