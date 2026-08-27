const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { HANDOFF_TTL_MS, normalizeHandoffPayload } = require('../line-auth-handoff.js');

const root = path.resolve(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const now = 1_760_000_000_000;
const input = {
  targetStep: 3,
  designSnapshot: {
    version: 1,
    savedAt: now,
    expiresAt: now + 1,
    step: 3,
    design: { wristSize: 16, beadSize: '6', selectedCharmIds: [], components: [{ type: 'stone', id: 'qa-stone' }] }
  }
};

assert.equal(HANDOFF_TTL_MS, 20 * 60 * 1000);
assert.equal(normalizeHandoffPayload(input, now).expiresAt, now + HANDOFF_TTL_MS);
assert.equal(normalizeHandoffPayload(input, now, 60 * 1000).expiresAt, now + 60 * 1000);
assert.equal(normalizeHandoffPayload(input, now, 59 * 1000), null);
assert.equal(normalizeHandoffPayload(input, now, HANDOFF_TTL_MS + 1), null);
assert.match(server, /function resolveUatHandoffQaTtlMs\(\)/);
assert.match(server, /UAT_HANDOFF_QA_TTL_SECONDS/);
assert.match(server, /APP_ENV[^\n]*=== 'uat'/);
assert.match(server, /UAT_BACKEND[^\n]*=== 'true'/);
assert.match(server, /seconds < 60 \|\| seconds > 300/);
assert.match(server, /normalizeHandoffPayload\(input, Date\.now\(\), resolveUatHandoffQaTtlMs\(\)\)/);

console.log('uat-handoff-ttl-override.test.cjs passed');
