'use strict';

const crypto = require('crypto');

const LINE_VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify';
const LINE_ISSUER = 'https://access.line.me';
const PUBLIC_ORIGIN = 'https://customize.luckycolorstone.com';
const COOKIE_NAME = '__Host-lc-line-auth-browser';
const AUTH_ENTRY_HEADER = 'x-lc-auth-entry';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MAX_ID_TOKEN_LENGTH = 4096;
const MAX_BODY_BYTES = 8 * 1024;
const SESSION_TTL_SECONDS = 600;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 60;
const rateBuckets = new Map();

function getProductionLineChannelId(env = process.env) {
  return String(env.LINE_LOGIN_CHANNEL_ID || env.PRODUCTION_LINE_CHANNEL_ID || '').trim();
}

function isValidIdTokenShape(value) {
  const token = String(value || '');
  return Boolean(token)
    && token.length <= MAX_ID_TOKEN_LENGTH
    && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token);
}

function validateLineClaims(claims, expectedChannelId, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!claims || typeof claims !== 'object' || Array.isArray(claims)) return false;
  if (String(claims.iss || '') !== LINE_ISSUER) return false;
  if (String(claims.aud || '') !== String(expectedChannelId || '')) return false;
  if (!Number.isFinite(Number(claims.exp)) || Number(claims.exp) <= nowSeconds) return false;
  if (!Number.isFinite(Number(claims.iat))) return false;
  if (Number(claims.iat) > nowSeconds + 300) return false;
  if (typeof claims.sub !== 'string' || !claims.sub.trim()) return false;
  return true;
}

async function verifyProductionLineIdToken(idToken, {
  clientId,
  fetchImpl = fetch,
  now = Date.now(),
  timeoutMs = 5000
} = {}) {
  const expectedChannelId = String(clientId || '').trim();
  if (!expectedChannelId) return { verified: false, reason: 'verification_not_configured' };
  if (!isValidIdTokenShape(idToken)) return { verified: false, reason: 'invalid_token_format' };

  let response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 5000));
  try {
    response = await fetchImpl(LINE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: String(idToken), client_id: expectedChannelId }),
      signal: controller.signal
    });
  } catch {
    return { verified: false, reason: 'verification_unavailable' };
  } finally {
    clearTimeout(timer);
  }

  if (!response || !response.ok) return { verified: false, reason: 'verification_rejected' };
  let claims;
  try {
    claims = await response.json();
  } catch {
    return { verified: false, reason: 'malformed_response' };
  }
  if (!validateLineClaims(claims, expectedChannelId, Math.floor(Number(now) / 1000))) {
    return { verified: false, reason: 'claim_validation_failed' };
  }
  return { verified: true, sub: String(claims.sub) };
}

function sendAuthJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Access-Control-Allow-Origin', PUBLIC_ORIGIN);
  res.setHeader('Vary', 'Origin');
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let settled = false;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        if (!settled) {
          settled = true;
          reject(Object.assign(new Error('body too large'), { code: 'BODY_TOO_LARGE' }));
        }
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      const text = Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/, '').trim();
      if (!text) return resolve(null);
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(Object.assign(new Error('invalid json'), { code: 'INVALID_JSON' }));
      }
    });
    req.on('error', (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
  });
}

function getCookie(req, name) {
  const prefix = `${name}=`;
  const part = String(req.headers.cookie || '')
    .split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix));
  return part ? part.slice(prefix.length) : '';
}

function isAllowedOrigin(req) {
  const origin = String(req.headers.origin || '');
  if (origin === PUBLIC_ORIGIN) return true;
  // Same-origin browser GETs may omit Origin. Require an explicit same-origin
  // signal and a production Referer for the read-only pending lookup.
  const site = String(req.headers['sec-fetch-site'] || '').toLowerCase();
  const referer = String(req.headers.referer || '');
  return site === 'same-origin' && referer.startsWith(`${PUBLIC_ORIGIN}/`);
}

