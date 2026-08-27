// Manual UAT-only seed/import. It never reads generic or production Supabase
// variables. Run only after the owner has configured a separate UAT project.
const fs = require('fs/promises');
const path = require('path');
const { APPROVED_UAT_SUPABASE_PROJECT_REF, APPROVED_UAT_SUPABASE_URL, assertSafeUatEnvironment } = require('../uat-backend-guard.js');
const { buildUatSupabaseAuthHeaders, describeUatSupabaseKey, normalizeUatSupabaseKey } = require('../uat-supabase-auth.js');

assertSafeUatEnvironment(process.env);

const root = path.resolve(__dirname, '..');
const url = String(process.env.UAT_SUPABASE_URL || '').trim().replace(/\/+$/, '');
const rawKey = String(process.env.UAT_SUPABASE_SERVICE_ROLE_KEY || '');
const key = normalizeUatSupabaseKey(rawKey);
const dryRun = process.argv.includes('--dry-run');
const probeOnly = process.argv.includes('--probe');
const diagnoseOnly = process.argv.includes('--diagnose');
const SERVER_USER_AGENT = 'lucky-colorstone-uat-seed/1.0';

function safeSeedDiagnostics() {
  const keyInfo = describeUatSupabaseKey(rawKey);
  return {
    keyPresent: keyInfo.present,
    keyType: keyInfo.type,
    keyHasLeadingOrTrailingWhitespace: keyInfo.hasLeadingOrTrailingWhitespace,
    keyLength: keyInfo.length,
    projectRefMatch: String(process.env.UAT_SUPABASE_PROJECT_REF || '').trim() === APPROVED_UAT_SUPABASE_PROJECT_REF,
    projectUrlMatch: url === APPROVED_UAT_SUPABASE_URL,
    authorizationHeaderForSbSecret: keyInfo.type === 'SB_SECRET' ? 'ABSENT' : 'LEGACY_OR_UNKNOWN',
    apikeyHeader: 'PRESENT',
    userAgent: SERVER_USER_AGENT
  };
}

function safeSupabaseError(response, text) {
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch {}
  const code = typeof parsed?.code === 'string' ? parsed.code : '';
  const message = typeof parsed?.message === 'string' ? parsed.message : typeof parsed?.error === 'string' ? parsed.error : '';
  const requestId = response.headers.get('x-request-id') || response.headers.get('cf-ray') || '';
  return [
    `HTTP ${response.status}`,
    code ? `code=${code}` : '',
    message ? `message=${message.slice(0, 300)}` : '',
    requestId ? `request_id=${requestId}` : ''
  ].filter(Boolean).join(' ');
}

async function requestUatRest(pathname, options = {}) {
  const response = await fetch(`${url}/rest/v1/${pathname}`, {
    ...options,
    headers: { ...buildUatSupabaseAuthHeaders(key), 'User-Agent': SERVER_USER_AGENT, ...options.headers }
  });
  const text = await response.text();
  return { response, text };
}

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
  const { response, text } = await requestUatRest(`${table}?on_conflict=${encodeURIComponent(conflictColumn)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(records)
  });
  if (!response.ok) throw new Error(`UAT ${table} seed failed: ${safeSupabaseError(response, text)}`);
  console.log(`Seeded ${records.length} UAT ${table} records.`);
}

async function main() {
  if (diagnoseOnly) {
    console.log(JSON.stringify(safeSeedDiagnostics()));
    return;
  }
  if (probeOnly) {
    const { response, text } = await requestUatRest('catalog_stones?select=id&limit=1');
    const result = { status: response.status, ok: response.ok, ...(response.ok ? {} : { error: safeSupabaseError(response, text) }) };
    console.log(JSON.stringify(result));
    if (!response.ok) process.exitCode = 1;
    return;
  }
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
