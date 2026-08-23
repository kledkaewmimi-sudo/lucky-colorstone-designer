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

test('production adapter remains false and preserves the legacy initial login decision', () => {
  assert.equal(shouldBypassInitialLineLoginInProduction(mobileCustomization), false);
});

test('the real guard wrapper can be constructed with a test-only true resolver', () => {
  const controlledGuard = createInitialLineLoginGuard({ resolveFeatureEnabled: () => true });
  assert.equal(controlledGuard(mobileCustomization), true);
  assert.equal(shouldBypassInitialLineLoginInProduction(mobileCustomization), false);
  assert.equal(shouldBypassInitialLineLogin({ ...mobileCustomization, featureEnabled: false }), false);
});

test('removing the injected resolver immediately returns the same wrapper to production behavior', () => {
  const controlledGuard = createInitialLineLoginGuard({ resolveFeatureEnabled: () => true });
  const defaultGuard = createInitialLineLoginGuard();
  assert.equal(controlledGuard(mobileCustomization), true);
  assert.equal(defaultGuard(mobileCustomization), false);
});

test('desktop, authenticated, non-customization, and malformed contexts fail safe', () => {
  const controlledGuard = createInitialLineLoginGuard({ resolveFeatureEnabled: () => true });
  assert.equal(controlledGuard({ requiresLineLogin: false, isCustomization: true }), false);
  assert.equal(controlledGuard({ ...mobileCustomization, isAuthenticated: true }), false);
  assert.equal(controlledGuard({ requiresLineLogin: true, isCustomization: false }), false);
  assert.equal(controlledGuard(), false);
  assert.equal(createInitialLineLoginGuard({ resolveFeatureEnabled: () => 'true' })(mobileCustomization), false);
});

test('app resolves its production guard through static flag plus server-validated QA state only', async () => {
  const appSource = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(appSource, /import \{ createInitialLineLoginGuard \} from '\.\/deferred-initial-line-login\.js';/);
  assert.match(appSource, /const shouldBypassInitialLineLoginForApp = createInitialLineLoginGuard/);
  assert.match(appSource, /shouldBypassInitialLineLoginForApp\(\{/);
  assert.match(appSource, /await initializeDeferredLoginQaSession\(\)/);
  assert.doesNotMatch(appSource, /DEFER_LINE_LOGIN_TO_STEP4/);
  assert.doesNotMatch(appSource, /qa.*urlParams|urlParams.*qa/i);
});