function isRateLimited(req) {
  const key = String(req.socket?.remoteAddress || 'unknown');
  const now = Date.now();
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  if (current.count >= RATE_MAX) return true;
  current.count += 1;
  return false;
}

function setBrowserCookie(res, browserId) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${browserId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
}

function isAuthEntryPath(pathname) {
  return pathname === '/api/line-auth-entry'
    || pathname === '/api/line-auth-consume'
    || pathname === '/api/line-id-token/verify'
    || pathname === '/api/auth-entry/sessions/pending';
}

function createProductionAuthEntryService({
  supabaseRpc,
  supabaseRequest,
  isSupabaseConfigured
} = {}) {
  async function createSession({ handoffToken, browserId, tabSessionId }) {
    if (!isSupabaseConfigured?.()) return null;
    const rows = await supabaseRpc('create_production_line_auth_entry_session', {
      p_session_id: crypto.randomBytes(32).toString('base64url'),
      p_browser_id: browserId,
      p_tab_session_id: tabSessionId,
      p_handoff_token: handoffToken,
      p_ttl_seconds: SESSION_TTL_SECONDS
    });
    const row = Array.isArray(rows) ? rows[0] : null;
    return row?.session_id ? { sessionId: row.session_id, expiresAt: row.expires_at || null } : null;
  }

  async function consumeSession({ sessionId, browserId, tabSessionId }) {
    if (!isSupabaseConfigured?.()) return null;
    const rows = await supabaseRpc('consume_production_line_auth_entry_session', {
      p_session_id: sessionId,
      p_browser_id: browserId,
      p_tab_session_id: tabSessionId
    });
    const row = Array.isArray(rows) ? rows[0] : null;
    return row?.payload && typeof row.payload === 'object' ? row.payload : null;
  }

  async function readPending(browserId) {
    if (!isSupabaseConfigured?.() || !TOKEN_PATTERN.test(String(browserId || ''))) {
      return { ok: true, pending: false };
    }
    try {
      const rows = await supabaseRequest('line_auth_entry_sessions', {
        params: {
          select: 'session_id,tab_session_id,expires_at,consumed_at',
          browser_id: `eq.${browserId}`,
          consumed_at: 'is.null',
          order: 'created_at.desc',
          limit: '1'
        }
      });
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) return { ok: true, pending: false };
      if (row.consumed_at) return { ok: true, pending: false, consumed: true };
      if (!TOKEN_PATTERN.test(String(row.session_id || ''))
        || !TOKEN_PATTERN.test(String(row.tab_session_id || ''))) {
        return { ok: true, pending: false };
      }
      const expiresAt = Date.parse(row.expires_at);
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        return { ok: true, pending: false, expired: true };
      }
      return {
        ok: true,
        pending: true,
        sessionId: row.session_id,
        tabSessionId: row.tab_session_id,
        expiresAt: new Date(expiresAt).toISOString()
      };
    } catch {
      return { ok: false, pending: false };
    }
  }

  async function handle(req, res, pathname) {
    if (!isAuthEntryPath(pathname)) return false;
    if (isRateLimited(req)) {
      sendAuthJson(res, 429, { error: 'Too many requests.' });
      return true;
    }
    if (!isAllowedOrigin(req)) {
      sendAuthJson(res, 403, { error: 'Origin required.' });
      return true;
    }
    if (String(req.headers[AUTH_ENTRY_HEADER] || '') !== '1') {
      sendAuthJson(res, 403, { error: 'Request not permitted.' });
      return true;
    }

    const channelId = getProductionLineChannelId();
    if (!channelId) {
      sendAuthJson(res, 503, { error: 'Verification unavailable.' });
      return true;
    }

    if (pathname === '/api/auth-entry/sessions/pending') {
      if (req.method !== 'GET') {
        sendAuthJson(res, 405, { error: 'Method not allowed.' });
        return true;
      }
      const browserId = getCookie(req, COOKIE_NAME);
      const pending = await readPending(browserId);
      sendAuthJson(res, pending.ok ? 200 : 503, pending.pending
        ? {
          ok: true,
          pending: true,
          sessionId: pending.sessionId,
          tabSessionId: pending.tabSessionId,
          expiresAt: pending.expiresAt
        }
        : {
          ok: Boolean(pending.ok),
          pending: false,
          ...(pending.expired ? { expired: true } : {}),
          ...(pending.consumed ? { consumed: true } : {})
        });
      return true;
    }

    if (req.method !== 'POST') {
      sendAuthJson(res, 405, { error: 'Method not allowed.' });
      return true;
    }

    let body;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      sendAuthJson(res, error?.code === 'BODY_TOO_LARGE' ? 413 : 400, { error: 'Invalid request.' });
      return true;
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      sendAuthJson(res, 400, { error: 'Invalid request.' });
      return true;
    }

    if (pathname === '/api/line-auth-entry') {
      const handoffToken = String(body.handoffToken || '').trim();
      const tabSessionId = String(body.tabSessionId || '').trim();
      if (!TOKEN_PATTERN.test(handoffToken) || !TOKEN_PATTERN.test(tabSessionId)) {
        sendAuthJson(res, 400, { error: 'Invalid request.' });
        return true;
      }
      let browserId = getCookie(req, COOKIE_NAME);
      if (!TOKEN_PATTERN.test(browserId)) browserId = crypto.randomBytes(32).toString('base64url');
      setBrowserCookie(res, browserId);
      try {
        const session = await createSession({ handoffToken, browserId, tabSessionId });
        if (!session) {
          sendAuthJson(res, 409, { error: 'Session unavailable.' });
          return true;
        }
        sendAuthJson(res, 201, session);
      } catch {
        sendAuthJson(res, 503, { error: 'Session storage unavailable.' });
      }
      return true;
    }

    if (pathname === '/api/line-id-token/verify') {
      const idToken = String(body.idToken || '');
      const result = await verifyProductionLineIdToken(idToken, { clientId: channelId });
      sendAuthJson(res, result.verified ? 200 : 401, result.verified
        ? { verified: true }
        : { verified: false, reason: result.reason || 'verification_rejected' });
      return true;
    }

    if (pathname === '/api/line-auth-consume') {
      const idToken = String(body.idToken || '');
      const sessionId = String(body.sessionId || '').trim();
      const tabSessionId = String(body.tabSessionId || '').trim();
      const browserId = getCookie(req, COOKIE_NAME);
      if (!isValidIdTokenShape(idToken)
        || !TOKEN_PATTERN.test(sessionId)
        || !TOKEN_PATTERN.test(tabSessionId)
        || !TOKEN_PATTERN.test(browserId)) {
        sendAuthJson(res, 400, { ok: false });
        return true;
      }
      const verification = await verifyProductionLineIdToken(idToken, { clientId: channelId });
      if (!verification.verified) {
        sendAuthJson(res, 401, { ok: false });
        return true;
      }
      const payload = await consumeSession({ sessionId, browserId, tabSessionId });
      if (!payload?.designSnapshot || Number(payload.targetStep) !== 2) {
        sendAuthJson(res, 404, { ok: false });
        return true;
      }
      sendAuthJson(res, 200, {
        ok: true,
        targetStep: 2,
        snapshot: payload.designSnapshot,
        journeyId: payload.journeyId || '',
        analyticsContinuity: payload.analyticsContinuity || null
      });
      return true;
    }

    sendAuthJson(res, 404, { error: 'Not found.' });
    return true;
  }

  return { handle };
}

module.exports = {
  COOKIE_NAME,
  LINE_ISSUER,
  LINE_VERIFY_URL,
  PUBLIC_ORIGIN,
  createProductionAuthEntryService,
  getProductionLineChannelId,
  isAuthEntryPath,
  isValidIdTokenShape,
  validateLineClaims,
  verifyProductionLineIdToken
};
