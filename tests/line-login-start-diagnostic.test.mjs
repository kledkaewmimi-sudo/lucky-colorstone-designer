import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { classifyLineLoginStarterResult, getLineLoginStartDiagnostic } from '../line-login-start-diagnostic.js';
import { establishLineIdentityBeforeDesign, isInitialLineIdentityCallback } from '../line-identity-before-design.js';

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

test('Start begins identity login and a successful initial callback enters a clean Step 1', async () => {
  const appSource = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const start = await establishLineIdentityBeforeDesign({
    hasCanonicalIdentity: () => false,
    isLiffLoggedIn: () => false,
    startLogin: async () => ({ started: true })
  });
  assert.deepEqual(start, { ok: false, state: 'login_redirect_started' });
  const callback = await establishLineIdentityBeforeDesign({
    hasCanonicalIdentity: () => false,
    isLiffLoggedIn: () => true,
    synchronizeProfile: async () => ({ ok: true })
  });
  assert.deepEqual(callback, { ok: true, state: 'profile_synchronized' });
  assert.equal(isInitialLineIdentityCallback('?line_auth=identity'), true);
  assert.match(appSource, /requireLineLoginForCustomization\(\{ showLandingPrompt: true \}\)/);
  assert.match(appSource, /const shouldResumeInitialIdentityCallback = !returnParams\.has\('orderId'\)\s*&& isInitialLineIdentityCallback\(window\.location\.search\)/);
  assert.match(appSource, /if \(shouldResumeInitialIdentityCallback\) \{[\s\S]{0,900}?resetCustomizationSessionForFreshEntry\(\)/);
  assert.match(appSource, /if \(isLineIdentityAvailable\(\)\) \{\s*State\.currentStep = 1;\s*State\.landingDismissed = true;/);
});
