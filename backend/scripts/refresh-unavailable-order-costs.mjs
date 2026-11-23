#!/usr/bin/env node
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createHistoricalOrderCostSnapshot } = require('../server-order-cost-snapshot.js');

export const APPROVED_ORDER_IDS = Object.freeze([
  'ORD-484936',
  'ORD-179772',
  'ORD-377597',
  'ORD-940605',
  'ORD-604590',
  'ORD-705065'
]);

function isPaidRow(row = {}) {
  return String(row.stripe_payment_status || '').trim().toLowerCase() === 'paid';
}

function isUnavailableSnapshot(order = {}) {
  return String(order?.costSnapshot?.status || '').trim().toLowerCase() === 'unavailable';
}

function isResolvedSnapshot(snapshot = {}) {
  return ['complete', 'backfilled'].includes(String(snapshot.status || '').toLowerCase())
    && ['materialCost', 'deliveryCost', 'totalCost', 'profit', 'marginPercent']
      .every((field) => Number.isFinite(Number(snapshot[field])))
    && Array.isArray(snapshot.components)
    && snapshot.components.every((component) => component.resolved === true);
}

function summarizeComponents(components = []) {
  return components.map((component) => ({
    type: component.type || null,
    catalogId: component.catalogId || null,
    sizeMm: component.sizeMm ?? null,
    quantity: component.quantity ?? null,
    resolved: component.resolved === true,
    reason: component.reason || null,
    weightedAverageUnitCost: component.weightedAverageUnitCost ?? null,
    extendedCost: component.extendedCost ?? null
  }));
}

export function buildRefreshPlan(rows = [], purchases = [], calculatedAt = new Date().toISOString()) {
  const rowsById = new Map(rows.map((row) => [String(row?.id || row?.payload?.id || '').trim(), row]));
  return APPROVED_ORDER_IDS.map((orderId) => {
    const row = rowsById.get(orderId);
    const order = row?.payload;
    if (!row || !order) return { orderId, action: 'SKIP', reason: 'order_not_found' };
    if (!isPaidRow(row)) return { orderId, action: 'SKIP', reason: 'stripe_payment_status_not_paid' };
    if (!isUnavailableSnapshot(order)) return { orderId, action: 'SKIP', reason: 'cost_snapshot_not_unavailable' };

    const snapshot = createHistoricalOrderCostSnapshot(order, purchases, row, calculatedAt);
    if (!snapshot || !isResolvedSnapshot(snapshot)) {
      return {
        orderId,
        action: 'SKIP',
        reason: 'unresolved_components',
        snapshot: snapshot || null,
        components: summarizeComponents(snapshot?.components)
      };
    }

    return {
      orderId,
      action: 'WOULD UPDATE',
      snapshot,
      components: summarizeComponents(snapshot.components)
    };
  });
}

export function parseOptions(args = []) {
  const unknown = args.filter((argument) => argument !== '--apply');
  if (unknown.length) throw new Error(`Unsupported argument(s): ${unknown.join(', ')}`);
  return { apply: args.includes('--apply') };
}

function getSupabaseConfig() {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in the production Render Shell.');
  return { url, key };
}

async function supabaseRequest(config, path, options = {}) {
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path} failed: ${text || response.status}`);
  return payload;
}

async function readApprovedOrders(config) {
  const ids = APPROVED_ORDER_IDS.map((id) => JSON.stringify(id)).join(',');
  return supabaseRequest(
    config,
    `orders?select=id,payload,created_at,date,stripe_payment_status&id=in.(${encodeURIComponent(ids)})`
  );
}

async function readPurchases(config) {
  return supabaseRequest(
    config,
    'stone_purchase_entries?select=item_type,catalog_item_id,size_mm,quantity,total_cost,purchased_at'
  );
}

function logPlan(plan) {
  for (const item of plan) {
    const snapshot = item.snapshot || {};
    console.log(JSON.stringify({
      orderId: item.orderId,
      action: item.action,
      reason: item.reason || null,
      status: snapshot.status || null,
      materialCost: snapshot.materialCost ?? null,
      deliveryCost: snapshot.deliveryCost ?? null,
      totalCost: snapshot.totalCost ?? null,
      profit: snapshot.profit ?? null,
      marginPercent: snapshot.marginPercent ?? null,
      components: item.components || summarizeComponents(snapshot.components)
    }));
  }
}

async function rereadOrder(config, orderId) {
  const rows = await supabaseRequest(
    config,
    `orders?select=id,payload,created_at,date,stripe_payment_status&id=eq.${encodeURIComponent(orderId)}`
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function applyPlan(config, plan, purchases, calculatedAt) {
  console.warn('WARNING: applying guarded costSnapshot refreshes to the six approved production order IDs only.');
  for (const item of plan) {
    if (item.action !== 'WOULD UPDATE') continue;
    const current = await rereadOrder(config, item.orderId);
    const currentPlan = buildRefreshPlan(current ? [current] : [], purchases, calculatedAt)
      .find((candidate) => candidate.orderId === item.orderId);
    if (currentPlan?.action !== 'WOULD UPDATE') {
      console.log(JSON.stringify({ orderId: item.orderId, action: 'SKIP', reason: currentPlan?.reason || 'order_changed_before_apply' }));
      continue;
    }

    const response = await supabaseRequest(
      config,
      `orders?id=eq.${encodeURIComponent(item.orderId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ payload: { ...current.payload, costSnapshot: currentPlan.snapshot } })
      }
    );
    if (!Array.isArray(response) || response.length !== 1) throw new Error(`Unexpected update response for ${item.orderId}.`);

    const persisted = await rereadOrder(config, item.orderId);
    const persistedSnapshot = persisted?.payload?.costSnapshot;
    if (!isResolvedSnapshot(persistedSnapshot) || persistedSnapshot.calculatedAt !== currentPlan.snapshot.calculatedAt) {
      throw new Error(`Persisted snapshot verification failed for ${item.orderId}.`);
    }
    console.log(JSON.stringify({ orderId: item.orderId, action: 'UPDATED', status: persistedSnapshot.status }));
  }
}

export async function main(args = process.argv.slice(2)) {
  const { apply } = parseOptions(args);
  const config = getSupabaseConfig();
  const [rows, purchases] = await Promise.all([readApprovedOrders(config), readPurchases(config)]);
  const calculatedAt = new Date().toISOString();
  const plan = buildRefreshPlan(Array.isArray(rows) ? rows : [], Array.isArray(purchases) ? purchases : [], calculatedAt);
  console.log(apply ? 'PRODUCTION APPLY MODE: only approved, paid, currently-unavailable, fully-resolved snapshots may be written.' : 'DRY RUN: no production data will be written. Use --apply only after reviewing every result.');
  logPlan(plan);
  if (!apply) return plan;
  await applyPlan(config, plan, Array.isArray(purchases) ? purchases : [], calculatedAt);
  return plan;
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
}
