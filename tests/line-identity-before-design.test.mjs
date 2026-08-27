import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { establishLineIdentityBeforeDesign, isInitialLineIdentityCallback } from '../line-identity-before-design.js';

test('initial identity callback recognises both direct and LIFF-wrapped markers', () => {
  assert.equal(isInitialLineIdentityCallback('?line_auth=identity'), true);
  assert.equal(isInitialLineIdentityCallback('?liff.state=%3Fline_auth%3Didentity'), true);
  assert.equal(isInitialLineIdentityCallback('?liff.state=%3Fline_auth%3Didentity%26other%3Dvalue'), true);
  assert.equal(isInitialLineIdentityCallback(''), false);
  assert.equal(isInitialLineIdentityCallback('?line_auth=other'), false);
});

test('existing canonical identity enters Step 1 without a redundant login', async () => {
  let loginCalls = 0;
  const result = await establishLineIdentityBeforeDesign({
    hasCanonicalIdentity: () => true,
    startLogin: async () => { loginCalls += 1; return { started: true }; }
  });
  assert.deepEqual(result, { ok: true, state: 'identity_ready' });
  assert.equal(loginCalls, 0);
});

test('an authenticated LIFF session synchronizes a missing application identity', async () => {
  const result = await establishLineIdentityBeforeDesign({
    isLiffLoggedIn: () => true,
    synchronizeProfile: async () => ({ ok: true })
  });
  assert.deepEqual(result, { ok: true, state: 'profile_synchronized' });
});

test('a LIFF profile failure fails closed with a sanitized reason', async () => {
  const result = await establishLineIdentityBeforeDesign({
    isLiffLoggedIn: () => true,
    synchronizeProfile: async () => ({ ok: false, reason: 'F05E3A' })
  });
  assert.deepEqual(result, { ok: false, state: 'profile_sync_failed', reason: 'F05E3A' });
});

test('a first-time user starts LIFF login without any design handoff', async () => {
  let loginCalls = 0;
  const result = await establishLineIdentityBeforeDesign({
    startLogin: async () => { loginCalls += 1; return { started: true }; }
  });
  assert.deepEqual(result, { ok: false, state: 'login_redirect_started' });
  assert.equal(loginCalls, 1);
});

test('UAT app source gates Landing Start before Step 1 and retires Step 3 first-auth', async () => {
  const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(source, /import \{ establishLineIdentityBeforeDesign, isInitialLineIdentityCallback \} from '\.\/line-identity-before-design\.js';/);
  assert.match(source, /requireLineLoginForCustomization\(\{ showLandingPrompt: true \}\)/);
  assert.doesNotMatch(source, /allowDeferredInitialLogin: true/);
  assert.match(source, /isInitialLineIdentityCallback\(window\.location\.search\)/);
  assert.match(source, /getLiffRedirectUri\(\{ initialIdentity: !preserveExistingIntent \}\)/);
  assert.match(source, /clearInitialLineIdentityCallbackMarker\(\)/);
  assert.match(source, /if \(!isLineIdentityAvailable\(\)\) \{\s*return \{ handled: true, ok: false, reason: 'line_identity_required' \};/);
  const boundaryStart = source.indexOf('async function beginDeferredStep3AuthBoundary');
  const boundaryEnd = source.indexOf('async function loadUatLiffConfiguration', boundaryStart);
  const boundary = source.slice(boundaryStart, boundaryEnd);
  assert.ok(boundary.indexOf("reason: 'line_identity_required'") < boundary.indexOf('if (IS_UAT_MODE)'));
});

test('initial identity callback is recognized before fresh-entry rendering and resumes a clean Step 1 only with identity', async () => {
  const [source, html] = await Promise.all([
    readFile(new URL('../app.js', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8')
  ]);
  const startupStart = source.indexOf("document.addEventListener('DOMContentLoaded'");
  const startupEnd = source.indexOf('function withTimeout', startupStart);
  const startup = source.slice(startupStart, startupEnd);
  assert.match(html, /const initialIdentityCallback = params\.get\('line_auth'\) === 'identity'/);
  assert.match(html, /liffStateParams\.get\('line_auth'\) === 'identity'/);
  assert.match(html, /if \(initialIdentityCallback \|\| validV2Intent/);
  assert.ok(startup.indexOf('const shouldResumeInitialIdentityCallback') < startup.indexOf('await initializeDeferredLoginQaSession()'));
  assert.ok(startup.indexOf('setCallbackBootstrapHold(true);') < startup.indexOf('await initializeDeferredLoginQaSession()'));
  assert.ok(startup.indexOf('const shouldResumeInitialIdentityCallback') < startup.indexOf('resetCustomizationSessionForFreshEntry()'));
  assert.ok(startup.indexOf('await initLIFF()') < startup.indexOf('if (shouldResumeInitialIdentityCallback) {', startup.indexOf('await initLIFF()')));
  assert.match(startup, /if \(isLineIdentityAvailable\(\)\) \{\s*State\.currentStep = 1;/);
  assert.match(startup, /State\.landingDismissed = true;\s*persistLandingDismissed\(\);\s*clearInitialLineIdentityCallbackMarker\(\);/);
  const successBranch = startup.slice(startup.indexOf('if (shouldResumeInitialIdentityCallback) {', startup.indexOf('await initLIFF()')));
  assert.ok(successBranch.indexOf('State.currentStep = 1;') < successBranch.indexOf('await renderApp();'));
  assert.ok(successBranch.indexOf('State.landingDismissed = true;') < successBranch.indexOf('await renderApp();'));
});

test('fresh entries retain Landing until Start while existing sessions avoid redundant login after Start', async () => {
  const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const startupStart = source.indexOf("document.addEventListener('DOMContentLoaded'");
  const startupEnd = source.indexOf('function withTimeout', startupStart);
  const startup = source.slice(startupStart, startupEnd);
  assert.match(startup, /if \(shouldStartFreshCustomization\) \{\s*resetCustomizationSessionForFreshEntry\(\);/);
  assert.match(source, /State\.landingDismissed = false;/);
  assert.match(source, /requireLineLoginForCustomization\(\{ showLandingPrompt: true \}\)/);
});

test('Step 3 keeps the OA-friendship design handoff and blocks Step 4 without friendFlag', async () => {
  const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const gateStart = source.indexOf('async function canEnterOperationalStep4');
  const gateEnd = source.indexOf('async function resumeLineOaFriendshipAfterReturn', gateStart);
  const gate = source.slice(gateStart, gateEnd);
  assert.match(gate, /const savedSnapshot = saveGuestDesignSnapshot\(\)/);
  assert.match(gate, /setLineOaFriendshipResumePending\(\)/);
  assert.match(gate, /if \(friendship\.friendFlag\) \{/);
});
