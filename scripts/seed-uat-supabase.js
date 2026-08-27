// Manual UAT-only seed/import. It never reads generic or production Supabase
// variables. Run only after the owner has configured a separate UAT project.
const fs = require('fs/promises');
const path = require('path');
const { assertSafeUatEnvironment } = require('../uat-backend-guard.js');
const { buildUatSupabaseAuthHeaders } = require('../uat-supabase-auth.js');

assertSafeUatEnvironment(process.env);

const root = path.resolve(__dirname, '..');
const url = String(process.env.UAT_SUPABASE_URL).replace(/\/+$/, '');
const key = String(process.env.UAT_SUPABASE_SERVICE_ROLE_KEY);
const dryRun = process.argv.includes('--dry-run');

async function readFixture(name, fallback) {
  return JSON.parse(await fs.readFile(path.join(root, 'data', name), 'utf8').catch(() => fallback));
}

function catalogRow(record, type) {
  const availability = record.availability || {};
  return {
    id: record.id,
    payload: record,
    ...(type === 'spacer' ? {} : { category_id: record.categoryId || record.category || record.collection || null }),
    display_order: Number(record.displayOrder || 0),
    in_stock: availability.inStock ?? record.inStock ?? true,
    is_active: availability.isActive ?? record.isActive ?? true
  };
}

async function upsert(table, records, conflictColumn = 'id') {
  if (!records.length) return;
  if (dryRun) return console.log(`Would upsert ${records.length} UAT ${table} records.`);
  const response = await fetch(`${url}/rest/v1/${table}?on_conflict=${encodeURIComponent(conflictColumn)}`, {
    method: 'POST',
    headers: { ...buildUatSupabaseAuthHeaders(key), 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(records)
  });
  if (!response.ok) throw new Error(`UAT ${table} seed failed with HTTP ${response.status}`);
  console.log(`Seeded ${records.length} UAT ${table} records.`);
}

async function main() {
  const [stones, charms, spacers, settings] = await Promise.all([
    readFixture('stones.json', '[]'), readFixture('charms.json', '[]'),
    readFixture('spacers.json', '[]'), readFixture('settings.json', '{}')
  ]);
  await upsert('catalog_stones', stones.map((item) => catalogRow(item, 'stone')));
  await upsert('catalog_charms', charms.map((item) => catalogRow(item, 'charm')));
  await upsert('catalog_spacers', spacers.map((item) => catalogRow(item, 'spacer')));
  await upsert('catalog_categories', (settings.catalogCategories || []).map((item) => ({
    id: item.id, entity_type: item.entityType || 'stone', slug: item.slug || item.id,
    name_en: item.nameEn || '', name_th: item.nameTh || '', display_order: Number(item.displayOrder || 0),
    is_active: item.isActive !== false, payload: item
  })));
  await upsert('catalog_layout_order', settings.catalogLayoutOrder ? [{ key: 'default', value: settings.catalogLayoutOrder }] : [], 'key');
  await upsert('app_settings', Object.entries(settings)
    .filter(([name]) => name !== 'catalogCategories' && name !== 'catalogLayoutOrder')
    .map(([key, value]) => ({ key, value })), 'key');
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
