const crypto = require('crypto');

const UAT_ORIGIN = 'https://uat.customize.luckycolorstone.com';
const UAT_RENDER_ORIGIN = 'https://lucky-colorstone-uat.onrender.com';
const COOKIE_NAME = '__Host-uat-line-auth-browser';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MAX_BODY_BYTES = 8 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        const error = new Error('Request body too large.');
        error.code = 'BODY_TOO_LARGE';
        reject(error);
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res, status, payload, cookie = '') {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (cookie) res.setHeader('Set-Cookie', cookie);
  res.status(status).json(payload);
}

module.exports = async function lineAuthEntryHandler(req, res) {
  if (req.method !== 'POST') {
    send(res, 405, { error: 'Method not allowed.' });
    return;
  }
  if (String(req.headers.origin || '') !== UAT_ORIGIN) {
    send(res, 403, { error: 'UAT origin required.' });
    return;
  }
  if (String(req.headers['x-uat-auth-entry'] || '') !== '1') {
    send(res, 403, { error: 'Request not permitted.' });
    return;
  }

  let body;
  try {
    body = JSON.parse(await readBody(req) || '{}');
  } catch (error) {
    send(res, error?.code === 'BODY_TOO_LARGE' ? 413 : 400, { error: 'Invalid request.' });
    return;
  }

  const handoffToken = String(body?.handoffToken || '').trim();
  const tabSessionId = String(body?.tabSessionId || '').trim();
  if (!TOKEN_PATTERN.test(handoffToken) || !TOKEN_PATTERN.test(tabSessionId)) {
    send(res, 400, { error: 'Invalid request.' });
    return;
  }

  const browserId = crypto.randomBytes(32).toString('base64url');
  const cookie = `${COOKIE_NAME}=${browserId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`;

  try {
    const upstream = await fetch(`${UAT_RENDER_ORIGIN}/api/auth-entry/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: UAT_ORIGIN,
        'x-uat-auth-entry': '1'
      },
      body: JSON.stringify({ handoffToken, browserId, tabSessionId })
    });
    const payload = await upstream.json().catch(() => null);
    if (!upstream.ok || !payload?.sessionId) {
      send(res, upstream.status === 409 ? 409 : 503, { error: 'Session unavailable.' }, cookie);
      return;
    }
    send(res, 201, { sessionId: payload.sessionId, expiresAt: payload.expiresAt || null }, cookie);
  } catch {
    send(res, 503, { error: 'Session unavailable.' }, cookie);
  }
};
