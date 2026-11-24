'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'frontend/app.js'), 'utf8');
const entry = fs.readFileSync(path.join(root, 'frontend/line-auth-entry.js'), 'utf8');
const entryHtml = fs.readFileSync(path.join(root, 'frontend/line-auth-entry.html'), 'utf8');
const vercel = JSON.parse(fs.readFileSync(path.join(root, 'frontend/vercel.json'), 'utf8'));
const backend = fs.readFileSync(path.join(root, 'backend/production-line-auth-entry.js'), 'utf8');
const handoff = require('../backend/line-auth-handoff.js');
const server = fs.readFileSync(path.join(root, 'backend/server.js'), 'utf8');

test('frontend has no UAT environment, origin, LIFF ID, or UAT auth header hardcode', () => {
  const combined = `${app}\n${entry}\n${entryHtml}\n${backend}\n${server}`;
  assert.equal(/2010525799-Sw5UFc6E/.test(combined), false);
  assert.equal(/uat\.customize\.luckycolorstone\.com/.test(combined), false);
  assert.equal(/lucky-colorstone-uat\.onrender\.com/.test(combined), false);
  assert.equal(/x-uat-auth-entry/i.test(combined), false);
  assert.equal(/__Host-uat-line-auth-browser/.test(combined), false);
});

test('production auth entry uses the production origin, Render host, cookie, and header', () => {
  assert.match(backend, /customize\.luckycolorstone\.com/);
  assert.match(backend, /__Host-lc-line-auth-browser/);
  assert.match(backend, /x-lc-auth-entry/);
  assert.match(backend, /verification_not_configured/);
  assert.match(server, /isAuthEntryPath\(pathname\)/);
  assert.match(JSON.stringify(vercel), /lucky-colorstone-designer\.onrender\.com/);
});

test('Next-only auto-entry is restricted to eligible production mobile', () => {
  const gate = app.slice(app.indexOf('function canUseAutoAuthEntryForCustomization'), app.indexOf('function createInitialHandoffDesignSnapshot'));
  assert.match(gate, /APP_ENV === 'production'/);
  assert.match(gate, /detectBrowserContext/);
  assert.match(gate, /isInstagram/);
  assert.match(gate, /isLiffInClient/);
  assert.match(gate, /isLineIdentityAvailable/);
  assert.match(gate, /getRequestedOrderId/);
  assert.match(gate, /explicit_login/);
  const attempt = app.slice(app.indexOf('async function attemptStep1AuthorizationAndContinue'), app.indexOf('async function attemptStep1AuthorizationAndContinue') + 1800);
  assert.match(attempt, /startAutoAuthEntryForCustomization/);
  assert.match(attempt, /!explicitLogin/);
});

test('Instagram branded handoff screen exists in the production app and document', () => {
  assert.match(app, /setupInstagramBrowserTransition\(\)/);
  assert.match(app, /buildAndroidChromeIntent/);
  assert.match(app, /buildInstagramExternalBrowserUrl/);
  assert.match(app, /showInstagramHandoffScreen/);
  assert.match(app, /instagramHandoffCta/);
  assert.match(app, /automatic: false/);
  const index = fs.readFileSync(path.join(root, 'frontend/index.html'), 'utf8');
  assert.match(index, /id="instagramHandoffScreen"/);
  assert.match(index, /assets\/instagram-handoff\/safari\.jpg/);
  assert.match(index, /id="instagramHandoffCta"/);
  assert.equal(index.includes('instagram://extbrowser/?url='), false);
  assert.match(app, /assets\/instagram-handoff\/chrome\.jpg/);
  assert.match(app, /เปิดผ่าน Safari/);
  assert.match(app, /เปิดผ่าน Chrome/);
  const transition = fs.readFileSync(path.join(root, 'frontend/instagram-browser-transition.js'), 'utf8');
  assert.match(transition, /package=com\.android\.chrome/);
  assert.match(transition, /S\.browser_fallback_url=/);
  assert.match(transition, /CAMPAIGN_PARAM_PATTERN/);
});

