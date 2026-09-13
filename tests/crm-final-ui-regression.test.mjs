import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { getCrmStoneOverviewMetrics } from '../crm-runtime-loaders.mjs';
import { getOrderFinalBraceletPreviewImage, normalizeCrmOrderDetailResponse } from '../crm-order-details.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const crmSource = fs.readFileSync(path.join(root, 'crm.js'), 'utf8');
const dataSource = fs.readFileSync(path.join(root, 'data.js'), 'utf8');
const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

test('overview metrics use authoritative stock columns and retain legacy in-stock semantics', () => {
  const stones = [
    ...Array.from({ length: 32 }, (_, index) => ({ id: `in-${index}`, is_active: true, in_stock: true, payload: { active: false } })),
    ...Array.from({ length: 5 }, (_, index) => ({ id: `out-${index}`, is_active: true, in_stock: false, payload: { active: true } }))
  ];
  assert.deepEqual(getCrmStoneOverviewMetrics(stones), { activeStonesCount: 32, outOfStockCount: 5 });
  assert.match(serverSource, /payload\.inStock = row\.in_stock/);
  assert.match(serverSource, /payload\.isActive = row\.is_active/);
  assert.doesNotMatch(serverSource, /payload\.active/);
});

test('selected detail preserves a saved preview and immutable stored cost snapshot', () => {
  const preview = 'data:image/webp;base64,preview';
  const snapshot = { status: 'complete', materialCost: 120, deliveryCost: 80, totalCost: 200, profit: 300, marginPercent: 60 };
  const detail = normalizeCrmOrderDetailResponse({ order: { id: 'paid-1', checkoutSummary: { braceletPreviewImage: preview }, costSnapshot: snapshot } });
  assert.equal(detail.braceletPreviewImage, preview);
  assert.equal(getOrderFinalBraceletPreviewImage(detail), preview);
  assert.equal(detail.costSnapshot, snapshot);
  assert.deepEqual(detail.costSnapshot, snapshot);
});

test('genuine missing snapshots remain unavailable while detail renders stored snapshot values', () => {
  const missing = normalizeCrmOrderDetailResponse({ id: 'legacy-missing', costSnapshot: { status: 'unavailable', materialCost: null } });
  assert.equal(missing.costSnapshot.status, 'unavailable');
  assert.match(crmSource, /<h4>Cost &amp; Profit<\/h4>/);
  assert.match(crmSource, /\$\{renderOrderCostSummary\(order\)\}/);
  assert.match(dataSource, /normalizeCrmOrderDetailResponse\(await res\.json\(\)\)/);
  assert.match(crmSource, /getCrmOrderDetail\(orderId\)/);
});

test('compact order rows use the exact View Detail preview source and stored cost snapshot', () => {
  assert.match(serverSource, /includePreview \? 'braceletPreviewImage:payload->>braceletPreviewImage,braceletPreviewDataUrl:payload->>braceletPreviewDataUrl/);
  assert.match(serverSource, /costSnapshotMaterialCost:payload->costSnapshot->>materialCost/);
  assert.doesNotMatch(serverSource, /braceletSequence:payload->braceletSequence/);
  assert.match(serverSource, /readCrmOrderProjection\(\{ page, limit, paidOnly: true, includePreview: true \}\)/);
  assert.match(crmSource, /const braceletPreviewHtml = renderOrderBraceletPreview\(order/);
  assert.match(crmSource, /const costText = renderOrderCostSummary\(order\)/);
  assert.doesNotMatch(crmSource, /Available in detail/);
  assert.match(dataSource, /fetch\(`\/api\/crm\/orders\/\$\{encodeURIComponent\(orderId\)\}`\)/);
  assert.match(dataSource, /fetch\(`\/api\/crm\/orders\?\$\{params\.toString\(\)\}`\)/);
});