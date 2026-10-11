// Privacy + aggregate harness for GET /api/social-proof.
//
//   node reports/production/full-uat-feature-migration-20261009/tools/social-proof-privacy-tests.mjs
//
// Runs the reconciled backend in isolation twice, with synthetic fixtures only (no Production data,
// no Production credentials, no network egress beyond a local stub):
//   Phase 1 - JSON mode: proves the response is aggregate-only, carries no image/base64/PII/order id,
//             is arithmetically correct, ignores unpaid orders, is cached, and has no write surface.
//   Phase 2 - Supabase mode against a local PostgREST stub: proves the count comes from an exact-count
//             header without reading order payloads, and that the query projects only an id column.
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '..', 'reconciled-candidate');
const JSON_PORT = 4591;
const STUB_PORT = 4592;
const SUPA_PORT = 4593;
const ADMIN_SECRET = 'privacy-admin-' + crypto.randomBytes(6).toString('hex');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'lcs-social-proof-'));

const results = [];
const rec = (id, pass, detail) => results.push({ id, pass: Boolean(pass), detail: String(detail ?? '').slice(0, 260) });

// Synthetic markers that must never appear in the public response.
const NAME_MARKER = 'CUSTOMER-NAME-' + crypto.randomBytes(3).toString('hex');
const PHONE_MARKER = 'PHONE-' + crypto.randomBytes(3).toString('hex');
const ADDRESS_MARKER = 'ADDRESS-' + crypto.randomBytes(3).toString('hex');
const ORDER_A = 'ORD-PRIV-' + crypto.randomBytes(3).toString('hex');
const ORDER_B = 'ORD-PRIV-' + crypto.randomBytes(3).toString('hex');
const ORDER_UNPAID = 'ORD-UNPAID-' + crypto.randomBytes(3).toString('hex');
const PREVIEW_A = 'data:image/webp;base64,' + 'A'.repeat(3000);
const PREVIEW_B = 'data:image/webp;base64,' + 'B'.repeat(3000);

const paidOrder = (id, preview) => ({
  id,
  date: '2026-10-01T00:00:00.000Z',
  status: 'Payment Received',
  stripePaymentStatus: 'paid',
  stripeCheckoutSessionId: 'cs_test_' + id,
  totalPrice: 913,
  braceletPreviewImage: preview,
  customerName: NAME_MARKER,
  shippingInfo: { recipientName: NAME_MARKER, phoneNumber: PHONE_MARKER, addressLine: ADDRESS_MARKER, province: 'BKK', postalCode: '10000' }
});

const writeFixtures = (orders) => {
  fs.writeFileSync(path.join(DATA, 'orders.json'), JSON.stringify(orders, null, 1));
  fs.writeFileSync(path.join(DATA, 'settings.json'), JSON.stringify({ discountEnabled: true, globalDiscountPercent: 10 }));
  fs.writeFileSync(path.join(DATA, 'admin_order_numbers.json'), JSON.stringify([]));
};
writeFixtures([
  paidOrder(ORDER_A, PREVIEW_A),
  paidOrder(ORDER_B, PREVIEW_B),
  { id: ORDER_UNPAID, date: '2026-10-02T00:00:00.000Z', status: 'Pending', stripePaymentStatus: 'unpaid', braceletPreviewImage: PREVIEW_A, customerName: NAME_MARKER }
]);

const kill = (child) => { try { spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* ignore */ } };