test('Step 1 initial handoff accepts the empty pre-bead design used by the live flow', () => {
  const now = Date.now();
  const payload = handoff.normalizeHandoffPayload({
    targetStep: 2,
    ttlMs: 10 * 60 * 1000,
    designSnapshot: {
      version: 1,
      savedAt: now,
      expiresAt: now + 10 * 60 * 1000,
      step: 1,
      design: {
        wristSize: 16,
        beadSize: null,
        mixedPlacingSize: 6,
        selectedCharmIds: [],
        components: []
      }
    },
    analyticsContinuity: {}
  });
  assert.ok(payload);
  assert.equal(payload.designSnapshot.design.beadSize, null);
  assert.equal(payload.designSnapshot.design.mixedPlacingSize, 6);
});

test('auth-entry start failure hides the loading overlay', () => {
  const start = app.slice(app.indexOf('async function startAutoAuthEntryForCustomization'), app.indexOf('async function handleAutoAuthEntryReturn'));
  assert.match(start, /failAutoAuthEntryStart\('HANDOFF_CREATE_FAILED'\)/);
  assert.match(app, /function failAutoAuthEntryStart/);
  assert.match(app, /if \(DOM\.liffLoadingOverlay\) DOM\.liffLoadingOverlay\.style\.display = 'none'/);
});

test('LINE auth startup recovery cannot leave the loading overlay indefinitely', () => {
  assert.match(app, /LINE_AUTH_STARTUP_RECOVERY_MS/);
  assert.match(app, /function armStartupAuthRecovery\(/);
  assert.match(app, /auth_startup_timeout/);
  assert.match(app, /armStartupAuthRecovery\(\)/);
});

test('auth-entry page keeps UAT LIFF initialization and does not invoke liff.login again', () => {
  assert.match(entry, /withLoginOnExternalBrowser:\s*true/);
  assert.match(entry, /INIT_TIMEOUT_MS/);
  assert.equal(/liff\.login\(/.test(entry), false);
  assert.match(entry, /spinnerNode/);
  assert.match(entry, /spinnerNode\.style\.display = 'none'/);
});

test('pending auth-entry recovery happens before the legacy resume branch', () => {
  const recoveryIndex = app.indexOf('await recoverPendingAutoAuthEntry()');
  const legacyIndex = app.indexOf('const startupRawCustomizationIntent');
  assert.ok(recoveryIndex !== -1);
  assert.ok(legacyIndex !== -1);
  assert.ok(recoveryIndex < legacyIndex);
  assert.ok(app.includes('handleAutoAuthEntryReturn()'));
  assert.ok(app.includes('if (hasPendingAutoAuthEntryReturn)'));
});

test('identity token is sent to the server but never persisted in browser storage', () => {
  const handle = app.slice(app.indexOf('async function handleAutoAuthEntryReturn'), app.indexOf('function isLiffInClient'));
  assert.match(handle, /getIDToken/);
  assert.match(handle, /\/api\/line-auth-consume/);
  assert.equal(/localStorage\.setItem\([^\n]*idToken/i.test(handle), false);
  assert.equal(/sessionStorage\.setItem\([^\n]*idToken/i.test(handle), false);
  assert.equal(/localStorage\.setItem\([^\n]*handoffToken/i.test(handle), false);
});

test('Vercel serves the extensionless auth-entry document before the API catch-all', () => {
  const routes = vercel.routes.map((route) => route.src);
  const authIndex = routes.indexOf('/line-auth-entry');
  const apiCatchAll = routes.indexOf('/api/(.*)');
  assert.notEqual(authIndex, -1);
  assert.notEqual(apiCatchAll, -1);
  assert.ok(authIndex < apiCatchAll);
});

test('analytics lifecycle names distinguish auth-entry from legacy source labels', () => {
  assert.match(app, /designer_returned.*source: 'auth_entry'/);
  assert.match(app, /line_auth_started.*method: 'auth_entry'/);
  assert.match(app, /line_auth_success.*method: 'auth_entry'/);
  assert.match(app, /state_restore_success/);
  assert.equal(/designer_returned.*legacy_intent/.test(app), false);
});
