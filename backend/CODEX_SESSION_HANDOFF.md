# Lucky Colorstone — Codex Session Handoff

## Report archive rule

For major audits, production investigations, launch checks, analytics reviews, or long final reports, save the full final report under `reports/<category>/` using the dated Markdown name `YYYY-MM-DD-short-report-name.md` before printing a condensed terminal summary. Use the appropriate category (`analytics`, `payments`, `launch`, or `security`), do not overwrite an existing report (append `-02`, `-03`, and so on when needed), and keep the terminal response concise with a link to the saved report. Do not automatically save trivial implementation reports. Never archive production backups, secrets, customer PII, raw IP addresses, raw exports, service-role keys, Stripe secrets, or LINE secrets.

## 1. Current task goal

Extend CRM > Purchases from stone-only logging to four purchase types while preserving all existing purchase rows and avoiding changes to selling prices, storefront prices, orders, stock, Stripe, and stone-size rules.

Internal types and visible labels:

| Internal `item_type` | Thai label | Catalog source |
| --- | --- | --- |
| `stone` | หิน | `catalog_stones` |
| `charm` | เครื่องราง | `catalog_charms` |
| `spacer` | ชาร์ม | `catalog_spacers` |
| `other` | อื่น | Free-text only |

`size_mm` is only applicable to `stone`, and only accepts 4, 6, or 10.

## 2. What has already been implemented

- Added Purchases type tabs for หิน / เครื่องราง / ชาร์ม / อื่น.
- Made the form adapt to the selected type:
  - `stone`: catalog selector, 4mm/6mm/10mm size selector, bead quantity.
  - `charm`: `catalog_charms` selector, unit quantity, no size selector.
  - `spacer`: `catalog_spacers` selector, unit quantity, no size selector.
  - `other`: required free-text name, unit quantity, no catalog selector or size selector.
- Added item type badges in history, all-category KPI totals, item/category summaries, and category filtering.
- Updated server-side validation and `/api/purchases` writes to use `item_type`, `catalog_item_id`, and `item_name_snapshot`.
- Kept `stone_id`, `stone_name_snapshot`, and `size_mm` in the database for legacy stone-row compatibility; new non-stone rows write these legacy fields as `NULL`.
- Updated the tracked Supabase schema with an additive migration design. No table or purchase rows are dropped.

## 3. Files changed

- `crm.html` — Purchases tabs, adaptive form controls, filters, KPI/summary containers.
- `crm.css` — compact responsive tabs, filters, and purchase-history badge styles.
- `crm.js` — adaptive forms, CRUD editing, filters, KPI/history/summary rendering.
- `server.js` — generalized purchase validation and catalog lookup by `item_type`.
- `supabase/schema.sql` — additive generalized-purchase schema migration and indexes.

## 4. Supabase/schema changes

The existing `public.stone_purchase_entries` table remains the single purchase system.

New generalized columns:

- `item_type text` (`stone`, `charm`, `spacer`, `other`)
- `catalog_item_id text` (nullable only for `other`; logical polymorphic ID, deliberately not a foreign key)
- `item_name_snapshot text` (required)

Existing stone-only columns are retained but made nullable so non-stone rows are valid:

- `stone_id`
- `stone_name_snapshot`
- `size_mm`

Historical stone rows are backfilled as:

- `item_type = 'stone'`
- `catalog_item_id = stone_id`
- `item_name_snapshot = stone_name_snapshot`
- existing `size_mm` is preserved

## 5. SQL migration still required

**Manual Supabase SQL execution is required before production Purchases writes can be used.** The pushed CRM/backend code sends the new generalized columns, so do not use Purchases create/edit on production until the migration below succeeds.

## 6. COMPLETE latest SQL migration block

Paste this entire block into Supabase SQL Editor and execute it as one transaction:

