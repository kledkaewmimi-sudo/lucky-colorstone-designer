#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { createHistoricalBackfillDryRun } = require('../server-order-cost-snapshot.js');

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

function readArray(filePath, label) {
  if (!filePath) throw new Error(`${label} file is required.`);
  const value = JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
  if (!Array.isArray(value)) throw new Error(`${label} file must contain a JSON array.`);
  return value;
}

async function main() {
  if (process.argv.includes('--write')) throw new Error('This tool is dry-run only and cannot write Production.');
  const readProduction = process.argv.includes('--production-public-read');
  const [orders, purchases] = readProduction
    ? await Promise.all([
      fetch('https://customize.luckycolorstone.com/api/orders').then((response) => response.json()),
      fetch('https://customize.luckycolorstone.com/api/purchases').then((response) => response.json())
    ])
    : [readArray(argumentValue('--orders'), 'Orders'), readArray(argumentValue('--purchases'), 'Purchases')];
  const rows = createHistoricalBackfillDryRun(
    orders,
    purchases
  );
  const summary = rows.reduce((totals, row) => {
    const snapshot = row.snapshot;
    totals.examined += 1;
    if (snapshot.status === 'unavailable') totals.unresolvedOrders += 1;
    else if (snapshot.historicalEstimatedBackfill) totals.estimatedOrders += 1;
    else totals.actualOrders += 1;
    if (snapshot.status === 'complete') {
      totals.revenue += snapshot.finalPaidAmount;
      totals.materialCost += snapshot.materialCost;
      totals.profit += snapshot.profit;
    }
    return totals;
  }, { examined: 0, actualOrders: 0, estimatedOrders: 0, unresolvedOrders: 0, revenue: 0, materialCost: 0, profit: 0 });
  console.log(JSON.stringify({ mode: readProduction ? 'dry-run-only-production-public-read' : 'dry-run-only', summary, orders: rows }, null, 2));
}

if (require.main === module) main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
