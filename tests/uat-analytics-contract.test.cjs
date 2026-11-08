const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const guard = fs.readFileSync(path.join(root, 'uat-backend-guard.js'), 'utf8');
const schema = fs.readFileSync(path.join(root, 'supabase/uat/2026-11-08-line-login-analytics.sql'), 'utf8');

assert.match(guard, /pathname === '\/api\/uat\/analytics\/event'/,
  'UAT backend guard must allow the dedicated analytics route');
assert.match(server, /pathname === "\/api\/uat\/analytics\/event"/);
assert.match(server, /normalizeUatAnalyticsEvent/);
assert.match(server, /uat_analytics_journeys/);
assert.match(server, /uat_analytics_events/);
assert.match(server, /lineuserid|line_user_id/);
assert.match(schema, /create table if not exists public\.uat_analytics_journeys/);
assert.match(schema, /create table if not exists public\.uat_analytics_events/);
assert.match(schema, /before insert|unique \(journey_id, event_name, stage_key\)/);
assert.match(schema, /cleanup_uat_analytics/);
assert.doesNotMatch(schema, /line_user_id|access_token|id_token|refresh_token/,
  'UAT analytics schema must not store LINE identity or tokens');

console.log('uat-analytics-contract.test.cjs passed');
