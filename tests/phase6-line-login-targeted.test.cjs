'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'frontend/app.js'), 'utf8');
const entry = fs.readFileSync(path.join(root, 'frontend/line-auth-entry.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'backend/server.js'), 'utf8');

function slice(startMarker, endMarker) {
  const start = app.indexOf(startMarker);
  const end = app.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `${startMarker} not found`);
  return app.slice(start, end);
}

test('Step 1 Next starts auth-entry, saves the design before redirect, and targets Step 2', () => {
  const attempt = slice('async function attemptStep1AuthorizationAndContinue(', 'function setupProgressiveStep1AuthEvents');
  assert.match(attempt, /startAutoAuthEntryForCustomization/);
  const start = slice('async function startAutoAuthEntryForCustomization', 'function applyInitialHandoffSnapshot');
  assert.ok(start.indexOf('saveState()') > 0);
  assert.ok(start.indexOf("window.location.assign(AUTO_AUTH_ENTRY_PATH)") > start.indexOf('saveState()'));
  assert.match(start, /targetStep: 2/);
});

test('auth-entry success restores Step 2; failure returns to Step 1 without clearing saved design', () => {
  const success = slice('async function handleAutoAuthEntryReturn', 'function isLiffInClient');
  assert.match(success, /State\.currentStep = 2/);
  assert.match(success, /clearAutoAuthEntryState\(\)/);
  const failure = slice('function failAutoAuthEntryReturn', 'async function startAutoAuthEntryForCustomization');
  assert.match(failure, /State\.currentStep = 1/);
  assert.equal(/resetCustomizationSessionForFreshEntry|CUSTOMIZATION_STATE_STORAGE_KEY|localStorage\.removeItem/.test(failure), false);
  assert.equal(/localStorage\.setItem\([^\n]*idToken/i.test(success), false);
});

test('browser entry uses a cookie-bound auth-entry page and never puts a token in the URL', () => {
  assert.match(entry, /withLoginOnExternalBrowser: true/);
  assert.match(entry, /liff\.init/);
  assert.equal(/location\.(href|assign|replace).*idToken/i.test(entry), false);
  assert.match(server, /isAuthEntryPath\(pathname\)/);
  assert.match(server, /productionAuthEntryService\.handle/);
});
