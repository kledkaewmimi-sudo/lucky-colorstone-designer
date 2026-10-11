import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  getLastCharmSaveError,
  refreshCharmCatalog,
  saveSharedCharmCatalogEntry
} from '../data.js';

// The CRM write path talks to fetch/document/window, so the harness provides the same surfaces the
// browser gives data.js plus a synthetic charm store: `listed` is what GET /api/charms publishes,
// `stored` is what the server can actually update. A record that is stored but not listed is the
// hidden/inactive case the CRM must not treat as "new".
const charm = (id, overrides = {}) => ({
  id,
  entityType: 'charm',
  sku: id.toUpperCase(),
  slug: id,
  type: 'takrud_lukshmi',
  collection: 'qa',
  categoryId: 'qa',
  name: { en: 'QA ' + id, th: '' },
  image: { primary: '/assets/charms/_placeholder.png' },
  pricing: { base: 590 },
  business: { sizeCm: 3, footprintMm: 30 },
  meaning: { en: 'QA fixture', th: '' },
  availability: { inStock: true, isActive: true, stockQty: 7, stock_qty: 7 },
  stockQty: 7,
  stock_qty: 7,
  renderTuning: { visualScale: 1.25, visualOffsetX: 3, visualOffsetY: -2, maxWidthRatio: 0.98, maxHeightRatio: 1, rotation: 0, anchor: 'top', edgeFitMode: 'contain' },
  displayOrder: 90,
  ...overrides
});

function installHarness({ listed, stored, listedAfterDuplicate = null }) {
  const state = {
    requests: [],
    listed: listed.map((record) => ({ ...record })),
    stored: stored.map((record) => ({ ...record }))
  };
  const respond = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  });
  const previous = { fetch: globalThis.fetch, window: globalThis.window, document: globalThis.document, localStorage: globalThis.localStorage };

  globalThis.window = { dispatchEvent() {} };
  globalThis.document = { cookie: 'lcs_admin_csrf=qa-csrf' };
  globalThis.localStorage = { getItem: () => 'qa-admin-secret', setItem() {}, removeItem() {} };
  globalThis.fetch = async (url, init = {}) => {
    const path = String(url);
    const method = String(init.method || 'GET').toUpperCase();
    const body = init.body ? JSON.parse(init.body) : null;
    state.requests.push({ path, method, body, headers: init.headers || {} });

    if (path === '/api/charms' && method === 'GET') return respond(200, state.listed);
    if (path === '/data/charms.json') return respond(404, {});
    if (path === '/api/charms' && method === 'POST') {
      if (state.stored.some((entry) => entry.id === body?.id)) {
        if (listedAfterDuplicate) state.listed = listedAfterDuplicate.map((record) => ({ ...record }));
        return respond(409, { error: 'Charm already exists' });
      }
      state.stored.push(body);
      return respond(201, body);
    }
    if (path.startsWith('/api/charms/') && method === 'PUT') {
      const id = decodeURIComponent(path.slice('/api/charms/'.length));
      const index = state.stored.findIndex((entry) => entry.id === id);
      if (index < 0) return respond(404, { error: 'Charm not found' });
      state.stored[index] = { ...body, id };
      return respond(200, { ...body, id });
    }
    throw new Error(`unexpected request ${method} ${path}`);
  };

  return {
    state,
    restore() {
      globalThis.fetch = previous.fetch;
      globalThis.window = previous.window;
      globalThis.document = previous.document;
      globalThis.localStorage = previous.localStorage;
    }
  };
}

async function withHarness(options, run) {
  const harness = installHarness(options);
  try {
    await refreshCharmCatalog();
    harness.state.requests.length = 0; // drop the setup refresh so assertions see only the save
    return await run(harness.state);
  } finally {
    harness.restore();
  }
}

const storedCharm = (state, id) => state.stored.find((entry) => entry.id === id);
const requestLog = (state) => state.requests.map((entry) => `${entry.method} ${entry.path}`);

test('a talisman the visible catalog lists is updated with PUT and keeps its protected render tuning', async () => {
  await withHarness({ listed: [charm('qa01')], stored: [charm('qa01')] }, async (state) => {
    const saved = await saveSharedCharmCatalogEntry(
      charm('qa01', {
        availability: { inStock: true, isActive: true, stockQty: 42, stock_qty: 42 },
        stockQty: 42,
        stock_qty: 42,
        pricing: { base: 650 }
      }),
      { mode: 'update' }
    );

    assert.equal(getLastCharmSaveError(), '');
    assert.equal(saved.id, 'qa01');
    assert.deepEqual(requestLog(state), ['PUT /api/charms/qa01', 'GET /api/charms']);
    assert.equal(storedCharm(state, 'qa01').availability.stockQty, 42);
    assert.equal(storedCharm(state, 'qa01').availability.isActive, true);
    assert.equal(storedCharm(state, 'qa01').pricing.base, 650);
    assert.deepEqual(storedCharm(state, 'qa01').renderTuning, charm('qa01').renderTuning);
  });
});

