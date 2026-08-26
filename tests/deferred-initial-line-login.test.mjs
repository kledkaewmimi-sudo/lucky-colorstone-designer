import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createInitialLineLoginGuard,
  shouldBypassInitialLineLogin,
  shouldBypassInitialLineLoginInProduction
} from '../deferred-initial-line-login.js';

const mobileCustomization = {
  requiresLineLogin: true,
  isAuthenticated: false,
  isCustomization: true
};

test('production adapter enables the deferred initial-login decision for mobile customization', () => {
  assert.equal(shouldBypassInitialLineLoginInProduction(mobileCustomization), true);
});

test('the real guard wrapper can be constructed with a test-only true resolver', () => {
  const controlledGuard = createInitialLineLoginGuard({ resolveFeatureEnabled: () => true });
  assert.equal(controlledGuard(mobileCustomization), true);
  assert.equal(shouldBypassInitialLineLoginInProduction(mobileCustomization), true);
  assert.equal(shouldBypassInitialLineLogin({ ...mobileCustomization, featureEnabled: false }), false);
});

test('a default wrapper follows the shipped production rollout value', () => {
  const controlledGuard = createInitialLineLoginGuard({ resolveFeatureEnabled: () => true });
  const defaultGuard = createInitialLineLoginGuard();
  assert.equal(controlledGuard(mobileCustomization), true);
  assert.equal(defaultGuard(mobileCustomization), true);
});

test('desktop, authenticated, non-customization, and malformed contexts fail safe', () => {
  const controlledGuard = createInitialLineLoginGuard({ resolveFeatureEnabled: () => true });
  assert.equal(controlledGuard({ requiresLineLogin: false, isCustomization: true }), false);
  assert.equal(controlledGuard({ ...mobileCustomization, isAuthenticated: true }), false);
  assert.equal(controlledGuard({ requiresLineLogin: true, isCustomization: false }), false);
  assert.equal(controlledGuard(), false);
  assert.equal(createInitialLineLoginGuard({ resolveFeatureEnabled: () => 'true' })(mobileCustomization), false);
});

test('UAT retires the deferred initial-login app guard while retaining its isolated compatibility module', async () => {
  const appSource = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(appSource, /createInitialLineLoginGuard/);
  assert.doesNotMatch(appSource, /shouldBypassInitialLineLoginForApp/);
  assert.match(appSource, /await initializeDeferredLoginQaSession\(\)/);
  assert.doesNotMatch(appSource, /DEFER_LINE_LOGIN_TO_STEP4/);
  assert.doesNotMatch(appSource, /qa.*urlParams|urlParams.*qa/i);
});
