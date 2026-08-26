import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { classifyLineLoginStarterResult, getLineLoginStartDiagnostic } from '../line-login-start-diagnostic.js';

const cases = [
  ['ORDER_DETAIL_CONTEXT_BLOCK', { code: 'F05E1', branch: 'ORDER_DETAIL_CONTEXT_BLOCK' }],
  ['LOGIN_ALREADY_IN_PROGRESS', { code: 'F05E2', branch: 'LOGIN_ALREADY_IN_PROGRESS' }],
  ['LIFF_LOGGED_IN_BUT_APP_IDENTITY_MISSING', { code: 'F05E3', branch: 'LIFF_LOGGED_IN_BUT_APP_IDENTITY_MISSING' }],
  ['LIFF_PROFILE_GET_THROW', { code: 'F05E3A', branch: 'GET_PROFILE_THROW' }],
  ['LIFF_PROFILE_MISSING_USER_ID', { code: 'F05E3B', branch: 'PROFILE_MISSING_USER_ID' }],
  ['LIFF_PROFILE_STATE_ID_MISSING', { code: 'F05E3C', branch: 'PROFILE_SYNC_RETURNED_WITHOUT_STATE_ID' }],
  ['LOGIN_STARTER_RETURNED_FALSE', { code: 'F05E4', branch: 'LOGIN_STARTER_RETURNED_FALSE' }],
  ['LOGIN_STARTER_RETURNED_NULL_OR_UNDEFINED', { code: 'F05E5', branch: 'LOGIN_STARTER_RETURNED_NULL_OR_UNDEFINED' }],
  ['LOGIN_STARTER_RETURNED_UNEXPECTED_OBJECT', { code: 'F05E6', branch: 'LOGIN_STARTER_RETURNED_UNEXPECTED_OBJECT' }],
  ['UNKNOWN_PRELOGIN_CONTROL_BRANCH', { code: 'F05E7', branch: 'UNKNOWN_PRELOGIN_CONTROL_BRANCH' }]
];

test('every F05E source branch has a unique safe subtype', () => {
  const codes = new Set();
  for (const [reason, expected] of cases) {
    const diagnostic = getLineLoginStartDiagnostic(reason);
    assert.deepEqual(diagnostic, expected);
    assert.equal(codes.has(diagnostic.code), false);
    codes.add(diagnostic.code);
  }
});

test('starter return values map to exact non-sensitive F05E branches', () => {
  assert.equal(classifyLineLoginStarterResult(false), 'LOGIN_STARTER_RETURNED_FALSE');
  assert.equal(classifyLineLoginStarterResult(undefined), 'LOGIN_STARTER_RETURNED_NULL_OR_UNDEFINED');
  assert.equal(classifyLineLoginStarterResult(null), 'LOGIN_STARTER_RETURNED_NULL_OR_UNDEFINED');
  assert.equal(classifyLineLoginStarterResult({}), 'LOGIN_STARTER_RETURNED_UNEXPECTED_OBJECT');
  assert.equal(classifyLineLoginStarterResult({ reason: 'LIFF_LOGIN_THROW' }), 'LIFF_LOGIN_THROW');
  assert.equal(classifyLineLoginStarterResult('unexpected'), 'UNKNOWN_PRELOGIN_CONTROL_BRANCH');
});

test('production uses distinct direct branches before LIFF login and keeps a successful login path', async () => {
  const appSource = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(appSource, /getRequestedOrderId\(\)\) return getLiffLoginStartFailure\('ORDER_DETAIL_CONTEXT_BLOCK'/);
  assert.match(appSource, /if \(liffLoginInProgress\)[\s\S]*LOGIN_ALREADY_IN_PROGRESS/);
  assert.ok(appSource.includes('const profileReady = await syncLineProfileFromLiff();'));
  assert.ok(appSource.includes('if (profileReady) return { ok: true, continueWithoutLogin: true };'));
  assert.match(appSource, /liff\.login\(\{ redirectUri \}\);[\s\S]*return returnStartStatus \? true : false/);
  assert.match(appSource, /console\.error\('\[line-login-start\]', \{[\s\S]*code: loginStartDiagnostic\.code,[\s\S]*branch: loginStartDiagnostic\.branch,[\s\S]*liffReady: State\.liffInitialized === true,[\s\S]*liffLoggedIn,[\s\S]*loginInProgress: liffLoginInProgress === true/);
});
