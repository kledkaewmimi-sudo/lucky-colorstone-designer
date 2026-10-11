// ISSUE 1 evidence: bidirectional talisman status persistence.
//
//   node .../crm-charm-status-matrix.mjs
//
// Drives the REAL client helper (data.js saveSharedCharmCatalogEntry -> crmAdminHeaders -> PUT
// /api/charms/:id) against a REAL backend process (JSON mode, synthetic DATA_DIR) with a real
// operator login + CSRF, over the owner's exact reproduction and the mandated transition matrix.
// No production data, no production secret, no network egress.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const CAND = path.resolve('reports/production/full-uat-feature-migration-20261009/reconciled-candidate');
// LCS_SERVER_DIR lets the same matrix run against a different server tree (e.g. the currently
// deployed backend revision) while the client helper still comes from the release candidate.
const SERVER_DIR = process.env.LCS_SERVER_DIR ? path.resolve(process.env.LCS_SERVER_DIR) : CAND;
const OUT = 'reports/production/production-bugfix-batch-20261011/evidence';
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'lcs-charm-status-'));
const ADMIN_SECRET = 'qa-synthetic-admin-secret-' + Math.random().toString(16).slice(2, 10);
const ADMIN_USER = 'qa-operator';

// The exact shape the disabled production cl01 row carries: stock quantity intact, flat AND nested
// status flags false (that combination is what made the reactivation impossible).
const cloverShape = (overrides = {}) => ({
  id: 'qa-cl01',
  entityType: 'charm',
  sku: 'QA-CL01',
  slug: 'qa-cl01',
  type: 'bee_heart',
  categoryId: 'clover',
  collection: 'clover',
  name: { en: 'QA Clover', th: '' },
  image: { primary: '/assets/charms/_placeholder.png' },
  pricing: { base: 290 },
  business: { sizeCm: 2.7, footprintMm: 4.2 },
  meaning: { en: 'QA fixture', th: '' },
  inStock: false,
  isActive: false,
  stockQty: 1000,
  stock_qty: 1000,
  availability: { inStock: false, isActive: false, stockQty: 1000, stock_qty: 1000 },
  renderTuning: { visualScale: 1, visualOffsetX: 0, visualOffsetY: 0, maxWidthRatio: 1, maxHeightRatio: 1, edgeFitMode: 'horizontal_fill', targetWidthFillRatio: 1, contactInsetLeft: 0.4, contactInsetRight: 0.4, rotation: 0, anchor: 'top' },
  displayOrder: 170,
  ...overrides
});

fs.writeFileSync(path.join(DATA, 'charms.json'), JSON.stringify([cloverShape()], null, 1), 'utf8');
fs.writeFileSync(path.join(DATA, 'spacers.json'), '[]', 'utf8');
fs.writeFileSync(path.join(DATA, 'stones.json'), '[]', 'utf8');
fs.writeFileSync(path.join(DATA, 'orders.json'), '[]', 'utf8');
fs.writeFileSync(path.join(DATA, 'settings.json'), '{}', 'utf8');

const freePort = () => new Promise((resolve) => { const probe = net.createServer(); probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)); }); });
const port = await freePort();
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [path.join(SERVER_DIR, 'server.js')], {
  cwd: SERVER_DIR,
  env: { ...process.env, PORT: String(port), DATA_DIR: DATA, ADMIN_API_SECRET: ADMIN_SECRET, ADMIN_USERNAME: ADMIN_USER, SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', STRIPE_WEBHOOK_SECRET: '', LINE_CHANNEL_SECRET: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true
});
let serverLog = '';
server.stdout.on('data', (chunk) => { serverLog += chunk; });
server.stderr.on('data', (chunk) => { serverLog += chunk; });
const ready = async () => { for (let i = 0; i < 60; i += 1) { try { if ((await fetch(`${base}/api/settings`)).ok) return true; } catch { /* retry */ } await new Promise((r) => setTimeout(r, 200)); } return false; };

const results = [];
const rec = (id, pass, detail = '') => { results.push({ id, pass: Boolean(pass), detail: String(detail).slice(0, 400) }); console.log(`${pass ? 'PASS' : 'FAIL'} ${id} :: ${String(detail).slice(0, 220)}`); };
const requests = [];

