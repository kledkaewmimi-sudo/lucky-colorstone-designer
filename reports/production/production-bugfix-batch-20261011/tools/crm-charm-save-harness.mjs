// TASK A — isolated reproduction + regression harness for the CRM talisman save path.
//
// Starts the production backend from the release candidate in JSON mode against a synthetic catalog and
// drives the real authenticated contract: POST /api/admin/login -> session cookie + CSRF, then
// PUT /api/charms/:id with the CRM's headers (cookie + x-csrf-token). No production data, no production
// secret, no network egress.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const CAND = path.resolve('reports/production/full-uat-feature-migration-20261009/reconciled-candidate');
const OUT = 'reports/production/production-bugfix-batch-20261011/evidence';
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'lcs-crm-charm-'));
const ADMIN_SECRET = 'qa-synthetic-admin-secret-' + Math.random().toString(16).slice(2, 10);
const ADMIN_USER = 'qa-operator';

const synthCharm = (id, overrides = {}) => ({
  id,
  entityType: 'charm',
  sku: id.toUpperCase(),
  skuId: id,
  slug: id,
  name: { en: 'QA Synthetic Charm ' + id.toUpperCase(), th: '' },
  categoryId: 'qa',
  type: 'takrud_lukshmi',
  collection: 'qa',
  image: { primary: '/assets/charms/_placeholder.png' },
  pricing: { base: 590 },
  business: { sizeCm: 3, footprintMm: 30 },
  meaning: { en: 'QA synthetic record', th: '' },
  availability: { inStock: true, isActive: true, stockQty: 7, stock_qty: 7 },
  stockQty: 7,
  stock_qty: 7,
  in_stock: true,
  is_active: true,
  renderTuning: { visualScale: 1, visualOffsetX: 0, visualOffsetY: 0, maxWidthRatio: 0.98, maxHeightRatio: 1, rotation: 0, anchor: 'top', edgeFitMode: 'contain' },
  displayOrder: 90,
  ...overrides
});

const fixtures = [
  synthCharm('qa01'),
  // A record that is hidden from the customer catalog (the case the CRM edit modal can still target).
  synthCharm('qa02', { availability: { inStock: false, isActive: false, stockQty: 0, stock_qty: 0 }, stockQty: 0, stock_qty: 0, in_stock: false, is_active: false })
];
fs.writeFileSync(path.join(DATA, 'charms.json'), JSON.stringify(fixtures, null, 1), 'utf8');
fs.writeFileSync(path.join(DATA, 'spacers.json'), '[]', 'utf8');
fs.writeFileSync(path.join(DATA, 'stones.json'), '[]', 'utf8');
fs.writeFileSync(path.join(DATA, 'orders.json'), '[]', 'utf8');
fs.writeFileSync(path.join(DATA, 'settings.json'), '{}', 'utf8');

