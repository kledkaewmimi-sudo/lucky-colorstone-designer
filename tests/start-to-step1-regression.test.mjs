import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { establishLineIdentityBeforeDesign, isInitialLineIdentityCallback } from '../line-identity-before-design.js';
import { parseCustomizationLoginIntent } from '../line-redirect-restore.js';

const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');

function sourceBetween(start, end) {
  const startIndex = app.indexOf(start);
  const endIndex = app.indexOf(end, startIndex);
  assert.ok(startIndex >= 0 && endIndex > startIndex, `Missing source boundary: ${start}`);
  return app.slice(startIndex, endIndex);
}

test('existing verified LINE identity remains canonical', async () => {
  const identity = await establishLineIdentityBeforeDesign({ hasCanonicalIdentity: () => true });
  assert.deepEqual(identity, { ok: true, state: 'identity_ready' });
});

test('logged-in LIFF with missing app identity still synchronizes exactly once', async () => {
  let synchronized = 0;
  const identity = await establishLineIdentityBeforeDesign({
    isLiffLoggedIn: () => true,
    synchronizeProfile: async () => {
      synchronized += 1;
      return { ok: true };
    }
  });
  assert.equal(synchronized, 1);
  assert.deepEqual(identity, { ok: true, state: 'profile_synchronized' });
});

test('initial LINE callback recognition remains unchanged', () => {
  assert.equal(isInitialLineIdentityCallback('?line_auth=identity'), true);
  assert.equal(isInitialLineIdentityCallback('?liff.state=%3Fline_auth%3Didentity'), true);
});

test('ordinary fresh startup renders Step 1 before awaiting the full bootstrap', () => {
  const landing = sourceBetween('function setupLandingEvents()', '// Load State from LocalStorage');
  const progressive = landing.indexOf('if (progressiveStartupEligible)');
  const bootstrapWait = landing.indexOf('await customerStartupBootstrapPromise');
  const step1Commit = landing.indexOf('State.currentStep = 1');
  assert.ok(progressive >= 0, 'Missing progressive startup branch');
  assert.ok(progressive < bootstrapWait, 'Progressive branch must precede bootstrap wait');
  assert.ok(progressive < step1Commit, 'Progressive branch must commit Step 1 immediately');
  assert.match(landing.slice(progressive, bootstrapWait), /await renderApp\(\)/);
  assert.match(landing.slice(progressive, bootstrapWait), /startProgressiveLineVerification\(\)/);
});

test('Step 1 Next cannot reach Step 2 without successful identity authorization', () => {
  const navigation = sourceBetween('function setupNavigationEvents()', '// Home Button clicks');
  const step1Branch = navigation.slice(
    navigation.indexOf('if (State.currentStep === 1)'),
    navigation.indexOf('if (State.currentStep === 2)')
  );
  const authorization = sourceBetween('async function attemptStep1AuthorizationAndContinue({ explicitLogin = false } = {})', 'function setupProgressiveStep1AuthEvents()');
  assert.match(step1Branch, /await attemptStep1AuthorizationAndContinue\(\)/);
  assert.match(step1Branch, /return/);
  assert.ok(authorization.indexOf('const authorized = await ensureStep1LineAuthorization()') < authorization.indexOf('await goToStep(2)'));
  assert.match(authorization, /if \(!authorized\)[\s\S]*?return false/);
});

test('progressive authorization preserves a failed Step 1 and exposes retry', () => {
  const authorization = sourceBetween('async function attemptStep1AuthorizationAndContinue({ explicitLogin = false } = {})', 'function setupProgressiveStep1AuthEvents()');
  const status = sourceBetween('function renderStep1AuthStatus()', 'function setStep1AuthStatus');
  assert.match(authorization, /setStep1AuthStatus\('failed'\)/);
  assert.match(authorization, /State\.currentStep === 1[\s\S]*?DOM\.btnNext\.disabled = false/);
  assert.match(status, /btnStep1LineConnect/);
  assert.match(status, /getLineAuthFailureMessage|LINE_CONNECT_RETRY_MESSAGE/);
});

test('LIFF bootstrap and profile synchronization are single-flight', () => {
  const bootstrap = sourceBetween('function startLineBootstrap()', 'async function load');
  const profileSync = sourceBetween('function syncLineProfileFromLiff()', 'async function getLineOaFriendshipStatus');
  assert.match(bootstrap, /if \(lineBootstrapPromise\) return lineBootstrapPromise/);
  assert.match(bootstrap, /await initLIFF\(\)/);
  assert.match(profileSync, /if \(lineProfileSyncPromise\) return lineProfileSyncPromise/);
  assert.match(profileSync, /lineProfileSyncPromise = performLineProfileSync\(\)/);
});

test('Step 2 redirect intent is bounded and resumes only after verified identity', () => {
  const timestamp = 1_760_000_000_000;
  const intent = parseCustomizationLoginIntent(
    JSON.stringify({ ts: timestamp, step: 1, targetStep: 2 }),
    { now: timestamp + 1 }
  );
  assert.deepEqual(intent, {
    version: 1,
    ts: timestamp,
    step: 1,
    targetStep: 2,
    mode: 'legacy'
  });
  const resume = sourceBetween('async function completeCustomizationStartResume()', 'function startLiffLoginForCustomization');
  assert.ok(resume.indexOf('isLineIdentityAvailable()') < resume.indexOf('await goToStep(2)'));
  assert.match(resume, /resumeStep === 2[\s\S]*?setStep1AuthStatus\('failed'\)/);
});

test('special callback and return flows retain the legacy pre-Step-1 path', () => {
  const startup = sourceBetween("document.addEventListener('DOMContentLoaded'", 'function withTimeout');
  assert.match(startup, /progressiveStartupEligible = shouldStartFreshCustomization[\s\S]*?!shouldHoldForCallbackBootstrap[\s\S]*?!shouldOpenStep4FromUrl/);
  assert.match(startup, /if \(shouldResumeInitialIdentityCallback\)/);
  assert.match(startup, /if \(shouldHoldForDeferredCallback\)/);
  assert.match(startup, /resolveCustomerStartupBootstrapOnce\(\)/);
});