try {
  if (!await ready()) throw new Error('server did not start: ' + serverLog.slice(0, 300));

  // ---- real operator login (synthetic credentials) ---------------------------------------------
  const login = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_SECRET }) });
  const loginBody = await login.json();
  const cookieHeader = (login.headers.getSetCookie ? login.headers.getSetCookie() : [login.headers.get('set-cookie')])
    .filter(Boolean).map((entry) => String(entry).split(';')[0]).join('; ');
  rec('synthetic operator login succeeds and returns CSRF', login.ok && Boolean(loginBody.csrf) && cookieHeader.includes('lcs_admin_session'), `HTTP ${login.status} csrf=${Boolean(loginBody.csrf)}`);

  // ---- real client surfaces the helper reads ---------------------------------------------------
  globalThis.window = { dispatchEvent() {} };
  globalThis.document = { cookie: `lcs_admin_csrf=${loginBody.csrf}` };
  globalThis.localStorage = { getItem: () => '', setItem() {}, removeItem() {} };
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input).startsWith('/') ? `${base}${input}` : String(input);
    const headers = { ...(init.headers || {}) };
    if (url.includes('/api/charms')) headers.cookie = cookieHeader;
    const response = await nativeFetch(url, { ...init, headers });
    if (url.includes('/api/charms')) {
      const clone = response.clone();
      const body = await clone.json().catch(() => null);
      requests.push({ method: (init.method || 'GET').toUpperCase(), url: url.replace(base, ''), status: response.status, body: body ? JSON.stringify(body).slice(0, 400) : null });
    }
    return response;
  };

  const data = await import(`file:///${path.join(CAND, 'data.js').replace(/\\/g, '/')}`);
  const authoritative = async () => {
    const response = await fetch(`${base}/api/charms`, { headers: { cookie: cookieHeader } });
    return (await response.json()).find((entry) => entry.id === 'qa-cl01');
  };
  const clientView = async () => {
    await data.refreshCharmCatalog();
    return (await data.getSharedCharmCatalog()).find((entry) => entry.id === 'qa-cl01');
  };
  const flags = (record) => ({
    inStock: record?.inStock,
    isActive: record?.isActive,
    availabilityInStock: record?.availability?.inStock,
    availabilityIsActive: record?.availability?.isActive,
    stockQty: Number(record?.stockQty ?? record?.availability?.stockQty)
  });
  const statusOf = (record) => `${record?.availability?.inStock === true ? 'in' : 'out'}/${record?.availability?.isActive === true ? 'active' : 'inactive'}`;

  // The record itself must express the owner's starting state.
  rec('fixture starts in the owner-observed disabled state with stock 1000', statusOf(await authoritative()) === 'out/inactive' && Number((await authoritative()).stockQty) === 1000, JSON.stringify(flags(await authoritative())));

  // ---- the owner's exact reproduction ----------------------------------------------------------
  const beforeDisable = await clientView();
  const enableShape = { ...beforeDisable, availability: { ...beforeDisable.availability, stockQty: 1000, stock_qty: 1000, inStock: true, isActive: true } };
  const disableShape = { ...beforeDisable, availability: { ...beforeDisable.availability, stockQty: 1000, stock_qty: 1000, inStock: false, isActive: false } };
  const save = async (shape, label) => {
    const saved = await data.saveSharedCharmCatalogEntry(shape, { mode: 'update' });
    const error = data.getLastCharmSaveError();
    const stored = await authoritative();
    return { saved, error, stored };
  };

  const firstDisable = await save(disableShape, 'disable');
  rec('owner step 3: disable saves and persists', statusOf(firstDisable.stored) === 'out/inactive' && !firstDisable.error, JSON.stringify(flags(firstDisable.stored)));
  rec('stock quantity 1000 survives the status-only disable', Number(firstDisable.stored.stockQty) === 1000, JSON.stringify(flags(firstDisable.stored)));

  const reopenAfterDisable = await clientView();
  rec('owner step 5: reopening shows both checkboxes unchecked', statusOf(reopenAfterDisable) === 'out/inactive', JSON.stringify(flags(reopenAfterDisable)));

  const reactivate = await save({ ...reopenAfterDisable, availability: { ...reopenAfterDisable.availability, inStock: true, isActive: true } }, 'reactivate');
  rec('owner step 8: re-enabling both checkboxes persists (the reported failure)', statusOf(reactivate.stored) === 'in/active' && !reactivate.error, JSON.stringify(flags(reactivate.stored)));

  const freshRead = await clientView();
  rec('owner step 9: a fresh authenticated read shows both flags restored', statusOf(freshRead) === 'in/active', JSON.stringify(flags(freshRead)));

  const chatty = requests.filter((entry) => entry.method === 'PUT');
  rec('the reactivating request carried explicit true flags', chatty.some((entry) => /"inStock":true/.test(entry.body || '') && /"isActive":true/.test(entry.body || '')), (chatty[chatty.length - 1] || {}).body || 'no PUT captured');

  // ---- mandated transition matrix --------------------------------------------------------------
  const setStatus = async (inStock, isActive, label, stockQty = null) => {
    const current = await clientView();
    const quantity = stockQty === null ? Number(current.availability?.stockQty ?? current.stockQty ?? 1000) : Number(stockQty);
    const stored = await data.saveSharedCharmCatalogEntry(
      { ...current, availability: { ...current.availability, stockQty: quantity, stock_qty: quantity, inStock, isActive } },
      { mode: 'update' }
    );
    const authoritativeRecord = await authoritative();
    const expectInStock = inStock && quantity > 0;
    const ok = statusOf(authoritativeRecord) === `${expectInStock ? 'in' : 'out'}/${isActive ? 'active' : 'inactive'}`
      && Number(authoritativeRecord.stockQty) === quantity;
    rec(`${label}: ${inStock ? 'IN STOCK' : 'out of stock'} (qty ${quantity}) + ${isActive ? 'ACTIVE' : 'inactive'} persists`, ok && Boolean(stored), JSON.stringify(flags(authoritativeRecord)));
    return authoritativeRecord;
  };

  await setStatus(true, true, '1a true/true');
  await setStatus(false, false, '1b false/false');
  await setStatus(true, true, '1c true/true again');

  await setStatus(false, true, '2a false/true');
  await setStatus(true, true, '2b true/true again');

  await setStatus(true, false, '3a true/false');
  await setStatus(true, true, '3b true/true again');

  await setStatus(false, false, '4a false/false');
  await setStatus(true, false, '4b false/inactive -> true/inactive');
  await setStatus(true, true, '4c true/true again');

  const twice = await setStatus(true, true, '5 duplicate save');
  rec('6 save after a page refresh persists', statusOf(await clientView()) === 'in/active', JSON.stringify(flags(twice)));

  const stockBefore = Number((await authoritative()).stockQty);
  await setStatus(false, true, '8a status-only edit');
  await setStatus(true, true, '8b status-only edit back');
  rec('8 stock quantity 1000 is untouched by status-only edits', Number((await authoritative()).stockQty) === stockBefore && stockBefore === 1000, `stock ${stockBefore} -> ${Number((await authoritative()).stockQty)}`);

  const zero = await (async () => {
    const current = await clientView();
    await data.saveSharedCharmCatalogEntry({ ...current, availability: { ...current.availability, stockQty: 0, stock_qty: 0, inStock: false, isActive: true } }, { mode: 'update' });
    return authoritative();
  })();
  rec('9 zero stock with active status stores inStock:false + isActive:true', statusOf(zero) === 'out/active' && Number(zero.stockQty) === 0, JSON.stringify(flags(zero)));
  const restored = await setStatus(true, true, '9b restore', 1000);
  rec('9c the reactivated zero-stock record keeps 1000 units and both flags', statusOf(restored) === 'in/active' && Number(restored.stockQty) === 1000, JSON.stringify(flags(restored)));

  // Case 7: a record that is hidden AND inactive (the state the owner's cl01 is stuck in) must be
  // re-enableable from the client view alone.
  await setStatus(false, false, '7a hide + deactivate', 1000);
  const hiddenFixture = await clientView();
  const reenabled = await setStatus(true, true, '7b re-enable the hidden/inactive record', 1000);
  rec('7 previously hidden/inactive existing record can be re-enabled', statusOf(hiddenFixture) === 'out/inactive' && statusOf(reenabled) === 'in/active', JSON.stringify(flags(reenabled)));

  // ---- security must stay enforced --------------------------------------------------------------
  const anonymousPut = await fetch(`${base}/api/charms/qa-cl01`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cloverShape()) });
  rec('10 unauthenticated PUT /api/charms/:id is still rejected', anonymousPut.status === 401 || anonymousPut.status === 403, `HTTP ${anonymousPut.status}`);
  const noCsrf = await fetch(`${base}/api/charms/qa-cl01`, { method: 'PUT', headers: { 'content-type': 'application/json', cookie: cookieHeader }, body: JSON.stringify(cloverShape()) });
  rec('10 cookie-authenticated PUT without x-csrf-token is still rejected', noCsrf.status === 403, `HTTP ${noCsrf.status}`);

  const priceNow = Number((await authoritative()).pricing.base);
  rec('no unrelated field changed (price + render tuning intact)', priceNow === 290 && JSON.stringify((await authoritative()).renderTuning) === JSON.stringify(cloverShape().renderTuning), `price=${priceNow}`);
} catch (error) {
  rec('harness completed without an unhandled error', false, String(error?.message || error));
} finally {
  server.kill();
  await new Promise((resolve) => setTimeout(resolve, 300));
}

const summary = {
  harness: 'CRM talisman status persistence matrix (issue 1)',
  ranAt: new Date().toISOString(),
  dataDir: DATA,
  passed: results.filter((entry) => entry.pass).length,
  failed: results.filter((entry) => !entry.pass).length,
  results,
  requests,
  serverLog: serverLog.slice(0, 400)
};
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'crm-charm-status-matrix.json'), JSON.stringify(summary, null, 1) + '\n', 'utf8');
console.log(JSON.stringify({ passed: summary.passed, failed: summary.failed }, null, 1));
process.exit(summary.failed === 0 ? 0 : 1);