const freePort = () => new Promise((resolve) => { const probe = net.createServer(); probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)); }); });
const port = await freePort();
const server = spawn(process.execPath, [path.join(CAND, 'server.js')], {
  cwd: CAND,
  env: { ...process.env, PORT: String(port), DATA_DIR: DATA, ADMIN_API_SECRET: ADMIN_SECRET, ADMIN_USERNAME: ADMIN_USER, SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', STRIPE_WEBHOOK_SECRET: '', LINE_CHANNEL_SECRET: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true
});
let log = '';
server.stdout.on('data', (chunk) => { log += chunk; });
server.stderr.on('data', (chunk) => { log += chunk; });
const base = `http://127.0.0.1:${port}`;
const ready = async () => { for (let i = 0; i < 60; i += 1) { try { if ((await fetch(base + '/api/settings')).ok) return true; } catch { /* retry */ } await new Promise((r) => setTimeout(r, 200)); } return false; };

const results = [];
const rec = (id, pass, detail = '') => { results.push({ id, pass: Boolean(pass), detail: String(detail).slice(0, 300) }); console.log(`${pass ? 'PASS' : 'FAIL'} ${id} :: ${String(detail).slice(0, 160)}`); };

try {
  if (!await ready()) throw new Error('server did not start: ' + log.slice(0, 300));

  // ---- unauthenticated write must be rejected -------------------------------------------------
  const anon = await fetch(`${base}/api/charms/qa01`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(synthCharm('qa01')) });
  rec('unauthenticated PUT /api/charms/:id is rejected', anon.status === 401 || anon.status === 403, 'HTTP ' + anon.status);

  // ---- operator login (synthetic credentials) -------------------------------------------------
  const login = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_SECRET }) });
  const loginBody = await login.json().catch(() => null);
  const setCookie = login.headers.getSetCookie ? login.headers.getSetCookie() : [login.headers.get('set-cookie')].filter(Boolean);
  const cookieHeader = setCookie.map((entry) => String(entry).split(';')[0]).join('; ');
  rec('synthetic operator login succeeds and returns a CSRF token', login.ok && Boolean(loginBody?.csrf) && cookieHeader.includes('lcs_admin_session'), `HTTP ${login.status} cookies=${setCookie.length} csrf=${Boolean(loginBody?.csrf)}`);

  // ---- authenticated write without the CSRF token must still be rejected ----------------------
  const noCsrf = await fetch(`${base}/api/charms/qa01`, { method: 'PUT', headers: { 'content-type': 'application/json', cookie: cookieHeader }, body: JSON.stringify(synthCharm('qa01')) });
  rec('cookie-authenticated PUT without x-csrf-token is rejected', noCsrf.status === 403, 'HTTP ' + noCsrf.status);

  // ---- the CRM's real save: stock change with pricing/render-tuning preservation ---------------
  const before = (await (await fetch(`${base}/api/charms`)).json()).find((entry) => entry.id === 'qa01');
  const edited = synthCharm('qa01', {
    availability: { inStock: true, isActive: true, stockQty: 42, stock_qty: 42 },
    stockQty: 42,
    stock_qty: 42,
    availabilityIntent: { stockQty: 42, inStock: true }
  });
  const save = await fetch(`${base}/api/charms/qa01`, { method: 'PUT', headers: { 'content-type': 'application/json', cookie: cookieHeader, 'x-csrf-token': String(loginBody?.csrf || '') }, body: JSON.stringify(edited) });
  const saveBody = await save.json().catch(() => null);
  rec('authenticated operator can save a talisman change', save.ok, `HTTP ${save.status} ${saveBody?.error || ''}`);

  const after = (await (await fetch(`${base}/api/charms`)).json()).find((entry) => entry.id === 'qa01');
  rec('stock quantity persists and reaches the customer catalog', Number(after?.availability?.stockQty ?? after?.stockQty) === 42, JSON.stringify({ availability: after?.availability, stockQty: after?.stockQty }));
  rec('pricing is preserved by the save', Number(after?.pricing?.base) === Number(before?.pricing?.base), `before=${before?.pricing?.base} after=${after?.pricing?.base}`);
  rec('render-tuning fields are preserved by the save', JSON.stringify(after?.renderTuning) === JSON.stringify(before?.renderTuning), JSON.stringify(after?.renderTuning));

  // ---- inactive record: what the server really publishes, and the authorized update path -------
  // Verified contract (2026-10-11): GET /api/charms has NO visibility filter, so an inactive record
  // is still listed and the CRM can open it. A stale/fallback client list is therefore the only way
  // the CRM can believe an existing id is new - which is why the write verb must follow the server's
  // own duplicate check instead of list membership.
  const listed = await (await fetch(`${base}/api/charms`)).json();
  const hiddenRecord = listed.find((entry) => entry.id === 'qa02');
  rec('the API still lists an inactive talisman (visibility is not a server-side filter)', Boolean(hiddenRecord) && hiddenRecord?.availability?.isActive === false, JSON.stringify({ ids: listed.map((entry) => entry.id), isActive: hiddenRecord?.availability?.isActive }));
  const hiddenPut = await fetch(`${base}/api/charms/qa02`, { method: 'PUT', headers: { 'content-type': 'application/json', cookie: cookieHeader, 'x-csrf-token': String(loginBody?.csrf || '') }, body: JSON.stringify(synthCharm('qa02', { availability: { inStock: true, isActive: true, stockQty: 11, stock_qty: 11 } })) });
  const hiddenAfter = (await (await fetch(`${base}/api/charms`)).json()).find((entry) => entry.id === 'qa02');
  rec(
    'an inactive talisman can be re-activated by the authorized update path',
    hiddenPut.ok && hiddenAfter?.availability?.isActive === true && Number(hiddenAfter?.availability?.stockQty) === 11,
    `HTTP ${hiddenPut.status} ${JSON.stringify(hiddenAfter?.availability)}`
  );
  rec('the re-activated save keeps the protected render-tuning fields', JSON.stringify(hiddenAfter?.renderTuning) === JSON.stringify(synthCharm('qa02').renderTuning), JSON.stringify(hiddenAfter?.renderTuning));
  const hiddenPost = await fetch(`${base}/api/charms`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: cookieHeader, 'x-csrf-token': String(loginBody?.csrf || '') }, body: JSON.stringify(synthCharm('qa01')) });
  rec('POSTing an existing id is refused with 409 (the failure a POST-instead-of-PUT edit would hit)', hiddenPost.status === 409, 'HTTP ' + hiddenPost.status);
  const unknownPut = await fetch(`${base}/api/charms/qa99`, { method: 'PUT', headers: { 'content-type': 'application/json', cookie: cookieHeader, 'x-csrf-token': String(loginBody?.csrf || '') }, body: JSON.stringify(synthCharm('qa99')) });
  const unknownBody = await unknownPut.json().catch(() => null);
  rec('updating an id the catalog does not store is refused with 404 (the stale catalog list case)', unknownPut.status === 404, `HTTP ${unknownPut.status} ${unknownBody?.error || ''}`);
  const zeroStock = await fetch(`${base}/api/charms/qa01`, { method: 'PUT', headers: { 'content-type': 'application/json', cookie: cookieHeader, 'x-csrf-token': String(loginBody?.csrf || '') }, body: JSON.stringify(synthCharm('qa01', { availability: { inStock: false, isActive: true, stockQty: 0, stock_qty: 0 }, stockQty: 0, stock_qty: 0 })) });
  const zeroAfter = (await (await fetch(`${base}/api/charms`)).json()).find((entry) => entry.id === 'qa01');
  rec(
    'zero stock keeps the talisman active (fulfillment state and design eligibility stay separate)',
    zeroStock.ok && Number(zeroAfter?.availability?.stockQty) === 0 && zeroAfter?.availability?.isActive === true,
    JSON.stringify(zeroAfter?.availability)
  );
} catch (error) {
  rec('harness completed without an unhandled error', false, String(error?.message || error));
} finally {
  server.kill();
  await new Promise((resolve) => setTimeout(resolve, 300));
}

const summary = { ranAt: new Date().toISOString(), dataDir: DATA, passed: results.filter((entry) => entry.pass).length, failed: results.filter((entry) => !entry.pass).length, results, serverLog: log.slice(0, 400) };
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'crm-charm-save-harness.json'), JSON.stringify(summary, null, 1) + '\n', 'utf8');
console.log(JSON.stringify({ passed: summary.passed, failed: summary.failed }, null, 1));
process.exit(summary.failed === 0 ? 0 : 1);
