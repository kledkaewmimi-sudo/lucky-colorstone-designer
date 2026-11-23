'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const pgBin = process.env.LUCKY_RC_PG_BIN || 'C:/Program Files/PostgreSQL/14/bin';
const bin = (name) => path.join(pgBin, process.platform === 'win32' ? `${name}.exe` : name);
const psql = bin('psql');
const hasPostgres = fs.existsSync(psql);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

function startPg(dataDir, port) {
  const init = spawnSync(bin('initdb'), ['-D', dataDir, '-U', 'postgres', '-A', 'trust', '--encoding=UTF8'], { stdio: 'ignore' });
  assert.equal(init.status, 0, 'initdb failed');
  const start = spawnSync(bin('pg_ctl'), ['-D', dataDir, '-o', `-p ${port} -h 127.0.0.1`, '-w', 'start'], { stdio: 'ignore' });
  assert.equal(start.status, 0, 'pg_ctl failed');
}

function stopPg(dataDir) {
  spawnSync(bin('pg_ctl'), ['-D', dataDir, '-m', 'immediate', '-w', 'stop'], { stdio: 'ignore' });
}

function args(port, database, extra = []) {
  return ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', database, '-At', '-v', 'ON_ERROR_STOP=1', ...extra];
}

function env(port) {
  return { ...process.env, PGHOST: '127.0.0.1', PGPORT: String(port), PGUSER: 'postgres', PGPASSWORD: '' };
}

