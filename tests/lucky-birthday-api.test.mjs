import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';

const port = 8793;
const dataDir = await mkdtemp(join(tmpdir(), 'lcs-lucky-birthday-'));
const server = spawn(process.execPath, ['server.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    DATA_DIR: dataDir,
    PORT: String(port),
    APP_ENV: 'uat',
    UAT_BACKEND: 'true',
    UAT_SUPABASE_URL: 'https://crviqzaziboxshbzhpri.supabase.co',
    UAT_SUPABASE_PROJECT_REF: 'crviqzaziboxshbzhpri',
    UAT_SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out starting birthday API test server.')), 10000);
    server.stdout.on('data', (chunk) => {
      if (chunk.toString().includes(`localhost:${port}`)) {
        clearTimeout(timer);
        resolve();
      }
    });
    server.once('error', reject);
    server.stderr.on('data', (chunk) => reject(new Error(chunk.toString())));
  });

  await test('rejects invalid, future, and cross-origin birthday submissions', async () => {
    const post = (payload, headers = {}) => fetch(`http://localhost:${port}/api/lucky/birthday`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(payload)
    });
    const base = { source: 'lucky', sessionId: 'session_birthday_123456', consentVersion: 'lucky-birthday-consent-th-v1' };
    assert.equal((await post({ ...base, birthDate: '2026-02-30' })).status, 400);
    assert.equal((await post({ ...base, birthDate: '2999-01-01' })).status, 400);
    assert.equal((await post({ ...base, birthDate: '2000-02-29' }, { Origin: 'https://attacker.example' })).status, 403);
  });

  await test('contains no local JSON fallback or analytics-event write path', async () => {
    const source = await readFile('server.js', 'utf8');
    const start = source.indexOf('async function saveLuckyBirthday');
    const end = source.indexOf('const ANALYTICS_RANGE_PRESETS', start);
    const handler = source.slice(start, end);
    assert.match(handler, /if \(!isSupabaseConfigured\(\)\) return \{ ok: false, status: 503, code: 'configuration' \}/);
    assert.doesNotMatch(handler, /writeJsonFile|saveAnalytics/);
    assert.match(handler, /supabaseRequest\('lucky_birthday_submissions'/);
    assert.match(handler, /resolution=ignore-duplicates/);
    assert.match(source, /classifyLuckyBirthdayPersistenceError/);
    assert.doesNotMatch(source.slice(source.indexOf('function classifyLuckyBirthdayPersistenceError'), source.indexOf('const ANALYTICS_RANGE_PRESETS')), /birthDate|sessionId|serviceRoleKey/);
    assert.match(source, /sendJson\(res, result\.status, \{ success: result\.ok, code: result\.code \}\)/);
  });

  await test('keeps raw records private and provides restricted aggregate/retention paths', async () => {
    const migration = await readFile('supabase/migrations/20261025020137_lucky_birthday_append_only.sql', 'utf8');
    assert.match(migration, /birth_date date not null/);
    assert.match(migration, /enable row level security/);
    assert.match(migration, /revoke all on table public\.lucky_birthday_submissions from anon, authenticated, public/);
    assert.match(migration, /revoke all on table public\.lucky_birthday_submissions from service_role/);
    assert.match(migration, /grant select, insert, delete on table public\.lucky_birthday_submissions to service_role/);
    assert.match(migration, /minimum_cohort_size integer default 10/);
    assert.match(migration, /lucky_birthday_prune\(retention_days integer\)/);
    assert.doesNotMatch(migration, /grant select on table public\.lucky_birthday_submissions to anon/);
  });
} finally {
  server.kill();
  await rm(dataDir, { recursive: true, force: true });
}
