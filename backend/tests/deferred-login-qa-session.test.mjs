import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import qaSession from '../deferred-login-qa-session.js';
import { activateDeferredLoginQaSessionFromFragment, getValidatedDeferredLoginQaState, hasQaProbeCookie } from '../deferred-login-qa-client.js';

const {
  DEFERRED_LOGIN_QA_TTL_MS,
  DEFERRED_LOGIN_QA_TOKEN_PATTERN,
  createDeferredLoginQaToken,
  isDeferredLoginQaSessionActive
} = qaSession;

test('QA token is opaque 256-bit base64url and the TTL is 45 minutes', () => {
  const token = createDeferredLoginQaToken();
  assert.match(token, DEFERRED_LOGIN_QA_TOKEN_PATTERN);
  assert.equal(token.length, 43);
  assert.equal(DEFERRED_LOGIN_QA_TTL_MS, 45 * 60 * 1000);
});

test('expired and revoked QA sessions fail closed', () => {
  const now = Date.now();
  assert.equal(isDeferredLoginQaSessionActive({ expires_at: new Date(now + 1).toISOString() }, now), true);
  assert.equal(isDeferredLoginQaSessionActive({ expires_at: new Date(now).toISOString() }, now), false);
  assert.equal(isDeferredLoginQaSessionActive({ expires_at: new Date(now + 1).toISOString(), revoked_at: new Date(now).toISOString() }, now), false);
});

test('the client probe cannot enable QA without server validation', async () => {
  assert.equal(hasQaProbeCookie('other=1; lucky_deferred_login_qa_probe=1'), true);
  assert.deepEqual(await getValidatedDeferredLoginQaState({ cookieText: '' }), { enabled: false });
  assert.deepEqual(await getValidatedDeferredLoginQaState({
    cookieText: 'lucky_deferred_login_qa_probe=1',
    fetchImpl: async () => ({ ok: true, json: async () => ({ enabled: false }) })
  }), { enabled: false });
  const state = await getValidatedDeferredLoginQaState({
    cookieText: 'lucky_deferred_login_qa_probe=1',
    fetchImpl: async () => ({ ok: true, json: async () => ({ enabled: true, expiresAt: Date.now() + 10_000 }) })
  });
  assert.equal(state.enabled, true);
});

test('a private opaque fragment activates only after server validation and is removed', async () => {
  let cleared = 0;
  const invalid = await activateDeferredLoginQaSessionFromFragment({
    hash: '#deferred-login-qa=not-a-token',
    clearFragment: () => { cleared += 1; }
  });
  assert.deepEqual(invalid, { enabled: false, attempted: false });
  assert.equal(cleared, 0);

  const validToken = createDeferredLoginQaToken();
  const activated = await activateDeferredLoginQaSessionFromFragment({
    hash: `#deferred-login-qa=${validToken}`,
    fetchImpl: async (_url, options) => {
      assert.equal(options.method, 'POST');
      assert.match(options.body, new RegExp(validToken));
      return { ok: true, json: async () => ({ enabled: true, expiresAt: Date.now() + 10_000 }) };
    },
    clearFragment: () => { cleared += 1; }
  });
  assert.equal(activated.enabled, true);
  assert.equal(cleared, 1);
});

test('app has no URL, storage, or global QA activation path', async () => {
  const [appSource, clientSource] = await Promise.all([
    readFile(new URL('../app.js', import.meta.url), 'utf8'),
    readFile(new URL('../deferred-login-qa-client.js', import.meta.url), 'utf8')
  ]);
  assert.doesNotMatch(appSource, /qa.*urlParams|urlParams.*qa/i);
  assert.doesNotMatch(clientSource, /localStorage|sessionStorage|[?&]flag=true/i);
});