function sql(port, database, query) {
  return new Promise((resolve) => {
    const child = spawn(psql, args(port, database, ['-c', query]), { env: env(port) });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('close', (code) => resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
  });
}

function file(port, database, filename) {
  const result = spawnSync(psql, args(port, database, ['-f', path.join(root, filename)]), { encoding: 'utf8' });
  assert.equal(result.status, 0, `${filename}: ${result.stderr || result.stdout}`);
}

function token(char) {
  return char.repeat(43);
}

function reserveSql(session, browser, tab, handoff) {
  return `select * from public.create_line_auth_entry_session('${session}','${browser}','${tab}','${handoff}',600);`;
}

function insertHandoffSql(handoff) {
  return `insert into public.line_auth_handoffs(token,payload,expires_at,consumed_at) values ('${handoff}','{"targetStep":2,"designSnapshot":{"version":1}}'::jsonb, now()+interval '10 minutes', null);`;
}

async function reset(port, database) {
  const result = await sql(port, database, 'delete from public.line_auth_entry_sessions; delete from public.line_auth_handoffs;');
  assert.equal(result.code, 0, result.stderr);
}

test('auth session expiry retry and one-pending-session invariants', { timeout: 180000, skip: !hasPostgres && 'PostgreSQL 14 binaries unavailable' }, async () => {
  const port = await freePort();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lucky-phase7-auth-'));
  const dataDir = path.join(tempRoot, 'data');
  const database = 'lucky_phase7_auth';
  try {
    startPg(dataDir, port);
    const createdb = spawnSync(bin('createdb'), ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', database], { stdio: 'ignore' });
    assert.equal(createdb.status, 0, 'createdb failed');
    file(port, database, 'tests/migration/local-bootstrap.sql');
    file(port, database, 'supabase/production/2026-11-23-line-auth-entry-sessions.sql');
    // Intended migration execution model is create-or-replace/idempotent.
    file(port, database, 'supabase/production/2026-11-23-line-auth-entry-sessions.sql');
    await reset(port, database);

    const browser = token('b');
    const tab = token('t');
    const handoff1 = token('H');
    const session1 = token('s');
    const session2 = token('S');
    const handoff2 = token('I');
    await sql(port, database, insertHandoffSql(handoff1));
    let result = await sql(port, database, reserveSql(session1, browser, tab, handoff1));
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, new RegExp(session1));

    // Active duplicate for the same tab must not create another pending row.
    result = await sql(port, database, reserveSql(session2, browser, tab, handoff1));
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, '');
    let count = await sql(port, database, `select count(*) from public.line_auth_entry_sessions where browser_id='${browser}' and tab_session_id='${tab}' and consumed_at is null;`);
    assert.equal(Number(count.stdout), 1);

    // Expired pending session must not block an immediate retry.
    await sql(port, database, `update public.line_auth_entry_sessions set expires_at = now() - interval '1 second' where session_id='${session1}';`);
    await sql(port, database, insertHandoffSql(handoff2));
    result = await sql(port, database, reserveSql(session2, browser, tab, handoff2));
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, new RegExp(session2));
    count = await sql(port, database, `select count(*) from public.line_auth_entry_sessions where browser_id='${browser}' and tab_session_id='${tab}' and consumed_at is null;`);
    assert.equal(Number(count.stdout), 1);
    const old = await sql(port, database, `select count(*) from public.line_auth_entry_sessions where session_id='${session1}';`);
    assert.equal(Number(old.stdout), 0);

    // A consumed session must remain untouched by retry cleanup.
    const consumedSession = token('c');
    const consumedHandoff = token('C');
    await sql(port, database, insertHandoffSql(consumedHandoff));
    result = await sql(port, database, reserveSql(consumedSession, token('d'), token('e'), consumedHandoff));
    assert.equal(result.code, 0, result.stderr);
    result = await sql(port, database, `select * from public.consume_line_auth_entry_session('${consumedSession}','${token('d')}','${token('e')}');`);
    assert.equal(result.code, 0, result.stderr);
    const nextSession = token('f');
    const nextHandoff = token('F');
    await sql(port, database, insertHandoffSql(nextHandoff));
    result = await sql(port, database, reserveSql(nextSession, token('d'), token('e'), nextHandoff));
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, new RegExp(nextSession));
    const consumedStillThere = await sql(port, database, `select count(*) from public.line_auth_entry_sessions where session_id='${consumedSession}' and consumed_at is not null;`);
    assert.equal(Number(consumedStillThere.stdout), 1);

    // A different browser/tab is unaffected by the retry cleanup.
    const otherBrowser = token('g');
    const otherTab = token('h');
    const otherSession = token('j');
    const otherHandoff = token('J');
    await sql(port, database, insertHandoffSql(otherHandoff));
    result = await sql(port, database, reserveSql(otherSession, otherBrowser, otherTab, otherHandoff));
    assert.equal(result.code, 0, result.stderr);
    await sql(port, database, `update public.line_auth_entry_sessions set expires_at = now() - interval '1 second' where session_id='${otherSession}';`);
    const replacementBrowser = token('k');
    const replacementTab = token('m');
    const replacementSession = token('n');
    const replacementHandoff = token('N');
    await sql(port, database, insertHandoffSql(replacementHandoff));
    result = await sql(port, database, reserveSql(replacementSession, replacementBrowser, replacementTab, replacementHandoff));
    assert.equal(result.code, 0, result.stderr);
    const otherStillThere = await sql(port, database, `select count(*) from public.line_auth_entry_sessions where session_id='${otherSession}';`);
    assert.equal(Number(otherStillThere.stdout), 1);

    // Expired handoffs cannot create a session; live handoff expiry caps session expiry.
    const expiredHandoff = token('E');
    await sql(port, database, `insert into public.line_auth_handoffs(token,payload,expires_at) values ('${expiredHandoff}','{"targetStep":2}'::jsonb, now()-interval '1 second');`);
    result = await sql(port, database, reserveSql(token('p'), token('q'), token('r'), expiredHandoff));
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, '');
    const cap = await sql(port, database, `select expires_at <= (select expires_at from public.line_auth_handoffs where token='${handoff2}') from public.line_auth_entry_sessions where session_id='${session2}';`);
    assert.equal(cap.stdout, 't');

    // Two concurrent creation attempts for one browser/tab must yield one pending row.
    await reset(port, database);
    await sql(port, database, insertHandoffSql(token('R')));
    const concurrent = await Promise.all([
      sql(port, database, reserveSql(token('u'), browser, tab, token('R'))),
      sql(port, database, reserveSql(token('v'), browser, tab, token('R')))
    ]);
    assert.equal(concurrent.every((entry) => entry.code === 0), true);
    const concurrentCount = await sql(port, database, `select count(*) from public.line_auth_entry_sessions where browser_id='${browser}' and tab_session_id='${tab}' and consumed_at is null;`);
    assert.equal(Number(concurrentCount.stdout), 1);

    // Rollback removes only the new auth-entry objects and preserves handoffs.
    await sql(port, database, 'drop function if exists public.cleanup_line_auth_entry_sessions(int); drop function if exists public.consume_production_line_auth_entry_session(text,text,text); drop function if exists public.create_production_line_auth_entry_session(text,text,text,text,int); drop function if exists public.consume_line_auth_entry_session(text,text,text); drop function if exists public.create_line_auth_entry_session(text,text,text,text,int); drop table if exists public.line_auth_entry_sessions;');
    const gone = await sql(port, database, "select to_regclass('public.line_auth_entry_sessions') is null, to_regclass('public.line_auth_handoffs') is not null;");
    assert.equal(gone.stdout, 't|t');

    // Reapply after rollback is safe for a fresh deployment.
    file(port, database, 'supabase/production/2026-11-23-line-auth-entry-sessions.sql');
    const reapplied = await sql(port, database, "select to_regclass('public.line_auth_entry_sessions') is not null;");
    assert.equal(reapplied.stdout, 't');
  } finally {
    stopPg(dataDir);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
