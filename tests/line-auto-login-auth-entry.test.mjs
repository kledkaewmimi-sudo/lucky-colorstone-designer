import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('app.js', 'utf8');
const authEntry = fs.readFileSync('line-auth-entry.js', 'utf8');
const authEntryHtml = fs.readFileSync('line-auth-entry.html', 'utf8');
const server = fs.readFileSync('server.js', 'utf8');
const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));

test('landing/root app never enables automatic login globally', () => {
  assert.doesNotMatch(app, /withLoginOnExternalBrowser/);
  assert.match(app, /liff\.init\(\{ liffId: LIFF_ID \}\)/);
});

test('only the dedicated auth entry initializes with automatic login', () => {
  assert.match(authEntry, /withLoginOnExternalBrowser:\s*true/);
  assert.match(authEntry, /EXPECTED_UAT_LIFF_ID\s*=\s*'2010525799-Sw5UFc6E'/);
  assert.match(authEntryHtml, /line-auth-entry\.js/);
});

test('auth entry is restricted to UAT mobile external browser and boundary resume step 2', () => {
  assert.match(app, /function canUseAutoAuthEntryForCustomization\(\)/);
  assert.match(app, /loginResumeStep === 2 && !forceExplicit && canUseAutoAuthEntryForCustomization\(\)/);
  assert.match(app, /forceExplicit: explicitLogin/);
  assert.match(app, /isLikelyMobileBrowser\(\)/);
  assert.match(app, /AUTO_LOGIN_AT_BOUNDARY/);
  assert.match(app, /detectBrowserContext\(window\.navigator\.userAgent \|\| ''\)\.isInstagram/);
  assert.doesNotMatch(app, /startAutoAuthEntryForCustomization\([^)]*landing/i);
});

test('pending tab session is opaque, tab-scoped, and never carries a handoff token in the URL', () => {
  assert.match(app, /sessionStorage\.setItem\(AUTO_AUTH_ENTRY_PENDING_KEY/);
  assert.match(app, /tabSessionId/);
  assert.match(app, /window\.location\.assign\(AUTO_AUTH_ENTRY_PATH\)/);
  assert.doesNotMatch(app, /line-auth-entry\?.*handoff/i);
});

test('consume sends raw ID token only in request body and never logs it', () => {
  assert.match(app, /liff\.getIDToken\(\)/);
  assert.match(app, /body: JSON\.stringify\(\{\s*idToken,\s*sessionId: pending\.sessionId/);
  assert.doesNotMatch(app, /console\.(log|info|warn|error)\([^\n]*idToken/i);
  assert.doesNotMatch(app, /sessionStorage\.setItem\([^\n]*idToken/i);
});

test('root callback cannot restore without a verified server consume response', () => {
  assert.match(app, /if \(!response\.ok \|\| result\?\.ok !== true \|\| !applyInitialHandoffSnapshot\(result\.snapshot\)\)/);
  assert.match(app, /clearAutoAuthEntryState\(\)/);
});

test('server verifier uses the official LINE endpoint and channel ID', () => {
  assert.match(server, /verifyUatLineIdToken/);
  assert.match(server, /\/api\/line-id-token\/verify/);
  assert.match(server, /x-uat-auth-entry/);
  assert.match(server, /UAT origin required/);
});

test('Vercel functions are routed before the catch-all backend rewrite', () => {
  const routes = vercel.routes || [];
  const entryIndex = routes.findIndex((route) => route.src === '/api/line-auth-entry');
  const consumeIndex = routes.findIndex((route) => route.src === '/api/line-auth-consume');
  const catchAllIndex = routes.findIndex((route) => route.src === '/api/(.*)');
  assert.ok(entryIndex >= 0 && entryIndex < catchAllIndex);
  assert.ok(consumeIndex >= 0 && consumeIndex < catchAllIndex);
  assert.equal(routes[entryIndex].dest, '/api/line-auth-entry.js');
  assert.equal(routes[consumeIndex].dest, '/api/line-auth-consume.js');
});

test('auth entry cookie uses host-only Secure HttpOnly SameSite contract', () => {
  for (const source of [
    fs.readFileSync('api/line-auth-entry.js', 'utf8'),
    fs.readFileSync('server.js', 'utf8')
  ]) {
    assert.match(source, /__Host-uat-line-auth-browser/);
    assert.match(source, /HttpOnly; Secure; SameSite=Lax/);
    assert.match(source, /Path=\//);
    assert.doesNotMatch(source, /Domain=/);
  }
});

test('LIFF init timeout allows LINE Continue confirmation and classifies timeout safely', () => {
  assert.match(app, /const LIFF_INIT_TIMEOUT_MS = 30000/);
  assert.match(app, /withTimeout\(liff\.init\(\{ liffId: LIFF_ID \}\), LIFF_INIT_TIMEOUT_MS/);
  assert.match(app, /LIFF_INIT_TIMEOUT/);
  assert.match(app, /liff_init_timeout/);
  assert.doesNotMatch(app, /withTimeout\(liff\.init\(\{ liffId: LIFF_ID \}\), 6000/);
});

test('pending auth-entry recovery is browser-cookie bound and never returns a handoff token', () => {
  assert.match(server, /pathname === '\/api\/auth-entry\/sessions\/pending'/);
  assert.match(server, /req\.method !== 'GET'/);
  assert.match(server, /x-uat-auth-entry/);
  assert.match(server, /getRequestCookie\(req, AUTH_ENTRY_COOKIE\)/);
  assert.match(server, /browser_id: `eq\.\$\{browserId\}`/);
  assert.match(server, /consumed_at: 'is\.null'/);
  assert.match(server, /sessionId: pending\.sessionId/);
  assert.match(fs.readFileSync('uat-backend-guard.js', 'utf8'), /method === 'GET' && pathname === '\/api\/auth-entry\/sessions\/pending'/);
  const pendingStart = server.indexOf("if (pathname === '/api/auth-entry/sessions/pending')");
  const pendingBlock = server.slice(pendingStart, server.indexOf('if (!isAllowedUatOriginRequest(req))', pendingStart));
  assert.doesNotMatch(pendingBlock, /handoffToken|handoff_token|idToken/);
});

test('root boot recovers a pending auth-entry session before legacy resume', () => {
  assert.match(app, /async function recoverPendingAutoAuthEntry\(\)/);
  assert.match(app, /fetch\('\/api\/auth-entry\/sessions\/pending'/);
  assert.match(app, /if \(!autoAuthEntryPending[\s\S]{0,300}recoverPendingAutoAuthEntry\(\)/);
  assert.match(app, /shouldResumeAutoAuthEntry = autoAuthEntryPending/);
  assert.match(app, /else if \(autoAuthEntryRecoveryFailed\)/);
  assert.match(app, /auth_entry_pending_recovery_failed/);
  assert.ok(app.indexOf('recoverPendingAutoAuthEntry()') < app.indexOf('shouldResumeCustomizationStart'));
  assert.ok(app.indexOf('if (shouldResumeAutoAuthEntry)') < app.indexOf("designer_returned', { source: 'legacy_intent'"));
});

test('pending recovery fails closed for expired or failed server lookup', () => {
  assert.match(app, /result\?\.expired === true/);
  assert.match(app, /if \(!response\.ok\) return \{ ok: false, pending: false \}/);
  assert.match(app, /auth_entry_pending_recovery_failed/);
  assert.match(server, /expired: true/);
  assert.match(server, /sendAuthEntryJson\(res, 503/);
});
