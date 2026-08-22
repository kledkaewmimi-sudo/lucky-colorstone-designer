import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
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

test('pure adapter accepts an explicit test-only feature value', () => {
  assert.equal(shouldBypassInitialLineLogin({ ...mobileCustomization, featureEnabled: true }), true);
  assert.equal(shouldBypassInitialLineLogin({ ...mobileCustomization, featureEnabled: false }), false);
});

test('desktop, authenticated, non-customization, and malformed contexts fail safe', () => {
  assert.equal(shouldBypassInitialLineLogin({ featureEnabled: true, requiresLineLogin: false, isCustomization: true }), false);
  assert.equal(shouldBypassInitialLineLogin({ ...mobileCustomization, featureEnabled: true, isAuthenticated: true }), false);
  assert.equal(shouldBypassInitialLineLogin({ featureEnabled: true, requiresLineLogin: true, isCustomization: false }), false);
  assert.equal(shouldBypassInitialLineLogin(), false);
});

test('app uses only the production adapter, not a customer-controlled feature source', async () => {
  const appSource = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(appSource, /import \{ shouldBypassInitialLineLoginInProduction \} from '\.\/deferred-initial-line-login\.js';/);
  assert.match(appSource, /shouldBypassInitialLineLoginInProduction\(\{/);
  assert.doesNotMatch(appSource, /DEFER_LINE_LOGIN_TO_STEP4/);
});
