import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { establishLineIdentityBeforeDesign, isInitialLineIdentityCallback } from '../line-identity-before-design.js';

const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');

function sourceBetween(start, end) {
  const startIndex = app.indexOf(start);
  return app.slice(startIndex, app.indexOf(end, startIndex));
}

test('existing valid LINE identity proceeds without login and commits Step 1', async () => {
  const identity = await establishLineIdentityBeforeDesign({ hasCanonicalIdentity: () => true });
  assert.deepEqual(identity, { ok: true, state: 'identity_ready' });
  const handler = sourceBetween('function setupLandingEvents()', '// Load State from LocalStorage');
  assert.match(handler, /if \(!canContinue\)[\s\S]*?return;[\s\S]*?State\.currentStep = 1;\s*State\.landingDismissed = true;[\s\S]*?await renderApp\(\)/);
});

test('logged-in LIFF with missing app identity synchronizes profile before Step 1', async () => {
  let synchronized = false;
  const identity = await establishLineIdentityBeforeDesign({
    isLiffLoggedIn: () => true,
    synchronizeProfile: async () => {
      synchronized = true;
      return { ok: true };
    }
  });
  assert.equal(synchronized, true);
  assert.deepEqual(identity, { ok: true, state: 'profile_synchronized' });
});

test('first-time login callback is recognized and commits callback state before rendering', () => {
  assert.equal(isInitialLineIdentityCallback('?line_auth=identity'), true);
  const startup = sourceBetween("document.addEventListener('DOMContentLoaded'", 'function withTimeout');
  const callbackSuccess = startup.slice(startup.indexOf('if (shouldResumeInitialIdentityCallback) {', startup.indexOf('await initLIFF()')));
  assert.ok(callbackSuccess.indexOf('State.currentStep = 1;') < callbackSuccess.indexOf('await renderApp();'));
  assert.ok(callbackSuccess.indexOf('State.landingDismissed = true;') < callbackSuccess.indexOf('await renderApp();'));
});

test('successful Start cannot clear loading and render Landing again', () => {
  const handler = sourceBetween('function setupLandingEvents()', '// Load State from LocalStorage');
  const success = handler.slice(handler.indexOf("markStartupPerformance('T2_auth_ready')"));
  assert.match(success, /State\.currentStep = 1;\s*State\.landingDismissed = true;\s*persistLandingDismissed\(\);[\s\S]*?await renderApp\(\)/);
  assert.doesNotMatch(success, /State\.landingDismissed = false|resetLandingStartAfterFailure|showLineConnectPrompt/);
});

test('authentication failure blocks Step 1 and exposes the existing retry presentation', async () => {
  const identity = await establishLineIdentityBeforeDesign({
    isLiffLoggedIn: () => true,
    synchronizeProfile: async () => ({ ok: false, reason: 'F05E3A' })
  });
  assert.equal(identity.ok, false);
  const handler = sourceBetween('function setupLandingEvents()', '// Load State from LocalStorage');
  const blocked = handler.slice(handler.indexOf('if (!canContinue)'), handler.indexOf("markStartupPerformance('T2_auth_ready')"));
  assert.match(blocked, /if \(!liffLoginInProgress\) \{\s*showLineConnectPrompt\(/);
  assert.doesNotMatch(blocked, /resetLandingStartState\(\)/);
});
