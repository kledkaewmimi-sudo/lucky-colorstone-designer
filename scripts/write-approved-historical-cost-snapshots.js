#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createHistoricalBackfillDryRun } = require('../server-order-cost-snapshot.js');

const APPROVED_IDS = ['ORD-572404','ORD-478676','ORD-364998','ORD-690039','ORD-175365','ORD-514883','ORD-576378','ORD-192061','ORD-103465','ORD-299037','ORD-307039','ORD-931320','ORD-855854','ORD-148174','ORD-896440','ORD-448551','ORD-635588','ORD-154067','ORD-760245','ORD-123066','ORD-806246','ORD-383094'];
const APPROVED = { revenue: 12821, materialCost: 1971.2184978446664, profit: 9089.781502155334 };
const equal = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-9;
const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function rest(url, key, table, options = {}) {
  const response = await fetch(`${url}/rest/v1/${table}${options.query || ''}`, { method: options.method || 'GET', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: options.prefer || 'return=representation' }, body: options.body ? JSON.stringify(options.body) : undefined });
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${table} failed: ${response.status} ${await response.text()}`);
  return response.json();
}
function validate(rows, purchases) {
  if (rows.length !== APPROVED_IDS.length || rows.some((row, index) => row.payload?.id !== APPROVED_IDS[index])) throw new Error('Target set changed.');
  if (rows.some((row) => String(row.payload?.stripePaymentStatus || row.payload?.paymentStatus || '').toLowerCase() !== 'paid' || row.payload?.costSnapshot)) throw new Error('Paid/snapshot safety check failed.');
  const dry = createHistoricalBackfillDryRun(rows.map((row) => row.payload), purchases, new Date().toISOString());
  const totals = dry.reduce((a, row) => { const s = row.snapshot; if (s.status !== 'complete') throw new Error(`Unresolved ${row.orderId}`); a.revenue += s.finalPaidAmount; a.materialCost += s.materialCost; a.profit += s.profit; a.actual += s.historicalDeterministicBackfill ? 1 : 0; a.estimated += s.historicalEstimatedBackfill ? 1 : 0; return a; }, { revenue: 0, materialCost: 0, profit: 0, actual: 0, estimated: 0 });
  if (dry.length !== 22 || totals.actual !== 1 || totals.estimated !== 21 || !equal(totals.revenue, APPROVED.revenue) || !equal(totals.materialCost, APPROVED.materialCost) || !equal(totals.profit, APPROVED.profit)) throw new Error('Approved dry-run aggregate mismatch.');
  return { dry, totals };
}
async function main() {
  if (!process.argv.includes('--production') || process.env.PRODUCTION_BACKFILL_CONFIRM !== 'WRITE_22_HISTORICAL_COST_SNAPSHOTS') throw new Error('Refusing write without --production and explicit confirmation.');
  const url = String(process.env.PRODUCTION_SUPABASE_URL || '').replace(/\/+$/, ''), key = String(process.env.PRODUCTION_SUPABASE_SERVICE_ROLE_KEY || '');
  if (!url || !key) throw new Error('Production Supabase URL and service-role key are required.');
  const filter = `?select=id,payload&id=in.(${APPROVED_IDS.join(',')})`;
  const unordered = await rest(url, key, 'orders', { query: filter });
  const rows = APPROVED_IDS.map((id) => unordered.find((row) => row.payload?.id === id));
  const purchases = await rest(url, key, 'stone_purchase_entries', { query: '?select=id,item_type,catalog_item_id,size_mm,quantity,total_cost,purchased_at' });
  const before = rows.map((row) => ({ id: row.payload.id, payload: row.payload, hash: hash(row.payload) }));
  fs.mkdirSync(path.resolve('production-backups'), { recursive: true });
  const backupPath = path.resolve('production-backups', `historical-cost-snapshots-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(backupPath, JSON.stringify({ fetchedAt: new Date().toISOString(), orders: before }, null, 2));
  const { dry, totals } = validate(rows, purchases);
  const successes = [];
  for (const entry of dry) {
    const current = (await rest(url, key, 'orders', { query: `?select=id,payload&id=eq.${encodeURIComponent(entry.orderId)}` }))[0];
    const original = before.find((row) => row.id === entry.orderId);
    if (!current || current.payload?.costSnapshot || hash(current.payload) !== original.hash) throw new Error(`Pre-write recheck failed for ${entry.orderId}; aborting.`);
    const updated = { ...current.payload, costSnapshot: entry.snapshot };
    await rest(url, key, 'orders', { method: 'PATCH', query: `?id=eq.${encodeURIComponent(current.id)}`, body: { payload: updated } });
    successes.push(entry.orderId);
  }
  console.log(JSON.stringify({ backupPath, successes, totals }, null, 2));
}
if (require.main === module) main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
