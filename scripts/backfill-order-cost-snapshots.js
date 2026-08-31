#!/usr/bin/env node
const fs = require('node:fs');
const { createHistoricalOrderCostSnapshot, isPaidOrder } = require('../server-order-cost-snapshot.js');

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function dryRun(rows, purchases, now = new Date().toISOString()) {
  const stats = { totalPaid: 0, alreadySnapshotted: 0, eligible: 0, resolved: 0, unresolved: 0, missingOrderDate: 0, noPriorPurchaseCost: 0, estimatedMaterialCost: 0, estimatedDeliveryCost: 0, estimatedCost: 0, estimatedProfit: 0, snapshots: [] };
  for (const row of rows) {
    const order = row.payload || row;
    if (!isPaidOrder(order)) continue;
    stats.totalPaid += 1;
    if (order.costSnapshot) { stats.alreadySnapshotted += 1; continue; }
    const snapshot = createHistoricalOrderCostSnapshot(order, purchases, row, now);
    if (!snapshot) continue;
    stats.eligible += 1; stats.snapshots.push({ row, order, snapshot });
    if (snapshot.status === 'backfilled') { stats.resolved += 1; stats.estimatedMaterialCost += snapshot.materialCost; stats.estimatedDeliveryCost += snapshot.deliveryCost; stats.estimatedCost += snapshot.totalCost; stats.estimatedProfit += snapshot.profit; }
    else { stats.unresolved += 1; if (snapshot.components.some((component) => component.reason === 'missing_exact_purchase_cost')) stats.noPriorPurchaseCost += 1; }
  }
  return stats;
}

async function main() {
  const args = process.argv.slice(2), write = args.includes('--write'), get = (name) => args[args.indexOf(name) + 1];
  const result = dryRun(readJson(get('--orders')), readJson(get('--purchases')));
  console.log(JSON.stringify({ ...result, snapshots: result.snapshots.map(({ row, snapshot }) => ({ order_id: row.id || row.payload?.id, snapshot })) }, null, 2));
  if (!write) return;
  if (process.env.PRODUCTION_BACKFILL_CONFIRM !== 'CREATE_ONLY_COST_SNAPSHOTS') throw new Error('Refusing write without explicit create-only confirmation.');
  const url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, ''), key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
  if (!url || !key) throw new Error('Production Supabase credentials are required only for --write.');
  for (const { row, order, snapshot } of result.snapshots) {
    const id = row.id || order.id;
    const current = await fetch(`${url}/rest/v1/orders?id=eq.${encodeURIComponent(id)}&select=payload`, { headers: { apikey: key, Authorization: `Bearer ${key}` } }).then((response) => response.json());
    if (!Array.isArray(current) || !current[0]?.payload || current[0].payload.costSnapshot) continue;
    const response = await fetch(`${url}/rest/v1/orders?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ payload: { ...current[0].payload, costSnapshot: snapshot } }) });
    if (!response.ok) throw new Error(`Backfill write failed for ${id}: ${await response.text()}`);
  }
}
if (require.main === module) main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
module.exports = { dryRun };
