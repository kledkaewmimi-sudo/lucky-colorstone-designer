#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createOrderCostSnapshot } = require('../server-order-cost-snapshot.js');

const ORDER_ID = 'ORD-266992';
const EXPECTED = { finalPaidAmount: 514, materialCost: 126.59157520281116, deliveryCost: 80, totalCost: 206.59157520281116, profit: 307.40842479718884, marginPercent: 59.80708653641806 };
const REQUIRED_PURCHASE_IDS = ['741336c2-ad41-4eae-a105-117db0a5484a', '2ab1f2fa-0878-42ed-9f0e-2319abc2fcd1'];
const same = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-9;
const digest = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function request(url, key, table, options = {}) {
  const response = await fetch(`${url}/rest/v1/${table}${options.query || ''}`, { method: options.method || 'GET', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: options.prefer || 'return=representation' }, body: options.body ? JSON.stringify(options.body) : undefined });
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${table} failed: ${response.status} ${await response.text()}`);
  return response.json();
}
function validate(order, purchases) {
  if (!order || String(order.stripePaymentStatus || order.paymentStatus || '').toLowerCase() !== 'paid') throw new Error('Order is no longer paid.');
  if (order.costSnapshot?.status !== 'unavailable') throw new Error('Snapshot is not the expected unavailable state.');
  const snapshot = createOrderCostSnapshot({ ...order, costSnapshot: undefined }, purchases, new Date().toISOString());
  if (!snapshot || snapshot.status !== 'complete' || snapshot.components.some((component) => !component.resolved)) throw new Error('Current cost resolution is not complete.');
  for (const [key, value] of Object.entries(EXPECTED)) if (!same(snapshot[key], value)) throw new Error(`Calculated ${key} differs from approved value.`);
  const required = purchases.filter((purchase) => REQUIRED_PURCHASE_IDS.includes(purchase.id));
  if (required.length !== 2 || required.some((purchase) => Number(purchase.unit_cost) !== 3)) throw new Error('Required 3 THB purchase rows are absent or changed.');
  return snapshot;
}
async function main() {
  if (!process.argv.includes('--production') || process.env.PRODUCTION_COST_SNAPSHOT_CONFIRM !== 'COMPLETE_ORD_266992') throw new Error('Refusing write without --production and PRODUCTION_COST_SNAPSHOT_CONFIRM=COMPLETE_ORD_266992.');
  const url = String(process.env.PRODUCTION_SUPABASE_URL || '').replace(/\/+$/, ''), key = String(process.env.PRODUCTION_SUPABASE_SERVICE_ROLE_KEY || '');
  if (!url || !key) throw new Error('Production Supabase URL and service-role key are required.');
  const row = (await request(url, key, 'orders', { query: `?select=id,payload&id=eq.${ORDER_ID}` }))[0];
  const purchases = await request(url, key, 'stone_purchase_entries', { query: '?select=id,item_type,catalog_item_id,size_mm,quantity,total_cost,unit_cost,purchased_at' });
  const before = row?.payload;
  const snapshot = validate(before, purchases);
  fs.mkdirSync(path.resolve('production-backups'), { recursive: true });
  const backupPath = path.resolve('production-backups', `ord-266992-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(backupPath, JSON.stringify({ fetchedAt: new Date().toISOString(), orderId: ORDER_ID, payload: before }, null, 2));
  const recheck = (await request(url, key, 'orders', { query: `?select=id,payload&id=eq.${ORDER_ID}` }))[0];
  if (!recheck || digest(recheck.payload) !== digest(before)) throw new Error('Order changed before write; aborting.');
  const updated = { ...before, costSnapshot: snapshot };
  await request(url, key, 'orders', { method: 'PATCH', query: `?id=eq.${encodeURIComponent(recheck.id)}`, body: { payload: updated } });
  const after = (await request(url, key, 'orders', { query: `?select=id,payload&id=eq.${ORDER_ID}` }))[0]?.payload;
  const beforeWithoutCost = { ...before }; delete beforeWithoutCost.costSnapshot;
  const afterWithoutCost = { ...after }; delete afterWithoutCost.costSnapshot;
  if (!after?.costSnapshot || after.costSnapshot.status !== 'complete' || digest(beforeWithoutCost) !== digest(afterWithoutCost)) throw new Error('Post-write payload verification failed.');
  for (const [keyName, value] of Object.entries(EXPECTED)) if (!same(after.costSnapshot[keyName], value)) throw new Error(`Post-write ${keyName} mismatch.`);
  console.log(JSON.stringify({ orderId: ORDER_ID, backupPath, status: after.costSnapshot.status, costSnapshot: after.costSnapshot }, null, 2));
}
if (require.main === module) main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
