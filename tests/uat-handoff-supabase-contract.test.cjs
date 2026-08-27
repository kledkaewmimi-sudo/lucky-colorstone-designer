const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const schema = fs.readFileSync(path.join(root, 'supabase/uat/2026-08-27-uat-catalog-and-handoff-schema.sql'), 'utf8');

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

console.log('uat-handoff-supabase-contract.test.cjs passed');
