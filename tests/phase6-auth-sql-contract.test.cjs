'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const service = fs.readFileSync(path.join(root, 'backend/production-line-auth-entry.js'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'supabase/production/2026-11-23-line-auth-entry-sessions.sql'), 'utf8');

test('auth-entry service RPC names have matching local migration wrappers', () => {
  for (const name of ['create_production_line_auth_entry_session', 'consume_production_line_auth_entry_session']) {
    assert.ok(service.includes(name), `service missing ${name}`);
    assert.ok(sql.includes(`create or replace function public.${name}`), `migration missing ${name}`);
    assert.ok(sql.includes(`grant execute on function public.${name}`), `grant missing ${name}`);
  }
  assert.ok(sql.includes('revoke all on function public.create_production_line_auth_entry_session'));
  assert.ok(sql.includes('revoke all on function public.consume_production_line_auth_entry_session'));
});