async function waitReady(port) {
  for (let i = 0; i < 60; i += 1) {
    try { const r = await fetch(`http://127.0.0.1:${port}/api/settings`); if (r.ok) return true; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

// ------------------------------------------------------------------ Phase 1: JSON mode
const server = spawn(process.execPath, ['server.js'], {
  cwd: SRC,
  env: {
    ...process.env, PORT: String(JSON_PORT), DATA_DIR: DATA, SUPERBASE_NOOP: '1',
    SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', STRIPE_WEBHOOK_SECRET: '', LINE_CHANNEL_SECRET: '',
    ADMIN_API_SECRET: ADMIN_SECRET
  },
  stdio: ['ignore', 'pipe', 'pipe']
});
let logs = ''; server.stdout.on('data', (d) => { logs += d; }); server.stderr.on('data', (d) => { logs += d; });

try {
  const ready = await waitReady(JSON_PORT);
  rec('phase 1: server started in isolated JSON mode', ready, ready ? 'ready' : logs.slice(-200));

  const first = await fetch(`http://127.0.0.1:${JSON_PORT}/api/social-proof`);
  const raw = await first.text();
  let body = null; try { body = JSON.parse(raw); } catch { /* handled below */ }
  rec('phase 1: GET /api/social-proof returns 200', first.status === 200, 'HTTP ' + first.status);
  rec('phase 1: response is valid JSON', body !== null, raw.slice(0, 120));
  // PUBLICATION CONTRACT CHANGE (owner-authorised 2026-10-11): GET /api/social-proof now publishes the
  // four newest eligible bracelet previews next to the aggregate count, so the previous "no imagery at
  // all" expectations are superseded. Every privacy expectation below is unchanged, and the endpoint
  // must still refuse to publish anything it cannot re-encode as a bounded image.
  rec('phase 1: body keys are exactly the publication contract', Boolean(body) && JSON.stringify(Object.keys(body).sort()) === JSON.stringify(['displayCount', 'recentBracelets', 'successfulOrderCount']),
    body ? Object.keys(body).join(',') : 'n/a');
  rec('phase 1: at most four previews are ever published', Boolean(body) && Array.isArray(body.recentBracelets) && body.recentBracelets.length <= 4, 'recentBracelets=' + (Array.isArray(body?.recentBracelets) ? body.recentBracelets.length : String(body?.recentBracelets)));
  rec('phase 1: undecodable preview payloads are never published', Boolean(body) && Array.isArray(body.recentBracelets) && body.recentBracelets.length === 0 && !/base64/i.test(raw),
    'fixture previews are not real images, so none may be republished: ' + JSON.stringify(body?.recentBracelets || []).slice(0, 60));
  rec('phase 1: no customer name, phone or address in the response', ![NAME_MARKER, PHONE_MARKER, ADDRESS_MARKER].some((m) => raw.includes(m)), 'markers absent');
  rec('phase 1: no order id in the response', ![ORDER_A, ORDER_B, ORDER_UNPAID].some((m) => raw.includes(m)), 'ids absent');
  rec('phase 1: counts only paid orders', Boolean(body) && body.successfulOrderCount === 2, 'successfulOrderCount=' + body?.successfulOrderCount);
  rec('phase 1: display count follows the landing formula (1035 + paid x 3)', Boolean(body) && body.displayCount === 1035 + 2 * 3, 'displayCount=' + body?.displayCount);

  const post = await fetch(`http://127.0.0.1:${JSON_PORT}/api/social-proof`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  rec('phase 1: endpoint exposes no write surface (POST not accepted)', [404, 405, 401, 403].includes(post.status), 'HTTP ' + post.status + ' (no POST handler exists)');

  // Cache proof: add a third paid order to the local store; a cached response must not change.
  writeFixtures([paidOrder(ORDER_A, PREVIEW_A), paidOrder(ORDER_B, PREVIEW_B), { id: ORDER_UNPAID, status: 'Pending', stripePaymentStatus: 'unpaid' }, paidOrder('ORD-PRIV-LATE', PREVIEW_A)]);
  await new Promise((r) => setTimeout(r, 400));
  const cached = await fetch(`http://127.0.0.1:${JSON_PORT}/api/social-proof`).then((r) => r.json()).catch(() => null);
  rec('phase 1: the 60s cache is in force (a new paid order does not change the cached payload)', cached?.successfulOrderCount === 2,
    'successfulOrderCount=' + cached?.successfulOrderCount + ' (a re-read would have reported 3)');
} finally {
  kill(server);
}

// ------------------------------------------------------------------ Phase 2: Supabase aggregate path
const seen = [];
const stub = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const m = url.pathname.match(/^\/rest\/v1\/([^/]+)$/);
  if (!m) { res.writeHead(404, { 'content-type': 'application/json' }); res.end('{}'); return; }
  seen.push({ table: m[1], select: url.searchParams.get('select'), prefer: req.headers.prefer || '', limit: url.searchParams.get('limit'), order: url.searchParams.get('order'), paidFilter: url.searchParams.get('or') });
  if (m[1] === 'orders' && String(req.headers.prefer || '').includes('count=exact')) {
    res.writeHead(200, { 'content-type': 'application/json', 'content-range': '0-0/57' });
    res.end('[]');
    return;
  }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end('[]');
});
await new Promise((r) => stub.listen(STUB_PORT, '127.0.0.1', r));

const supa = spawn(process.execPath, ['server.js'], {
  cwd: SRC,
  env: {
    ...process.env, PORT: String(SUPA_PORT), DATA_DIR: DATA,
    SUPABASE_URL: `http://127.0.0.1:${STUB_PORT}`, SUPABASE_SERVICE_ROLE_KEY: 'stub-service-role-key',
    STRIPE_WEBHOOK_SECRET: '', LINE_CHANNEL_SECRET: '', ADMIN_API_SECRET: ADMIN_SECRET
  },
  stdio: ['ignore', 'pipe', 'pipe']
});
let supaLogs = ''; supa.stdout.on('data', (d) => { supaLogs += d; }); supa.stderr.on('data', (d) => { supaLogs += d; });

try {
  const ready = await waitReady(SUPA_PORT);
  rec('phase 2: server started against the local PostgREST stub', ready, ready ? 'ready' : supaLogs.slice(-200));
  const res = await fetch(`http://127.0.0.1:${SUPA_PORT}/api/social-proof`);
  const body = await res.json().catch(() => null);
  rec('phase 2: aggregate count is taken from the exact-count header', body?.successfulOrderCount === 57, 'successfulOrderCount=' + body?.successfulOrderCount);
  rec('phase 2: display count follows the landing formula', body?.displayCount === 1035 + 57 * 3, 'displayCount=' + body?.displayCount);
  const orderQueries = seen.filter((s) => s.table === 'orders' && s.prefer.includes('count=exact'));
  rec('phase 2: the count query requests an exact count', orderQueries.length > 0, JSON.stringify(orderQueries.slice(0, 2)));
  const badProjection = orderQueries.filter((s) => !String(s.select || '').includes('id:payload->>id') || /braceletPreview|PreviewImage|DataUrl|Snapshot/i.test(String(s.select || '')));
  rec('phase 2: the count query projects only an id column (no payload, no previews)', badProjection.length === 0, badProjection.length ? JSON.stringify(badProjection.slice(0, 2)) : 'id-only projection confirmed');
  rec('phase 2: the count query is bounded (limit 1, no full collection read)', orderQueries.every((s) => s.limit === '1'), orderQueries.map((s) => 'limit=' + s.limit).join(','));
  // New (2026-10-11) preview path: it must stay a bounded, newest-first, paid-only, preview-only read.
  const previewQueries = seen.filter((s) => s.table === 'orders' && /braceletPreviewImage/i.test(String(s.select || '')));
  rec('phase 2: the preview query is bounded and newest-first', previewQueries.length > 0
    && previewQueries.every((s) => Number(s.limit) > 0 && Number(s.limit) <= 12 && String(s.order || '').startsWith('created_at.desc')),
    JSON.stringify(previewQueries.slice(0, 2)));
  rec('phase 2: the preview query projects only the timestamp and the preview columns', previewQueries.every((s) => {
    const projection = String(s.select || '');
    return projection.includes('created_at')
      && projection.includes('payload->>braceletPreviewImage')
      && !/customerName|shippingInfo|totalPrice|stripeCheckoutSessionId|lineUserId/i.test(projection);
  }), previewQueries.length ? String(previewQueries[0].select) : 'no preview query recorded');
  rec('phase 2: the preview query keeps the paid-order filter', previewQueries.every((s) => String(s.paidFilter || '').includes('stripePaymentStatus')), previewQueries.length ? String(previewQueries[0].paidFilter).slice(0, 80) : 'n/a');
} finally {
  kill(supa);
  await new Promise((r) => stub.close(r));
}

const passed = results.filter((r) => r.pass).length;
const report = {
  harness: 'social-proof privacy + aggregate count',
  ranAt: new Date().toISOString(),
  mode: 'offline, synthetic fixtures only',
  passed,
  total: results.length,
  results
};
console.log(JSON.stringify(report, null, 1));
process.exit(passed === results.length ? 0 : 1);