test('a hidden talisman id refused by POST is updated by id instead of failing silently', async () => {
  const hidden = charm('qa02', {
    availability: { inStock: false, isActive: false, stockQty: 0, stock_qty: 0 },
    stockQty: 0,
    stock_qty: 0
  });
  await withHarness(
    { listed: [charm('qa01')], stored: [charm('qa01'), hidden], listedAfterDuplicate: [charm('qa01'), hidden] },
    async (state) => {
      const saved = await saveSharedCharmCatalogEntry(
        charm('qa02', {
          availability: { inStock: true, isActive: true, stockQty: 5, stock_qty: 5 },
          stockQty: 5,
          stock_qty: 5,
          pricing: { base: 700 }
        }),
        { mode: 'create' }
      );

      assert.equal(getLastCharmSaveError(), '');
      assert.equal(saved.id, 'qa02');
      assert.deepEqual(requestLog(state), ['POST /api/charms', 'GET /api/charms', 'PUT /api/charms/qa02', 'GET /api/charms']);
      assert.equal(storedCharm(state, 'qa02').availability.stockQty, 5);
      assert.equal(storedCharm(state, 'qa02').availability.isActive, true);
      assert.equal(storedCharm(state, 'qa02').pricing.base, 700);
      assert.deepEqual(storedCharm(state, 'qa02').renderTuning, hidden.renderTuning);
      assert.equal(storedCharm(state, 'qa01').pricing.base, 590, 'another catalog entry must not change');
    }
  );
});

test('a duplicate id the catalog never exposes is reported and never overwritten', async () => {
  const hidden = charm('qa03', { renderTuning: { visualScale: 1.4, anchor: 'top' } });
  await withHarness({ listed: [charm('qa01')], stored: [charm('qa01'), hidden] }, async (state) => {
    const saved = await saveSharedCharmCatalogEntry(charm('qa03', { pricing: { base: 999 } }), { mode: 'create' });

    assert.equal(saved, null);
    assert.match(getLastCharmSaveError(), /already exists/);
    assert.deepEqual(requestLog(state), ['POST /api/charms', 'GET /api/charms']);
    assert.equal(storedCharm(state, 'qa03').pricing.base, 590, 'the stored record must stay untouched');
    assert.deepEqual(storedCharm(state, 'qa03').renderTuning, hidden.renderTuning);
    assert.equal(storedCharm(state, 'qa01').pricing.base, 590);
  });
});

test('creating a new talisman still posts and persists stock, availability and price', async () => {
  await withHarness({ listed: [charm('qa01')], stored: [charm('qa01')] }, async (state) => {
    const saved = await saveSharedCharmCatalogEntry(
      charm('qa09', {
        availability: { inStock: false, isActive: true, stockQty: 0, stock_qty: 0 },
        stockQty: 0,
        stock_qty: 0
      }),
      { mode: 'create' }
    );

    assert.equal(getLastCharmSaveError(), '');
    assert.equal(saved.id, 'qa09');
    assert.deepEqual(requestLog(state), ['POST /api/charms', 'GET /api/charms']);
    assert.equal(storedCharm(state, 'qa09').availability.stockQty, 0);
    assert.equal(storedCharm(state, 'qa09').availability.inStock, false);
    assert.equal(storedCharm(state, 'qa09').availability.isActive, true);
  });
});

test('a stale catalog row the server no longer stores reports the 404 instead of pretending to save', async () => {
  await withHarness({ listed: [charm('qa01'), charm('qa07')], stored: [charm('qa01')] }, async (state) => {
    const saved = await saveSharedCharmCatalogEntry(charm('qa07', { pricing: { base: 480 } }), { mode: 'update' });

    assert.equal(saved, null);
    assert.match(getLastCharmSaveError(), /no longer in the catalog/);
    assert.equal(storedCharm(state, 'qa07'), undefined);
    assert.equal(storedCharm(state, 'qa01').pricing.base, 590);
  });
});

test('admin session and CSRF headers stay on every charm write', async () => {
  await withHarness({ listed: [charm('qa01')], stored: [charm('qa01')] }, async (state) => {
    await saveSharedCharmCatalogEntry(charm('qa01', { pricing: { base: 620 } }), { mode: 'update' });
    const write = state.requests.find((entry) => entry.method === 'PUT');
    assert.equal(write.headers['x-admin-secret'], 'qa-admin-secret');
    assert.equal(write.headers['x-csrf-token'], 'qa-csrf');
    assert.equal(write.headers['Content-Type'], 'application/json');
  });
});

test('the CRM reports the failure reason and keeps the form open when a talisman save fails', async () => {
  const source = await readFile(new URL('../crm.js', import.meta.url), 'utf8');
  assert.match(source, /getLastCharmSaveError/);
  assert.match(source, /function reportCharmSaveFailure\(actionLabel\)/);
  assert.match(source, /\{ mode: isEditing \? 'update' : 'create' \}/);
  assert.match(source, /\{ mode: 'update' \}/);
  const failureTail = source.slice(source.indexOf('if (!isSpacer) reportCharmSaveFailure'));
  assert.doesNotMatch(failureTail.slice(0, 200), /closeCharmForm\(\)/);
});
