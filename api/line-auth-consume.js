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

function getCookie(req, name) {
  const prefix = `${name}=`;
  const part = String(req.headers.cookie || '')
    .split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix));
  return part ? part.slice(prefix.length) : '';
}

function send(res, status, payload) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(status).json(payload);
}

module.exports = async function lineAuthConsumeHandler(req, res) {
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

  const browserId = getCookie(req, COOKIE_NAME);
  if (!TOKEN_PATTERN.test(browserId)) {
    send(res, 401, { ok: false });
    return;
  }

  let body;
  try {
    body = JSON.parse(await readBody(req) || '{}');
  } catch (error) {
    send(res, error?.code === 'BODY_TOO_LARGE' ? 413 : 400, { ok: false });
    return;
  }

  const idToken = String(body?.idToken || '');
  const sessionId = String(body?.sessionId || '').trim();
  const tabSessionId = String(body?.tabSessionId || '').trim();
  if (!idToken || idToken.length > 4096
    || !TOKEN_PATTERN.test(sessionId)
    || !TOKEN_PATTERN.test(tabSessionId)) {
    send(res, 400, { ok: false });
    return;
  }

  try {
    const upstream = await fetch(`${UAT_RENDER_ORIGIN}/api/auth-entry/sessions/consume`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: UAT_ORIGIN,
        'x-uat-auth-entry': '1'
      },
      body: JSON.stringify({ idToken, sessionId, browserId, tabSessionId })
    });
    const payload = await upstream.json().catch(() => null);
    if (!upstream.ok || payload?.ok !== true) {
      send(res, upstream.status === 401 ? 401 : 404, { ok: false });
      return;
    }
    send(res, 200, {
      ok: true,
      targetStep: 2,
      snapshot: payload.snapshot,
      journeyId: payload.journeyId || '',
      analyticsContinuity: payload.analyticsContinuity || null
    });
  } catch {
    send(res, 503, { ok: false });
  }
};
