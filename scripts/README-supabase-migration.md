# Supabase JSON Migration

This one-time script imports the current JSON-backed data into the Supabase tables prepared by `supabase/schema.sql`.

It does not change runtime API behavior. The app and CRM will continue using the existing `/api/*` routes until a later backend migration updates `server.js`.

## Dependency

The script uses `@supabase/supabase-js`.

Install it if it is not already installed:

```powershell
npm install @supabase/supabase-js
```

Do not commit secrets or place Supabase service-role credentials in frontend code.

## Required Environment Variables

Real migration mode requires:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

`SUPABASE_URL` must be the project root URL, for example `https://your-project.supabase.co`. Do not use the REST endpoint URL ending in `/rest/v1`.

The service-role key bypasses Row Level Security. Use it only locally or in trusted backend environments. Never put it in `app.js`, `crm.js`, `data.js`, Vercel public variables, static HTML, or any browser-served file.

PowerShell example:

```powershell
$env:SUPABASE_URL="https://your-project.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

## Dry Run

Dry-run mode reads all source files, extracts static spacers and default categories from `data.js`, and prints table counts without writing to Supabase.

```powershell
node scripts/migrate-json-to-supabase.js --dry-run
```

Use this first to confirm source files and row counts.

To print target table names during a real migration without changing behavior, add `--verbose`:

```powershell
node scripts/migrate-json-to-supabase.js --verbose
```

## Real Migration

After setting the required environment variables:

```powershell
node scripts/migrate-json-to-supabase.js
```

The script uses upsert operations and does not delete existing Supabase rows.

## Sources

The script imports:

- `data/stones.json` into `catalog_stones`
- `data/charms.json` into `catalog_charms`
- static `SPACER_CATALOG` from `data.js` into `catalog_spacers`
- `settings.catalogCategories` from `data/settings.json`, or default categories from `data.js`, into `catalog_categories`
- top-level `data/settings.json` keys into `app_settings`
- `settings.catalogLayoutOrder`, or an empty default layout, into `catalog_layout_order`
- `data/orders.json` into `orders` if present

Each original record is preserved in the destination `payload` or `value` JSONB column.

## Verify in Supabase

1. Open the Supabase dashboard.
2. Select the project.
3. Open **Table Editor**.
4. Check row counts for:
   - `catalog_stones`
   - `catalog_charms`
   - `catalog_spacers`
   - `catalog_categories`
   - `app_settings`
   - `catalog_layout_order`
   - `orders`
5. Spot-check JSONB `payload` or `value` columns to confirm Thai text, image paths, pricing, Stripe fields, LINE fields, and order data are preserved.

## Next Step

After verifying migrated data, the next phase is updating backend API routes in `server.js` to read and write Supabase while preserving existing `/api/*` response shapes for the customer app and CRM.
