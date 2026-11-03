import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

function createPaidOrder(id, overrides = {}) {
  return {
    id,
    date: '2026-10-25T03:00:00.000Z',
    status: 'Payment Received',
    stripePaymentStatus: 'paid',
    stripeCheckoutStatus: 'complete',
    customerName: 'Synthetic Hotfix Customer',
    lineUserId: 'U_SYNTHETIC_HOTFIX',
    wristSize: 16,
    beadSize: '6',
    totalBeads: 1,
    selectedStones: [{ stoneId: 'amethyst', size: 6 }],
    ...overrides
  };
}

const dataDir = await mkdtemp(join(tmpdir(), 'lcs-order-shipped-'));
const state = {
  orders: new Map(),
  outbox: new Map(),
  orderWrites: 0,
  failOrderWrites: false,
  events: [],
  lineCalls: 0,
  linePayloads: [],
  lineMode: 'success'
};

const mockPostgrest = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  const table = url.pathname.split('/').pop();
  const bodyText = await readBody(request);
  const body = bodyText ? JSON.parse(bodyText) : null;

  if (table === 'orders' && request.method === 'GET') {
    const requestedId = String(url.searchParams.get('payload->>id') || '').replace(/^eq\./, '');
    if (!requestedId) {
      return sendJson(response, 200, [...state.orders.values()].map((order) => ({
        id: order.id,
        date: order.date,
        status: order.status,
        customerName: order.customerName,
        stripePaymentStatus: order.stripePaymentStatus,
        paymentStatus: order.paymentStatus,
        shippingCarrier: order.shippingCarrier,
        shippingCarrierCustom: order.shippingCarrierCustom,
        trackingNumber: order.trackingNumber,
        trackingUrl: order.trackingUrl,
        shippingInfo: order.shippingInfo,
        created_at: order.date
      })));
    }
    const row = state.orders.get(requestedId);
    return sendJson(response, 200, row ? [{ payload: row }] : []);
  }

  if (table === 'orders' && request.method === 'POST') {
    if (state.failOrderWrites) return sendJson(response, 500, { message: 'synthetic persistence failure' });
    state.orders.set(body.id, structuredClone(body.payload));
    state.orderWrites += 1;
    state.events.push({ type: 'order_saved', at: Date.now(), id: body.id });
    return sendJson(response, 201, [body]);
  }

  if (table === 'order_notification_outbox' && request.method === 'GET') {
    const rawOrderId = String(url.searchParams.get('order_id') || '');
    if (rawOrderId.startsWith('in.(')) {
      const ids = new Set(rawOrderId.slice(4, -1).split(','));
      return sendJson(response, 200, [...state.outbox.values()].filter((row) => ids.has(row.order_id)).map((row) => structuredClone(row)));
    }
    const orderId = rawOrderId.replace(/^eq\./, '');
    const row = state.outbox.get(orderId);
    return sendJson(response, 200, row ? [structuredClone(row)] : []);
  }

  if (table === 'order_notification_outbox' && request.method === 'POST') {
    if (!state.outbox.has(body.order_id)) {
      const row = { id: `outbox-${body.order_id}`, ...body };
      state.outbox.set(body.order_id, row);
    }
    return sendJson(response, 201, []);
  }

  if (table === 'order_notification_outbox' && request.method === 'PATCH') {
    const byId = String(url.searchParams.get('id') || '').replace(/^eq\./, '');
    const byOrderId = String(url.searchParams.get('order_id') || '').replace(/^eq\./, '');
    const stateFilter = String(url.searchParams.get('state') || '');
    const row = byId ? [...state.outbox.values()].find((entry) => entry.id === byId) : state.outbox.get(byOrderId);
    if (!row) return sendJson(response, 200, []);
    const stateMatches = stateFilter === 'eq.pending'
      ? row.state === 'pending'
      : stateFilter === 'eq.sending'
        ? row.state === 'sending'
        : stateFilter === 'in.(pending,failed)'
          ? ['pending', 'failed'].includes(row.state)
          : true;
    if (!stateMatches) return sendJson(response, 200, []);
    Object.assign(row, body);
    state.outbox.set(row.order_id, row);
    return sendJson(response, 200, [structuredClone(row)]);
  }

  if (table === 'admin_order_numbers' && request.method === 'GET') return sendJson(response, 200, []);
  return sendJson(response, 404, { message: `Unhandled mock route ${request.method} ${url.pathname}` });
});

