'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const crypto = require('node:crypto');
const {
  COOKIE_NAME,
  PUBLIC_ORIGIN,
  createProductionAuthEntryService,
  getProductionLineChannelId,
  isValidIdTokenShape,
  validateLineClaims,
  verifyProductionLineIdToken
} = require('../backend/production-line-auth-entry.js');

const nowSeconds = Math.floor(Date.now() / 1000);
const channel = '2010525799';
const validClaims = {
  iss: 'https://access.line.me',
  aud: channel,
  exp: nowSeconds + 300,
  iat: nowSeconds - 30,
  sub: 'U0123456789abcdef'
};
const token = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify(validClaims)).toString('base64url')}.signature`;
const oid = () => crypto.randomBytes(32).toString('base64url');

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

function requestMock({ method = 'POST', url = '/api/line-auth-entry', headers = {}, body = null } = {}) {
  const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
  req.method = method;
  req.url = url;
  req.headers = headers;
  req.socket = { remoteAddress: '127.0.0.1' };
  return req;
}

function serviceWith({ rpc = async () => [], request = async () => [], configured = true } = {}) {
  return createProductionAuthEntryService({
    isSupabaseConfigured: () => configured,
    supabaseRpc: rpc,
    supabaseRequest: request
  });
}

process.env.PRODUCTION_LINE_CHANNEL_ID = channel;

test('production channel is explicit and never defaults to a UAT LIFF ID', () => {
  assert.equal(getProductionLineChannelId({}), '');
  assert.equal(getProductionLineChannelId({ PRODUCTION_LINE_CHANNEL_ID: '123' }), '123');
  assert.equal(getProductionLineChannelId({ LINE_LOGIN_CHANNEL_ID: '456' }), '456');
});

test('ID token shape rejects empty, oversized, and malformed values', () => {
  assert.equal(isValidIdTokenShape(''), false);
  assert.equal(isValidIdTokenShape('not-a-token'), false);
  assert.equal(isValidIdTokenShape(token), true);
  assert.equal(isValidIdTokenShape(`${token}.extra`), false);
  assert.equal(isValidIdTokenShape(`${'a'.repeat(5000)}.b.c`), false);
});

test('claims require exact issuer, audience, future expiry, sane iat, and subject', () => {
  assert.equal(validateLineClaims(validClaims, channel, nowSeconds), true);
  assert.equal(validateLineClaims({ ...validClaims, iss: 'https://evil.example' }, channel, nowSeconds), false);
  assert.equal(validateLineClaims({ ...validClaims, aud: 'different' }, channel, nowSeconds), false);
  assert.equal(validateLineClaims({ ...validClaims, exp: nowSeconds }, channel, nowSeconds), false);
  assert.equal(validateLineClaims({ ...validClaims, iat: nowSeconds + 1000 }, channel, nowSeconds), false);
  assert.equal(validateLineClaims({ ...validClaims, sub: '' }, channel, nowSeconds), false);
});

test('verifier accepts a valid LINE response and rejects bad responses without leaking tokens', async () => {
  const okFetch = async () => ({ ok: true, json: async () => validClaims });
  const good = await verifyProductionLineIdToken(token, { clientId: channel, fetchImpl: okFetch });
  assert.deepEqual(good, { verified: true, sub: validClaims.sub });

  const badFetch = async () => ({ ok: true, json: async () => ({ ...validClaims, aud: 'wrong' }) });
  const bad = await verifyProductionLineIdToken(token, { clientId: channel, fetchImpl: badFetch });
  assert.equal(bad.verified, false);
  assert.equal(bad.reason, 'claim_validation_failed');

  const missingConfig = await verifyProductionLineIdToken(token, { clientId: '' });
  assert.deepEqual(missingConfig, { verified: false, reason: 'verification_not_configured' });
});

test('auth-entry route fails closed without origin, request marker, or verifier config', async () => {
  const service = serviceWith();
  const noOriginReq = requestMock({ headers: { 'x-lc-auth-entry': '1' } });
  const noOriginRes = responseMock();
  assert.equal(await service.handle(noOriginReq, noOriginRes, '/api/line-auth-entry'), true);
  assert.equal(noOriginRes.status, 403);

  const noMarkerReq = requestMock({ headers: { origin: PUBLIC_ORIGIN } });
  const noMarkerRes = responseMock();
  await service.handle(noMarkerReq, noMarkerRes, '/api/line-auth-entry');
  assert.equal(noMarkerRes.status, 403);

  process.env.PRODUCTION_LINE_CHANNEL_ID = '';
  const noConfigReq = requestMock({ headers: { origin: PUBLIC_ORIGIN, 'x-lc-auth-entry': '1' }, body: {} });
  const noConfigRes = responseMock();
  await service.handle(noConfigReq, noConfigRes, '/api/line-auth-entry');
  assert.equal(noConfigRes.status, 503);
  process.env.PRODUCTION_LINE_CHANNEL_ID = channel;
});

test('auth-entry creates a session with a secure host cookie', async () => {
  const tab = oid();
  const handoff = oid();
  let rpcArgs = null;
  const service = serviceWith({
    rpc: async (name, args) => {
      rpcArgs = { name, args };
      return [{ session_id: oid(), expires_at: new Date(Date.now() + 600000).toISOString() }];
    }
  });
  const res = responseMock();
  await service.handle(requestMock({
    headers: { origin: PUBLIC_ORIGIN, 'x-lc-auth-entry': '1' },
    body: { handoffToken: handoff, tabSessionId: tab }
  }), res, '/api/line-auth-entry');
  assert.equal(res.status, 201);
  assert.match(res.headers['set-cookie'] || '', /^__Host-lc-line-auth-browser=/);
  assert.match(res.headers['set-cookie'] || '', /HttpOnly/);
  assert.match(res.headers['set-cookie'] || '', /Secure/);
  assert.match(res.headers['set-cookie'] || '', /SameSite=Lax/);
  assert.equal(rpcArgs.name, 'create_production_line_auth_entry_session');
  assert.equal(rpcArgs.args.p_handoff_token, handoff);
  assert.equal(rpcArgs.args.p_tab_session_id, tab);
});

test('pending lookup is cookie-bound and returns only opaque session metadata', async () => {
  const browser = oid();
  const session = oid();
  const tab = oid();
  const service = serviceWith({
    request: async () => [{
      session_id: session,
      tab_session_id: tab,
      expires_at: new Date(Date.now() + 600000).toISOString(),
      consumed_at: null
    }]
  });
  const res = responseMock();
  await service.handle(requestMock({
    method: 'GET',
    url: '/api/auth-entry/sessions/pending',
    headers: {
      'sec-fetch-site': 'same-origin',
      referer: `${PUBLIC_ORIGIN}/`,
      'x-lc-auth-entry': '1',
      cookie: `${COOKIE_NAME}=${browser}`
    }
  }), res, '/api/auth-entry/sessions/pending');
  const body = res.json();
  assert.equal(res.status, 200);
  assert.equal(body.pending, true);
  assert.equal(body.sessionId, session);
  assert.equal(body.tabSessionId, tab);
  assert.equal('handoffToken' in body, false);
  assert.equal('idToken' in body, false);
});

test('expired pending session fails closed without touching a handoff', async () => {
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
    headers: {
      'sec-fetch-site': 'same-origin',
      referer: `${PUBLIC_ORIGIN}/`,
      'x-lc-auth-entry': '1',
      cookie: `${COOKIE_NAME}=${oid()}`
    }
  }), res, '/api/auth-entry/sessions/pending');
  assert.equal(res.status, 200);
  assert.deepEqual(res.json(), { ok: true, pending: false, expired: true });
});

test('replayed or browser-mismatched consume returns not found after valid token verification', async () => {
  const oldFetch = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => validClaims });
  try {
    const service = serviceWith({ rpc: async () => [] });
    const res = responseMock();
    await service.handle(requestMock({
      url: '/api/line-auth-consume',
      headers: {
        origin: PUBLIC_ORIGIN,
        'x-lc-auth-entry': '1',
        cookie: `${COOKIE_NAME}=${oid()}`
      },
      body: { idToken: token, sessionId: oid(), tabSessionId: oid() }
    }), res, '/api/line-auth-consume');
    assert.equal(res.status, 404);
    assert.deepEqual(res.json(), { ok: false });
  } finally {
    global.fetch = oldFetch;
  }
});

test('slot/session constants do not include raw token or identity fields', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../backend/production-line-auth-entry.js'), 'utf8');
  assert.equal(/localStorage|sessionStorage/.test(source), false);
  assert.equal(/UAT_LINE|uat\.customize|lucky-colorstone-uat/.test(source), false);
});
