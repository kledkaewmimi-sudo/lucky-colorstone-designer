const crypto = require('crypto');

// Device QA is deliberately independent of the production rollout flag. A
// validated token can temporarily opt one device into the already-flagged flow.
const DEFERRED_LOGIN_QA_TTL_MS = 45 * 60 * 1000;
const DEFERRED_LOGIN_QA_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function createDeferredLoginQaToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function isDeferredLoginQaSessionActive(session, now = Date.now()) {
  if (!session || session.revoked_at) return false;
  const expiresAt = Date.parse(String(session.expires_at || ''));
  return Number.isFinite(expiresAt) && expiresAt > Number(now);
}

module.exports = {
  DEFERRED_LOGIN_QA_TTL_MS,
  DEFERRED_LOGIN_QA_TOKEN_PATTERN,
  createDeferredLoginQaToken,
  isDeferredLoginQaSessionActive
};
