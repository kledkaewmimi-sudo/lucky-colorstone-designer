# Supabase Setup

This folder prepares the database schema for a future migration from JSON file storage to Supabase.

No runtime code is connected to Supabase yet. The current app still reads and writes through the existing `/api/*` routes and JSON files until the backend migration is implemented.

## Apply the Schema

1. Open the Supabase dashboard.
2. Select the Lucky Colorstone project, or create a new project if needed.
3. In the left navigation, open **SQL Editor**.
4. Create a new query.
5. Paste the contents of `supabase/schema.sql`.
6. Run the query.
7. Confirm these tables exist in the Table Editor:
   - `catalog_stones`
   - `catalog_charms`
   - `catalog_spacers`
   - `catalog_categories`
   - `app_settings`
   - `catalog_layout_order`
   - `orders`

The schema is JSONB-first. Each table keeps the full current record in `payload` or `value` so the existing app data shape can be preserved during the first backend migration.

## Security Model

Row Level Security is enabled for all tables, but no public read/write policies are created yet.

The next backend phase should access Supabase from `server.js` using the Supabase service role key. The service role key bypasses RLS and must only be used in trusted server environments.

Required future Render environment variables:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

Never place `SUPABASE_SERVICE_ROLE_KEY` in frontend code, Vercel public environment variables, `app.js`, `crm.js`, `data.js`, or any file served to browsers.

## Current JSON Files

These files remain the current source/fallback until backend migration is implemented:

- `data/stones.json`
- `data/charms.json`
- `data/orders.json`
- `data/settings.json`

After the backend is migrated, these JSON files should be treated as seed fixtures and emergency fallback data, not production runtime storage.

## Next Phase

The next phase should be a JSON migration script that:

1. Reads `data/stones.json` into `catalog_stones`.
2. Reads `data/charms.json` into `catalog_charms`.
3. Converts static spacer catalog records into `catalog_spacers`.
4. Reads `data/settings.json` into `app_settings` and `catalog_layout_order`.
5. Reads `data/orders.json` into `orders`.
6. Preserves each original record as JSONB in `payload` or `value`.

After data is migrated, update the backend API routes to read and write Supabase while keeping the existing `/api/*` response shapes stable for the customer app and CRM.
