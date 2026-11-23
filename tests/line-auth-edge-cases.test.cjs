'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const crypto = require('node:crypto');
const {
  COOKIE_NAME,
  PUBLIC_ORIGIN,
  createProductionAuthEntryService,
  verifyProductionLineIdToken
} = require('../backend/production-line-auth-entry.js');

const channel = '2010525799';
const nowSeconds = Math.floor(Date.now() / 1000);
const validClaims = { iss: 'https://access.line.me', aud: channel, exp: nowSeconds + 300, iat: nowSeconds - 30, sub: 'U0123456789abcdef' };
const token = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify(validClaims)).toString('base64url')}.signature`;
const oid = () => crypto.randomBytes(32).toString('base64url');
process.env.PRODUCTION_LINE_CHANNEL_ID = channel;

function responseMock() {
  return {
    statusCode: null,
    headers: {},
    body: '',
    get status() { return this.statusCode; },
    set status(value) { this.statusCode = value; },
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    writeHead(status, headers) { this.statusCode = status; Object.assign(this.headers, headers); },
    end(body = '') { this.statusCode = this.statusCode || 200; this.body = String(body); },
    json() { return JSON.parse(this.body || 'null'); }
  };
}

function requestMock({ method = 'POST', url = '/api/line-auth-entry', headers = {}, body = null, ip = '127.0.0.1' } = {}) {
  const req = Readable.from(body === null ? [] : [Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))]);
  req.method = method;
  req.url = url;
  req.headers = headers;
  req.socket = { remoteAddress: ip };
  return req;
}

const baseHeaders = () => ({ origin: PUBLIC_ORIGIN, 'x-lc-auth-entry': '1' });
const cookie = () => `${COOKIE_NAME}=${oid()}`;
const serviceWith = ({ rpc = async () => [], request = async () => [], configured = true } = {}) => createProductionAuthEntryService({
  isSupabaseConfigured: () => configured,
  supabaseRpc: rpc,
  supabaseRequest: request
});

test('LINE verifier rejects 4xx/5xx, malformed responses, network errors, and timeout without leaking the token', async () => {
  const rejected = await verifyProductionLineIdToken(token, { clientId: channel, fetchImpl: async () => ({ ok: false, status: 500 }) });
  assert.deepEqual(rejected, { verified: false, reason: 'verification_rejected' });

  const malformed = await verifyProductionLineIdToken(token, { clientId: channel, fetchImpl: async () => ({ ok: true, json: async () => { throw new Error('bad json'); } }) });
  assert.deepEqual(malformed, { verified: false, reason: 'malformed_response' });

  const offline = await verifyProductionLineIdToken(token, { clientId: channel, fetchImpl: async () => { throw new Error('network'); } });
  assert.deepEqual(offline, { verified: false, reason: 'verification_unavailable' });

  const timeout = await verifyProductionLineIdToken(token, {
    clientId: channel,
    timeoutMs: 1000,
    fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    })
  });
  assert.deepEqual(timeout, { verified: false, reason: 'verification_unavailable' });
  assert.equal(JSON.stringify([rejected, malformed, offline, timeout]).includes(token), false);
});

test('verify route rejects missing and malformed ID tokens, then accepts a valid retry', async () => {
  const service = serviceWith();
  const missing = responseMock();
  await service.handle(requestMock({ url: '/api/line-id-token/verify', headers: baseHeaders(), body: {} }), missing, '/api/line-id-token/verify');
  assert.equal(missing.status, 401);
  assert.deepEqual(missing.json(), { verified: false, reason: 'invalid_token_format' });

  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => validClaims });
  try {
    const good = responseMock();
    await service.handle(requestMock({ url: '/api/line-id-token/verify', headers: baseHeaders(), body: { idToken: token } }), good, '/api/line-id-token/verify');
    assert.equal(good.status, 200);
    assert.deepEqual(good.json(), { verified: true });
  } finally {
    global.fetch = originalFetch;
  }
});

test('consume rejects missing token, malformed token, browser mismatch, and duplicate consume', async () => {
  const missing = serviceWith();
  const missingRes = responseMock();
  await missing.handle(requestMock({ url: '/api/line-auth-consume', headers: { ...baseHeaders(), cookie: cookie() }, body: { sessionId: oid(), tabSessionId: oid() } }), missingRes, '/api/line-auth-consume');
  assert.equal(missingRes.status, 400);

  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => validClaims });
  try {
    const calls = [];
    const service = serviceWith({
      rpc: async (name, args) => {
        calls.push({ name, args });
        return calls.length === 1 ? [] : [];
      }
    });
    const firstRes = responseMock();
    await service.handle(requestMock({ url: '/api/line-auth-consume', headers: { ...baseHeaders(), cookie: cookie() }, body: { idToken: token, sessionId: oid(), tabSessionId: oid() } }), firstRes, '/api/line-auth-consume');
    assert.equal(firstRes.status, 404);
    assert.deepEqual(firstRes.json(), { ok: false });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'consume_production_line_auth_entry_session');
    assert.equal(JSON.stringify(firstRes.body).includes(token), false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('auth-entry rejects an oversized body before storage and reports a 413', async () => {
  const service = serviceWith();
  const res = responseMock();
  const oversized = JSON.stringify({ handoffToken: oid(), tabSessionId: oid(), padding: 'x'.repeat(9000) });
  await service.handle(requestMock({ headers: baseHeaders(), body: oversized }), res, '/api/line-auth-entry');
  assert.equal(res.status, 413);
  assert.deepEqual(res.json(), { error: 'Invalid request.' });
});

test('rate limiting returns 429 and does not create a session for the blocked request', async () => {
  const service = serviceWith({ configured: false });
  let last;
  for (let i = 0; i < 61; i += 1) {
    const res = responseMock();
    await service.handle(requestMock({
      method: 'GET',
      url: '/api/auth-entry/sessions/pending',
      headers: { ...baseHeaders(), cookie: cookie(), 'sec-fetch-site': 'same-origin', referer: `${PUBLIC_ORIGIN}/` },
      ip: '203.0.113.77'
    }), res, '/api/auth-entry/sessions/pending');
    last = res;
  }
  assert.equal(last.status, 429);
  assert.deepEqual(last.json(), { error: 'Too many requests.' });
});

test('pending lookup is cookie-bound and expired sessions fail closed', async () => {
  const browser = oid();
  const service = serviceWith({
    request: async () => [{
      session_id: oid(),
      tab_session_id: oid(),
      expires_at: new Date(Date.now() - 1000).toISOString(),
      consumed_at: null
    }]
  });
  const res = responseMock();
  await service.handle(requestMock({
    method: 'GET',
    url: '/api/auth-entry/sessions/pending',
    headers: { ...baseHeaders(), cookie: `${COOKIE_NAME}=${browser}`, 'sec-fetch-site': 'same-origin', referer: `${PUBLIC_ORIGIN}/` }
  }), res, '/api/auth-entry/sessions/pending');
  assert.equal(res.status, 200);
  assert.deepEqual(res.json(), { ok: true, pending: false, expired: true });

  const noCookie = responseMock();
  await service.handle(requestMock({
    method: 'GET',
    url: '/api/auth-entry/sessions/pending',
    headers: { ...baseHeaders(), 'sec-fetch-site': 'same-origin', referer: `${PUBLIC_ORIGIN}/` }
  }), noCookie, '/api/auth-entry/sessions/pending');
  assert.deepEqual(noCookie.json(), { ok: true, pending: false });
});

test('client lifecycle is fail-closed for cancelled, closed, refreshed, back/forward, and retry paths', () => {
  const app = fs.readFileSync(path.join(__dirname, '../frontend/app.js'), 'utf8');
  const entryHtml = fs.readFileSync(path.join(__dirname, '../frontend/line-auth-entry.html'), 'utf8');
  const entry = fs.readFileSync(path.join(__dirname, '../frontend/line-auth-entry.js'), 'utf8');
  assert.match(app, /function handleAutoAuthEntryReturn\(\)/);
  assert.match(app, /missing_auth_entry_session/);
  assert.match(app, /line_auth_cancelled/);
  assert.match(app, /ID_TOKEN_UNAVAILABLE/);
  assert.match(app, /function clearAutoAuthEntryState\(/);
  assert.match(app, /if \(!pending\) return \{ ok: false, reason: 'missing_auth_entry_session' \};/);
  assert.equal(/idToken[^\n]{0,80}(URLSearchParams|location\.href|location\.assign)/.test(app), false);
  assert.match(entry, /withLoginOnExternalBrowser:\s*true/);
  assert.match(entry, /INIT_TIMEOUT_MS/);
  assert.match(entry, /Promise\.race/);
  assert.equal(/id_token|idToken|access_token/.test(entryHtml + entry), false);
  // No production navigation is hard-coded in the client lifecycle; API paths stay same-origin.
  assert.equal(/https:\/\/customize\.luckycolorstone\.com/.test(app), false);
});