const mockLine = http.createServer(async (request, response) => {
  const bodyText = await readBody(request);
  state.lineCalls += 1;
  let payload = null;
  try { payload = JSON.parse(bodyText); } catch {}
  state.linePayloads.push(payload);
  state.events.push({ type: 'line_attempt', at: Date.now(), mode: state.lineMode });
  if (state.lineMode === 'timeout') {
    setTimeout(() => sendJson(response, 200, {}), 500);
    return;
  }
  if (state.lineMode === 'reject') return sendJson(response, 400, { message: 'synthetic rejection' });
  if (state.lineMode === 'flex-reject-once' && payload?.messages?.[0]?.type === 'flex') {
    return sendJson(response, 400, { message: 'synthetic invalid flex' });
  }
  if (state.lineMode === 'pending') {
    setTimeout(() => sendJson(response, 200, {}), 80);
    return;
  }
  return sendJson(response, 200, {});
});

const postgrestPort = await listen(mockPostgrest);
const linePort = await listen(mockLine);
const appPort = 8796;
const app = spawn(process.execPath, ['server.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    DATA_DIR: dataDir,
    PORT: String(appPort),
    APP_ENV: 'production',
    ADMIN_API_SECRET: 'phase236-test-admin-secret',
    SUPABASE_URL: `http://127.0.0.1:${postgrestPort}`,
    SUPABASE_SERVICE_ROLE_KEY: 'phase236-test-service-key',
    LINE_CHANNEL_ACCESS_TOKEN: 'phase236-test-line-token',
    LINE_PUSH_API_URL: `http://127.0.0.1:${linePort}/push`,
    LINE_PUSH_TIMEOUT_MS: '150'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out starting CRM hotfix test server.')), 10000);
    app.stdout.on('data', (chunk) => {
      if (chunk.toString().includes(`localhost:${appPort}`)) {
        clearTimeout(timer);
        resolve();
      }
    });
    app.stderr.on('data', (chunk) => reject(new Error(chunk.toString())));
    app.once('error', reject);
  });

  const post = async (payload, { admin = true } = {}) => {
    const response = await fetch(`http://127.0.0.1:${appPort}/api/orders/update-status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(admin ? { 'x-admin-secret': 'phase236-test-admin-secret' } : {})
      },
      body: JSON.stringify(payload)
    });
    return { status: response.status, body: await response.json() };
  };

  const reset = ({ id = 'ORD-PHASE236-001', lineMode = 'success', failWrites = false } = {}) => {
    state.orders.clear();
    state.outbox.clear();
    state.orders.set(id, createPaidOrder(id));
    state.orderWrites = 0;
    state.failOrderWrites = failWrites;
    state.events = [];
    state.lineCalls = 0;
    state.linePayloads = [];
    state.lineMode = lineMode;
    return id;
  };

  await test('persists Paid to Shipped before one confirmed LINE delivery', async () => {
    const id = reset();
    const result = await post({
      id,
      status: 'Shipped',
      shippingCarrier: 'Kerry',
      trackingNumber: 'KERRY123456'
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.order.status, 'Shipped');
    assert.equal(result.body.order.trackingNumber, 'KERRY123456');
    assert.equal(result.body.notification.state, 'sent');
    assert.equal(state.orders.get(id).status, 'Shipped');
    assert.equal(state.lineCalls, 1);
    assert.ok(state.events.findIndex((event) => event.type === 'order_saved') < state.events.findIndex((event) => event.type === 'line_attempt'));
    assert.equal(state.linePayloads[0].to, 'U_SYNTHETIC_HOTFIX');
    assert.equal(state.linePayloads[0].messages[0].type, 'flex');
    assert.match(JSON.stringify(state.linePayloads[0]), /ORD-PHASE236-001/);
    assert.match(JSON.stringify(state.linePayloads[0]), /KERRY123456/);

    const retry = await post({ id, status: 'Shipped', shippingCarrier: 'Kerry', trackingNumber: 'KERRY123456' });
    assert.equal(retry.status, 200);
    assert.equal(retry.body.notification.state, 'sent');
    assert.equal(state.lineCalls, 1);

    const detailResponse = await fetch(`http://127.0.0.1:${appPort}/api/crm/orders/${encodeURIComponent(id)}`, {
      headers: { 'x-admin-secret': 'phase236-test-admin-secret' }
    });
    const detail = await detailResponse.json();
    assert.equal(detailResponse.status, 200);
    assert.equal(detail.status, 'Shipped');
    assert.equal(detail.shippedNotification.state, 'sent');

    const listResponse = await fetch(`http://127.0.0.1:${appPort}/api/crm/orders?page=1&limit=20`, {
      headers: { 'x-admin-secret': 'phase236-test-admin-secret' }
    });
    const list = await listResponse.json();
    assert.equal(listResponse.status, 200);
    assert.equal(list.orders[0].status, 'Shipped');
    assert.equal(list.orders[0].shippingCarrier, 'Kerry');
    assert.equal(list.orders[0].trackingNumber, 'KERRY123456');
    assert.equal(list.orders[0].shippedNotification.state, 'sent');
  });

  await test('concurrent saves produce one LINE attempt', async () => {
    const id = reset({ lineMode: 'pending' });
    const payload = { id, status: 'Shipped', shippingCarrier: 'Flash', trackingNumber: 'FLASH9988' };
    const [first, second] = await Promise.all([post(payload), post(payload)]);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(state.orders.get(id).status, 'Shipped');
    assert.equal(state.lineCalls, 1);
    assert.equal(state.outbox.get(id).state, 'sent');
  });

  await test('keeps Shipped persisted when LINE rejects and only retries a definitive failure', async () => {
    const id = reset({ lineMode: 'reject' });
    const payload = { id, status: 'Shipped', shippingCarrier: 'Kerry', trackingNumber: 'REJECTED1' };
    const rejected = await post(payload);
    assert.equal(rejected.status, 200);
    assert.equal(rejected.body.order.status, 'Shipped');
    assert.equal(rejected.body.notification.state, 'failed');
    // A definitive 400 allows the safe plain-text fallback; neither rejected attempt was delivered.
    assert.equal(state.lineCalls, 2);

    state.lineMode = 'success';
    const retry = await post(payload);
    assert.equal(retry.status, 200);
    assert.equal(retry.body.notification.state, 'sent');
    assert.equal(state.lineCalls, 3);
  });

  await test('marks timeout uncertain and blocks automatic resend', async () => {
    const id = reset({ lineMode: 'timeout' });
    const payload = { id, status: 'Shipped', shippingCarrier: 'Kerry', trackingNumber: 'TIMEOUT1' };
    const uncertain = await post(payload);
    assert.equal(uncertain.status, 200);
    assert.equal(uncertain.body.order.status, 'Shipped');
    assert.equal(uncertain.body.notification.state, 'uncertain');
    assert.equal(state.lineCalls, 1);

    const retry = await post(payload);
    assert.equal(retry.status, 200);
    assert.equal(retry.body.notification.state, 'uncertain');
    assert.equal(state.lineCalls, 1);
  });

  await test('uses text fallback only after a definitive Flex rejection', async () => {
    const id = reset({ lineMode: 'flex-reject-once' });
    const result = await post({ id, status: 'Shipped', shippingCarrier: 'Kerry', trackingNumber: 'FLEXFALLBACK1' });
    assert.equal(result.status, 200);
    assert.equal(result.body.notification.state, 'sent');
    assert.equal(state.lineCalls, 2);
    assert.equal(state.linePayloads[0].messages[0].type, 'flex');
    assert.equal(state.linePayloads[1].messages[0].type, 'text');
  });

  await test('persistence failure is 5xx and sends no LINE message', async () => {
    const id = reset({ failWrites: true });
    const result = await post({ id, status: 'Shipped', shippingCarrier: 'Kerry', trackingNumber: 'FAILWRITE1' });
    assert.equal(result.status, 500);
    assert.equal(state.orders.get(id).status, 'Payment Received');
    assert.equal(state.lineCalls, 0);
  });

  await test('returns 404, 400, and 409 without notification', async () => {
    const id = reset();
    assert.equal((await post({ id: 'ORD-\u0000INVALID', status: 'Shipped', shippingCarrier: 'Kerry', trackingNumber: 'TRACK1' })).status, 400);
    assert.equal((await post({ id: 'ORD-MISSING', status: 'Shipped', shippingCarrier: 'Kerry', trackingNumber: 'TRACK1' })).status, 404);
    assert.equal((await post({ id, status: 'Delivered' })).status, 400);
    assert.equal((await post({ id, status: 'Shipped', shippingCarrier: 'Kerry' })).status, 400);
    state.orders.set(id, createPaidOrder(id, { status: 'Shipped', shippingCarrier: 'Kerry', trackingNumber: 'TRACK1' }));
    assert.equal((await post({ id, status: 'Payment Received', shippingCarrier: 'Kerry', trackingNumber: 'TRACK1' })).status, 409);
    assert.equal(state.lineCalls, 0);
  });

  await test('persists custom carrier and rejects unauthorized admin writes', async () => {
    const id = reset();
    const unauthorized = await post({ id, status: 'Shipped', trackingNumber: 'TRACK1' }, { admin: false });
    assert.equal(unauthorized.status, 401);
    assert.equal(state.orders.get(id).status, 'Payment Received');

    const result = await post({
      id,
      status: 'Shipped',
      shippingCarrier: 'Other',
      shippingCarrierCustom: 'Local Courier',
      trackingNumber: 'CUSTOM123'
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.order.shippingCarrier, 'Other');
    assert.equal(result.body.order.shippingCarrierCustom, 'Local Courier');
    assert.equal(result.body.order.trackingNumber, 'CUSTOM123');
  });

  await test('non-Shipped workflow updates remain non-notifying and forward-only', async () => {
    const id = reset();
    const paid = await post({ id, status: 'Payment Received', shippingCarrier: 'Kerry', trackingNumber: 'PRESHIP123' });
    assert.equal(paid.status, 200);
    assert.equal(paid.body.order.status, 'Payment Received');
    assert.equal(paid.body.notification.state, 'skipped');

    const shipped = await post({ id, status: 'Shipped', shippingCarrier: 'Kerry', trackingNumber: 'PRESHIP123' });
    assert.equal(shipped.status, 200);
    assert.equal(shipped.body.notification.state, 'sent');
    const completed = await post({ id, status: 'Completed', shippingCarrier: 'Kerry', trackingNumber: 'PRESHIP123' });
    assert.equal(completed.status, 200);
    assert.equal(completed.body.order.status, 'Completed');
    assert.equal(state.lineCalls, 1);
  });

  await test('records skipped when a Shipped order has no LINE recipient', async () => {
    const id = reset();
    state.orders.set(id, createPaidOrder(id, { lineUserId: '' }));
    const result = await post({ id, status: 'Shipped', shippingCarrier: 'Kerry', trackingNumber: 'NOLINE1' });
    assert.equal(result.status, 200);
    assert.equal(result.body.notification.state, 'skipped');
    assert.equal(result.body.notification.lastErrorCode, 'no_line_user');
    assert.equal(state.outbox.get(id).state, 'skipped');
    assert.equal(state.lineCalls, 0);
  });
} finally {
  app.kill();
  await close(mockLine);
  await close(mockPostgrest);
  await rm(dataDir, { recursive: true, force: true });
}