```sql
begin;

alter table public.stone_purchase_entries
  add column if not exists item_type text default 'stone';

alter table public.stone_purchase_entries
  add column if not exists catalog_item_id text;

alter table public.stone_purchase_entries
  add column if not exists item_name_snapshot text;

-- Retain old stone columns for backward compatibility, but allow non-stone rows.
alter table public.stone_purchase_entries
  alter column stone_id drop not null;

alter table public.stone_purchase_entries
  alter column stone_name_snapshot drop not null;

alter table public.stone_purchase_entries
  alter column size_mm drop not null;

-- Map every historical stone purchase into the generalized record shape.
update public.stone_purchase_entries
set
  item_type = coalesce(item_type, 'stone'),
  catalog_item_id = coalesce(catalog_item_id, stone_id),
  item_name_snapshot = coalesce(item_name_snapshot, stone_name_snapshot)
where
  item_type is null
  or catalog_item_id is null
  or item_name_snapshot is null;

alter table public.stone_purchase_entries
  alter column item_type set not null;

alter table public.stone_purchase_entries
  alter column item_name_snapshot set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'stone_purchase_entries_item_type_check'
  ) then
    alter table public.stone_purchase_entries
      add constraint stone_purchase_entries_item_type_check
      check (item_type in ('stone', 'charm', 'spacer', 'other'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'stone_purchase_entries_item_reference_check'
  ) then
    alter table public.stone_purchase_entries
      add constraint stone_purchase_entries_item_reference_check
      check (
        (item_type = 'other' and catalog_item_id is null)
        or
        (item_type <> 'other' and catalog_item_id is not null)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'stone_purchase_entries_item_size_check'
  ) then
    alter table public.stone_purchase_entries
      add constraint stone_purchase_entries_item_size_check
      check (
        (item_type = 'stone' and size_mm in (4, 6, 10))
        or
        (item_type <> 'stone' and size_mm is null)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'stone_purchase_entries_quantity_check'
  ) then
    alter table public.stone_purchase_entries
      add constraint stone_purchase_entries_quantity_check
      check (quantity > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'stone_purchase_entries_total_cost_check'
  ) then
    alter table public.stone_purchase_entries
      add constraint stone_purchase_entries_total_cost_check
      check (total_cost >= 0);
  end if;
end;
$$;

create index if not exists idx_stone_purchase_entries_type_date
  on public.stone_purchase_entries (item_type, purchased_at desc);

create index if not exists idx_stone_purchase_entries_catalog_item
  on public.stone_purchase_entries (catalog_item_id, size_mm);

-- Preserve service-role-only backend access.
alter table public.stone_purchase_entries enable row level security;

-- Reuse the existing updated_at trigger function when the trigger is absent.
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'set_stone_purchase_entries_updated_at'
      and tgrelid = 'public.stone_purchase_entries'::regclass
  ) then
    create trigger set_stone_purchase_entries_updated_at
    before update on public.stone_purchase_entries
    for each row execute function public.set_updated_at();
  end if;
end;
$$;

commit;
```

## 7. Production changes already completed

- Source changes are committed and pushed to `origin/main`.
- No production Supabase migration has been executed from this session.
- No production UI/browser verification occurred from this session.

## 8. Git commit hashes

- `faec367 Extend CRM purchases to all categories`
- `f672504 Align purchase types with catalog entities`

Current branch state when this handoff was created: `main...origin/main` with no tracked code changes pending.

## 9. Git push status

Push succeeded:

```text
origin/main: faec367..f672504
```

The only untracked working-tree entry is `production-backups/`; it was pre-existing/unrelated and was not staged, committed, or pushed.

## 10. Tests already run and results

- `node --check crm.js` — passed.
- `node --check data.js` — passed.
- `node --check server.js` — passed.
- `node --check app.js` — passed.
- `git diff --check` — passed before both commits.
- Local server smoke check: `GET http://127.0.0.1:8000/crm.html` returned HTTP 200 and the new Purchases markup was present.
- No lint/build scripts exist beyond `npm start` in `package.json`.
- Browser runtime was unavailable, so no visual verification at 375px/390px/430px and no real Supabase CRUD verification was performed.

## 11. Remaining issues

- The manual Supabase migration above is not yet confirmed as executed in production.
- Until it is executed, create/edit Purchases requests from the pushed generalized code can fail because production lacks the new columns.
- The actual production catalog contents and all four category CRUD flows still need live verification.
- Responsive visual QA at 375px, 390px, and 430px remains outstanding.
- `production-backups/` remains untracked and should stay out of commits unless explicitly requested.

## 12. What the owner needs to do manually next

1. Open the correct production Supabase project > SQL Editor.
2. Run the complete SQL block in section 6 as one transaction.
3. Confirm it succeeds without errors.
4. Open `https://crm.luckycolorstone.com/` and test Purchases:
   - Existing stone history is still visible.
   - Create/edit/delete one `stone` row using 4mm, 6mm, or 10mm.
   - Create/edit/delete one `charm` (เครื่องราง) row.
   - Create/edit/delete one `spacer` (ชาร์ม) row.
   - Create/edit/delete one `other` free-text row.
5. Confirm KPI, filters, summaries, and mobile layouts behave correctly.

## 13. What Codex should do after return

1. First confirm the SQL migration result with the owner; do not re-run it blindly.
2. Inspect the affected production Purchases page only.
3. Verify live CRUD, preserved historical stone records, KPI/filter/summary values, and no flicker during save/filter changes.
4. Verify widths 375px, 390px, and 430px.
5. If production reports an error, capture the exact API/Supabase error before changing code.
6. Do not modify prices, orders, stock behavior, Stripe, or the 4/6/10 stone-size rules.

## 14. Important warnings and production safety notes

- `catalog_item_id` must remain a logical polymorphic reference: it can identify a stone, charm, or spacer, so it must not receive a foreign key to only one catalog table.
- The retained `stone_id` foreign key is safe because non-stone rows write `NULL`; no foreign key is added for the generalized ID.
- The migration does not drop tables, delete purchase rows, or change selling/storefront prices, orders, stock, or Stripe.
- RLS remains enabled; browser clients do not receive direct privileged Supabase write access. The existing server-side service-role architecture performs writes.
- Existing `stone_purchase_entries` records are preserved and backfilled before the new constraints are added.
- The SQL uses a transaction: if a statement fails, the migration rolls back rather than partially changing purchase data.
