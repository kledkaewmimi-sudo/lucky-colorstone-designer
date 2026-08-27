const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { buildUatSupabaseAuthHeaders, describeUatSupabaseKey, isModernSupabaseSecretKey } = require('../uat-supabase-auth.js');

const modern = 'sb_secret_test_only_not_a_jwt';
assert.equal(isModernSupabaseSecretKey(modern), true);
assert.deepEqual(buildUatSupabaseAuthHeaders(modern), { apikey: modern });
assert.equal(Object.hasOwn(buildUatSupabaseAuthHeaders(modern), 'Authorization'), false);
assert.deepEqual(buildUatSupabaseAuthHeaders(`  ${modern}\n`), { apikey: modern });
assert.deepEqual(describeUatSupabaseKey(`  ${modern}\n`), {
  present: true, type: 'SB_SECRET', hasLeadingOrTrailingWhitespace: true, length: modern.length
});

const legacy = 'eyJ.legacy-service-role.jwt';
assert.equal(isModernSupabaseSecretKey(legacy), false);
assert.deepEqual(buildUatSupabaseAuthHeaders(legacy), { apikey: legacy, Authorization: `Bearer ${legacy}` });

const root = path.resolve(__dirname, '..');
const seed = fs.readFileSync(path.join(root, 'scripts/seed-uat-supabase.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
assert.match(seed, /buildUatSupabaseAuthHeaders\(key\)/);
assert.match(seed, /'User-Agent': SERVER_USER_AGENT/);
assert.match(seed, /safeSupabaseError\(response, text\)/);
assert.match(server, /buildUatSupabaseAuthHeaders\(serviceRoleKey\)/);
assert.doesNotMatch(seed, /console\.(log|error).*key/i);
assert.doesNotMatch(server, /console\.(log|error).*serviceRoleKey/i);

console.log('uat-supabase-auth.test.cjs passed');
