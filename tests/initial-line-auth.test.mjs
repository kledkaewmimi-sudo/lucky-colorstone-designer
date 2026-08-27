import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { invokeInitialLineAuthentication } from '../initial-line-auth.js';
import { establishLineIdentityBeforeDesign, isInitialLineIdentityCallback } from '../line-identity-before-design.js';

const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');

test('LIFF browser with a logged-in session synchronizes identity and never calls liff.login', async () => {
  let loginCalls = 0;
  const identity = await establishLineIdentityBeforeDesign({
    hasCanonicalIdentity: () => false,
    isLiffLoggedIn: () => true,
    synchronizeProfile: async () => ({ ok: true }),
    startLogin: async () => {
      loginCalls += 1;
      return { started: true };
    }
  });
  assert.deepEqual(identity, { ok: true, state: 'profile_synchronized' });
  assert.equal(loginCalls, 0);
  const result = invokeInitialLineAuthentication({ isInClient: true, liffInitialized: true, liff: { login: () => { loginCalls += 1; } } });
  assert.equal(result.started, false);
  assert.equal(result.method, 'NONE');
  assert.equal(loginCalls, 0);
});

for (const [environment, isInClient] of [['LINE in-app browser', false], ['external mobile browser', false]]) {
  test(`${environment} starts LIFF login exactly once on the first unauthenticated tap`, () => {
    let loginCalls = 0;
    const result = invokeInitialLineAuthentication({
      method: 'LIFF_LOGIN',
      isInClient,
      liffInitialized: true,
      liff: { login: () => { loginCalls += 1; } },
      redirectUri: 'https://uat.customize.luckycolorstone.com/?line_auth=identity'
    });
    assert.equal(result.started, true);
    assert.equal(result.method, 'LIFF_LOGIN');
    assert.equal(result.invocation, 'STARTED');
    assert.equal(loginCalls, 1);
  });
}

test('a successful liff.login invocation is navigation-started, not a second-tap prompt', () => {
  const result = invokeInitialLineAuthentication({
    liffInitialized: true,
    liff: { login: () => undefined },
    redirectUri: 'https://uat.customize.luckycolorstone.com/?line_auth=identity'
  });
  assert.equal(result.started, true);
  const failureBranch = app.slice(app.indexOf('if (!canContinue)'), app.indexOf("markStartupPerformance('T2_auth_ready')"));
  assert.match(failureBranch, /if \(!liffLoginInProgress\)/);
});

test('a synchronous liff.login failure blocks Step 1 and exposes a real retry result', () => {
  const result = invokeInitialLineAuthentication({
    liffInitialized: true,
    liff: { login: () => { throw new Error('blocked'); } }
  });
  assert.equal(result.started, false);
  assert.equal(result.invocation, 'THREW');
  assert.equal(result.reason, 'F05E2_LIFF_LOGIN_THROWN');
});

test('initial intent storage failure does not block initial LIFF login', () => {
  let loginCalls = 0;
  const result = invokeInitialLineAuthentication({
    liffInitialized: true,
    liff: { login: () => { loginCalls += 1; } },
    persistIntent: () => false
  });
  assert.equal(result.started, true);
  assert.equal(result.intentPersisted, false);
  assert.equal(loginCalls, 1);
});

test('successful initial callback commits Step 1 before rendering and never reopens Landing', () => {
  assert.equal(isInitialLineIdentityCallback('?liff.state=%3Fline_auth%3Didentity'), true);
  const startupStart = app.indexOf("document.addEventListener('DOMContentLoaded'");
  const startup = app.slice(startupStart, app.indexOf('function withTimeout', startupStart));
  const success = startup.slice(startup.indexOf('if (shouldResumeInitialIdentityCallback) {', startup.indexOf('await initLIFF()')));
  assert.ok(success.indexOf('State.currentStep = 1;') < success.indexOf('await renderApp();'));
  assert.ok(success.indexOf('State.landingDismissed = true;') < success.indexOf('await renderApp();'));
});

test('existing canonical identity reaches Step 1 without redundant login', async () => {
  let loginCalls = 0;
  const identity = await establishLineIdentityBeforeDesign({
    hasCanonicalIdentity: () => true,
    startLogin: async () => { loginCalls += 1; return { started: true }; }
  });
  assert.equal(identity.ok, true);
  assert.equal(loginCalls, 0);
});

test('the live first-tap regression cannot be reintroduced by intent-persistence guards', () => {
  const startLogin = app.slice(app.indexOf('function startLiffLoginForCustomization'), app.indexOf('function openLineConnectEntryForCustomization'));
  const entryLogin = app.slice(app.indexOf('function openLineConnectEntryForCustomization'), app.indexOf('async function requireLineLoginForCustomization'));
  assert.doesNotMatch(startLogin, /!rememberCustomizationLoginIntent\(\)\) return false/);
  assert.doesNotMatch(entryLogin, /!rememberCustomizationLoginIntent\(\)\) return false/);
  assert.match(startLogin, /invokeInitialLineAuthentication/);
  assert.match(entryLogin, /invokeInitialLineAuthentication/);
});
