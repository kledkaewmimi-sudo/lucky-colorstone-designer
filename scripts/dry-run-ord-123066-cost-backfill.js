#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { createHistoricalDeterministicCostSnapshot } = require('../server-order-cost-snapshot.js');

const TARGET_ORDER_ID = 'ORD-123066';

function getArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

function readArray(filePath, label) {
  if (!filePath) throw new Error(`${label} file is required.`);
  const parsed = JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
  if (!Array.isArray(parsed)) throw new Error(`${label} file must contain a JSON array.`);
  return parsed;
}

function main() {
  if (process.argv.includes('--write')) throw new Error('This tool is dry-run only and cannot write Production.');
  const orders = readArray(getArgument('--orders'), 'Orders');
  const purchases = readArray(getArgument('--purchases'), 'Purchases');
  const order = orders.find((entry) => entry?.id === TARGET_ORDER_ID);
  if (!order) throw new Error(`${TARGET_ORDER_ID} was not found.`);
  if (order.costSnapshot) throw new Error(`${TARGET_ORDER_ID} already has a costSnapshot; refusing to overwrite it.`);

  const snapshot = createHistoricalDeterministicCostSnapshot(order, purchases);
  const unresolved = snapshot?.components?.filter((component) => component?.resolved === false) || [];
  console.log(JSON.stringify({
    mode: 'dry-run-only',
    targetOrderId: TARGET_ORDER_ID,
    unresolvedComponentCount: unresolved.length,
    unresolvedComponents: unresolved,
    proposedCostSnapshot: snapshot
  }, null, 2));
  if (unresolved.length > 0) process.exitCode = 2;
}

if (require.main === module) main();

module.exports = { TARGET_ORDER_ID };
