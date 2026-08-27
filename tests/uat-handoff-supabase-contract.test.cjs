const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const schema = fs.readFileSync(path.join(root, 'supabase/uat/2026-08-27-uat-catalog-and-handoff-schema.sql'), 'utf8');
const { normalizeHandoffPayload } = require('../line-auth-handoff.js');

assert.match(schema, /create or replace function public\.read_uat_line_auth_handoff/);
assert.match(schema, /create or replace function public\.consume_uat_line_auth_handoff/);
assert.match(server, /supabaseRpc\('read_uat_line_auth_handoff'/);
assert.match(server, /supabaseRpc\('consume_uat_line_auth_handoff'/);
assert.match(server, /readHandoffMatch[\s\S]*method === 'GET'/);
assert.match(server, /consumeHandoffMatch[\s\S]*method === 'POST'/);
assert.match(server, /isHandoffRequest && !isAllowedUatOriginRequest\(req\)/);
assert.match(server, /"GET, POST, PUT, OPTIONS"/);
assert.match(server, /buildSpacerRow\(nextRecord\)/);
assert.match(app, /const handoffUrl = `\/api\/auth-handoffs\/\$\{encodeURIComponent\(token\)\}`/);
assert.match(app, /await fetch\(handoffUrl\)/);
assert.match(app, /await fetch\(`\$\{handoffUrl\}\/consume`/);
assert.match(app, /consumeResult\?\.consumed !== true/);

const fixed = normalizeHandoffPayload({
  targetStep: 3,
  designSnapshot: { version: 1, savedAt: 10, expiresAt: 20, step: 3, design: { wristSize: 16, beadSize: '6', selectedCharmIds: [], components: [{ type: 'stone', id: 'fixed-stone' }] } }
}, 100);
assert.equal(fixed.designSnapshot.design.components[0].size, 6);
const mixed = normalizeHandoffPayload({
  targetStep: 3,
  designSnapshot: { version: 1, savedAt: 10, expiresAt: 20, step: 3, design: { wristSize: 16, beadSize: 'mixed', mixedPlacingSize: 10, selectedCharmIds: [], components: [{ type: 'stone', id: 'four', size: 4 }, { type: 'stone', id: 'six', size: 6 }, { type: 'stone', id: 'ten', size: 10 }], ResolvedLayout: { ignored: true } } }
}, 100);
assert.deepEqual(mixed.designSnapshot.design.components.map((component) => component.size), [4, 6, 10]);
assert.equal(JSON.stringify(mixed).includes('ResolvedLayout'), false);

console.log('uat-handoff-supabase-contract.test.cjs passed');
