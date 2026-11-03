import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  createAdminPasswordHash,
  parseAdminPasswordHash,
  verifyAdminPassword
} = require('../server-admin-password.js');

const API_SECRET = 'crm-password-test-api-secret-not-for-production';
const DASHBOARD_PASSWORD = 'crm-password-test-value-not-for-production';
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucky-admin-password-'));

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function startServer(adminPasswordHash) {
  const port = await freePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dataDir,
      ADMIN_API_SECRET: API_SECRET,
      ADMIN_USERNAME: 'admin',
      ...(adminPasswordHash ? { ADMIN_PASSWORD_HASH: adminPasswordHash } : {}),
      SUPABASE_URL: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
      STRIPE_WEBHOOK_SECRET: '',
      LINE_CHANNEL_SECRET: ''
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out starting auth test server.')), 10000);
    child.stdout.on('data', (chunk) => {
      if (chunk.toString().includes(`localhost:${port}`)) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr.on('data', (chunk) => {
      const message = chunk.toString();
      if (/EADDRINUSE|Error:/.test(message)) {
        clearTimeout(timer);
        reject(new Error('Auth test server failed to start.'));
      }
    });
    child.once('error', reject);
  });
  return { child, baseUrl: `http://127.0.0.1:${port}` };
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill();
  await new Promise((resolve) => child.once('exit', resolve));
}

async function login(baseUrl, username, password) {
  const response = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  return {
    status: response.status,
    body: await response.json().catch(() => ({})),
    setCookie: response.headers.get('set-cookie') || ''
  };
}

function sessionCookie(setCookie) {
  return setCookie.split(/,\s*/).map((part) => part.trim()).find((part) => part.startsWith('lcs_admin_session=')) || '';
}

test('scrypt password hashes are salted, parseable, and verify without plaintext storage', async () => {
  const first = await createAdminPasswordHash(DASHBOARD_PASSWORD, { logN: 12 });
  const second = await createAdminPasswordHash(DASHBOARD_PASSWORD, { logN: 12 });
  assert.notEqual(first, second);
  assert.doesNotMatch(first, new RegExp(DASHBOARD_PASSWORD.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.ok(parseAdminPasswordHash(first));
  assert.equal(await verifyAdminPassword(DASHBOARD_PASSWORD, first), true);
  assert.equal(await verifyAdminPassword(`${DASHBOARD_PASSWORD}x`, first), false);
  assert.equal(await verifyAdminPassword(DASHBOARD_PASSWORD, 'not-a-valid-hash'), false);
});

test('dashboard password, API secret, username, sessions, and rotation remain separated', async () => {
  const passwordHash = await createAdminPasswordHash(DASHBOARD_PASSWORD, { logN: 12 });
  let server = await startServer(passwordHash);
  try {
    const valid = await login(server.baseUrl, 'admin', DASHBOARD_PASSWORD);
    assert.equal(valid.status, 200);
    assert.equal(valid.body.authenticated, true);
    assert.match(valid.setCookie, /lcs_admin_session=/);
    assert.match(valid.setCookie, /HttpOnly/);
    assert.match(valid.setCookie, /SameSite=Strict/);
    const cookie = sessionCookie(valid.setCookie);
    assert.ok(cookie);

    const session = await fetch(`${server.baseUrl}/api/admin/session`, {
      headers: { cookie }
    });
    assert.equal(session.status, 200);
    assert.equal((await session.json()).authenticated, true);

    const apiSecretAsPassword = await login(server.baseUrl, 'admin', API_SECRET);
    assert.equal(apiSecretAsPassword.status, 401);

    const wrongUsername = await login(server.baseUrl, 'not-admin', DASHBOARD_PASSWORD);
    assert.equal(wrongUsername.status, 401);

    const emptyUsername = await login(server.baseUrl, '', DASHBOARD_PASSWORD);
    assert.equal(emptyUsername.status, 401);

    const apiHeader = await fetch(`${server.baseUrl}/api/crm/orders`, {
      headers: { 'x-admin-secret': API_SECRET }
    });
    assert.equal(apiHeader.status, 200);

    const wrongApiHeader = await fetch(`${server.baseUrl}/api/crm/orders`, {
      headers: { 'x-admin-secret': DASHBOARD_PASSWORD }
    });
    assert.equal(wrongApiHeader.status, 401);

    await stopServer(server.child);
    const rotatedHash = await createAdminPasswordHash(`${DASHBOARD_PASSWORD}-rotated`, { logN: 12 });
    server = await startServer(rotatedHash);
    const oldSession = await fetch(`${server.baseUrl}/api/admin/session`, {
      headers: { cookie }
    });
    assert.equal(oldSession.status, 200);
    assert.equal((await oldSession.json()).authenticated, false);
  } finally {
    await stopServer(server.child);
  }
});

test('missing dashboard hash fails login closed while machine API auth remains available', async () => {
  const server = await startServer('');
  try {
    const loginWithoutHash = await login(server.baseUrl, 'admin', DASHBOARD_PASSWORD);
    assert.equal(loginWithoutHash.status, 503);
    assert.equal(loginWithoutHash.body.authenticated, false);
    const apiHeader = await fetch(`${server.baseUrl}/api/crm/orders`, {
      headers: { 'x-admin-secret': API_SECRET }
    });
    assert.equal(apiHeader.status, 200);
  } finally {
    await stopServer(server.child);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
