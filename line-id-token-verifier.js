const crypto = require('crypto');

const LINE_VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify';
const LINE_ISSUER = 'https://access.line.me';
const UAT_LINE_CHANNEL_ID = '2010525799';
const MAX_ID_TOKEN_LENGTH = 4096;
const VERIFY_TIMEOUT_MS = 5000;

function getUatLineChannelId(env = process.env) {
  const configured = String(env.UAT_LINE_CHANNEL_ID || '').trim();
  if (configured) return configured;
  // The owner supplied this exact UAT channel ID. Keep it UAT-only; never
  // infer a production channel from a LIFF ID or from a website URL.
  if (String(env.APP_ENV || '').trim().toLowerCase() === 'uat'
    && String(env.UAT_BACKEND || '').trim().toLowerCase() === 'true') {
    return UAT_LINE_CHANNEL_ID;
  }
  return '';
}

function isValidIdTokenShape(value) {
  const token = String(value || '');
  if (!token || token.length > MAX_ID_TOKEN_LENGTH) return false;
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return false;
  return true;
}

function isFiniteTime(value) {
  return Number.isFinite(Number(value));
}

function validateLineVerifyClaims(claims, expectedChannelId, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!claims || typeof claims !== 'object' || Array.isArray(claims)) return false;
  if (String(claims.iss || '') !== LINE_ISSUER) return false;
  if (String(claims.aud || '') !== String(expectedChannelId || '')) return false;
  if (!isFiniteTime(claims.exp) || Number(claims.exp) <= Number(nowSeconds)) return false;
  if (!isFiniteTime(claims.iat)) return false;
  // Reject tokens issued materially in the future; LINE tokens are short-lived.
  if (Number(claims.iat) > Number(nowSeconds) + 300) return false;
  if (typeof claims.sub !== 'string' || !claims.sub.trim()) return false;
  return true;
}

async function verifyUatLineIdToken(idToken, {
  clientId,
  fetchImpl = fetch,
  now = Date.now(),
  timeoutMs = VERIFY_TIMEOUT_MS
} = {}) {
  const expectedChannelId = String(clientId || '').trim();
  if (!expectedChannelId) return { verified: false, reason: 'verification_not_configured' };
  if (!isValidIdTokenShape(idToken)) return { verified: false, reason: 'invalid_token_format' };

  let response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || VERIFY_TIMEOUT_MS));
    try {
      response = await fetchImpl(LINE_VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ id_token: String(idToken), client_id: expectedChannelId }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return { verified: false, reason: 'verification_unavailable' };
  }

  if (!response || !response.ok) return { verified: false, reason: 'verification_rejected' };

  let claims;
  try {
    claims = await response.json();
  } catch {
    return { verified: false, reason: 'malformed_response' };
  }

  if (!validateLineVerifyClaims(claims, expectedChannelId, Math.floor(Number(now) / 1000))) {
    return { verified: false, reason: 'claim_validation_failed' };
  }

  // Only the verified subject is needed by trusted server-side session code.
  // Never return or persist the raw token or the full claim set.
  return { verified: true, sub: String(claims.sub) };
}

function createUatAuthEntryId() {
  return crypto.randomBytes(32).toString('base64url');
}

module.exports = {
  LINE_ISSUER,
  LINE_VERIFY_URL,
  MAX_ID_TOKEN_LENGTH,
  UAT_LINE_CHANNEL_ID,
  VERIFY_TIMEOUT_MS,
  createUatAuthEntryId,
  getUatLineChannelId,
  isValidIdTokenShape,
  validateLineVerifyClaims,
  verifyUatLineIdToken
};
