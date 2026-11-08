const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const {
  UAT_ALLOWED_ORIGIN,
  isExactUatOriginRequest,
  isAllowedUatHandoffReadRequest
} = require('../uat-origin-policy.js');
const { redactSensitiveUrl } = require('../uat-log-redaction.js');
const { HANDOFF_TTL_MS, INITIAL_HANDOFF_TTL_MS, normalizeHandoffPayload } = require('../line-auth-handoff.js');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const schema = fs.readFileSync(path.join(root, 'supabase/uat/2026-08-27-uat-catalog-and-handoff-schema.sql'), 'utf8');
const now = 1_760_000_000_000;
const token = 'a'.repeat(43);

function req(headers = {}) {
  return { headers };
}

// Exact-Origin policy.
assert.equal(UAT_ALLOWED_ORIGIN, 'https://uat.customize.luckycolorstone.com');
assert.equal(isExactUatOriginRequest(req({ origin: UAT_ALLOWED_ORIGIN })), true);
assert.equal(isExactUatOriginRequest(req({})), false, 'missing Origin must not pass state-changing validation');
assert.equal(isExactUatOriginRequest(req({ origin: 'https://customize.luckycolorstone.com' })), false);
assert.equal(isExactUatOriginRequest(req({ origin: 'https://example.com' })), false);
assert.equal(isExactUatOriginRequest(req({ origin: ' https://uat.customize.luckycolorstone.com ' })), true);
assert.equal(isExactUatOriginRequest(req({ origin: 'https://uat.customize.luckycolorstone.com.evil.example' })), false);

// Same-origin fallback is read-only and requires both signals.
assert.equal(isAllowedUatHandoffReadRequest(req({
  'sec-fetch-site': 'same-origin',
  referer: 'https://uat.customize.luckycolorstone.com/?entry=direct'
})), true);
assert.equal(isAllowedUatHandoffReadRequest(req({ 'sec-fetch-site': 'same-origin' })), false,
  'same-origin signal without a UAT referer must not pass');
assert.equal(isAllowedUatHandoffReadRequest(req({
  'sec-fetch-site': 'same-origin',
  referer: 'https://example.com/'
})), false);
assert.equal(isAllowedUatHandoffReadRequest(req({})), false);

// Server must apply exact Origin to writes and the fallback only to GET reads.
assert.match(server, /isExactUatOriginRequest/);
assert.match(server, /isAllowedUatHandoffReadOriginRequest/);
assert.match(server, /const isHandoffRead = method === 'GET'/);
assert.match(server, /isHandoffRead\s*\? isAllowedUatHandoffReadOriginRequest\(req\)\s*: isAllowedUatOriginRequest\(req\)/);
assert.match(server, /isAllowedUatOriginRequest\(req\)/);

// Log redaction.
const redactedPath = redactSensitiveUrl(`https://uat.customize.luckycolorstone.com/api/auth-handoffs/${token}`);
assert.ok(redactedPath.includes('/api/auth-handoffs/[REDACTED]'));
assert.ok(!redactedPath.includes(token));
const redactedQuery = redactSensitiveUrl(
  `https://uat.customize.luckycolorstone.com/?handoff=${token}&code=oauth-code&access_token=line-token&entry=direct`
);
assert.ok(!redactedQuery.includes(token));
assert.ok(!redactedQuery.includes('oauth-code'));
assert.ok(!redactedQuery.includes('line-token'));
assert.ok(redactedQuery.includes('entry=direct'));
assert.match(server, /redactSensitiveUrl\(urlObj\.toString\(\)\)/);

// Token storage: callback token is never written to the local intent.
assert.doesNotMatch(app, /intent\.handoffToken/);
assert.doesNotMatch(app, /rememberCustomizationLoginIntent\(\{[^}]*handoffToken/);
assert.match(app, /clearCustomizationLoginIntent\(\);\s*rememberCustomizationLoginIntent\(\{ targetStep: 2, journeyId: restored\.journeyId/);
assert.match(app, /clearInitialHandoffQueryParam\(\)/);
assert.match(app, /createInitialStateHandoff/);
assert.match(app, /initialHandoff = await createInitialStateHandoff\(\)/);

// Initial Step 1 -> Step 2 TTL is clamped to 10 minutes.
const baseSnapshot = {
  version: 1,
  savedAt: now,
  expiresAt: now + 60_000,
  step: 1,
  design: {
    wristSize: 16.5,
    beadSize: null,
    mixedPlacingSize: 6,
    selectedCharmIds: [],
    components: []
  }
};
const initial = (ttlMs) => normalizeHandoffPayload({
  targetStep: 2,
  journeyId: 'journey-security-123',
  ...(ttlMs === undefined ? {} : { ttlMs }),
  designSnapshot: baseSnapshot
}, now, HANDOFF_TTL_MS);

assert.equal(initial(undefined).expiresAt, now + INITIAL_HANDOFF_TTL_MS);
assert.equal(initial(20 * 60 * 1000).expiresAt, now + INITIAL_HANDOFF_TTL_MS);
assert.equal(initial(5 * 60 * 1000).expiresAt, now + 5 * 60 * 1000);
assert.equal(initial(59 * 1000).expiresAt, now + INITIAL_HANDOFF_TTL_MS,
  'invalid client TTL falls back to the initial 10-minute TTL');
assert.equal(initial(0).expiresAt, now + INITIAL_HANDOFF_TTL_MS);
assert.ok(initial(20 * 60 * 1000).expiresAt - now <= INITIAL_HANDOFF_TTL_MS);

// Legacy non-initial handoffs retain the independent 20-minute cap.
const legacy = normalizeHandoffPayload({
  targetStep: 3,
  designSnapshot: {
    ...baseSnapshot,
    step: 3,
    design: { ...baseSnapshot.design, beadSize: '6', components: [{ type: 'stone', id: 'stone-1' }] }
  }
}, now);
assert.equal(legacy.expiresAt, now + HANDOFF_TTL_MS);

// Expiry and replay are enforced by the database RPCs.
assert.match(schema, /expires_at > now\(\)/);
assert.match(schema, /consumed_at is null/);
assert.match(schema, /update public\.line_auth_handoffs/);
assert.match(schema, /already_consumed/);

console.log('uat-handoff-security.test.cjs passed');
