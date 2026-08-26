import assert from 'node:assert/strict';
import test from 'node:test';
import { createLineAuthHandoffRequest } from '../line-handoff-client.js';

const token = 'a'.repeat(43);
const payload = {
  targetStep: 4,
  designSnapshot: {
    version: 1,
    savedAt: 1_760_000_000_000,
    expiresAt: 1_760_007_200_000,
    step: 3,
    design: {
      wristSize: 16.5,
      beadSize: 'mixed',
      mixedPlacingSize: 10,
      selectedCharmIds: ['gold-anchor'],
      components: [
        { type: 'stone', id: 'amethyst', size: 4, uniqueId: 1 },
        { type: 'spacer', id: 'silver-spacer', uniqueId: 2 },
        { type: 'stone', id: 'amethyst', size: 10, uniqueId: 3 },
        { type: 'charm', id: 'heart-charm', uniqueId: 4 },
        { type: 'stone', id: 'amethyst', size: 6, uniqueId: 5 }
      ]
    }
  }
};

test('production frontend handoff request uses the proxied relative URL and accepts a 201 token', async () => {
  let received;
  const result = await createLineAuthHandoffRequest({
    payload,
    fetchImpl: async (url, options) => {
      received = { url, options };
      return { ok: true, status: 201, json: async () => ({ token, expiresAt: 1_760_001_200_000 }) };
    }
  });
  assert.equal(received.url, '/api/auth-handoffs');
  assert.equal(received.options.method, 'POST');
  assert.equal(received.options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(received.options.body), payload);
  assert.deepEqual(result, { ok: true, token, expiresAt: 1_760_001_200_000 });
});

test('handoff request reports safe reasons for network, HTTP, malformed JSON, and missing token failures', async () => {
  const network = await createLineAuthHandoffRequest({ payload, fetchImpl: async () => { throw new Error('offline'); } });
  assert.deepEqual(network, { ok: false, reason: 'HANDOFF_POST_NETWORK_FAILED' });

  const http = await createLineAuthHandoffRequest({ payload, fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({ error: 'unavailable' }) }) });
  assert.deepEqual(http, { ok: false, reason: 'HANDOFF_POST_HTTP_FAILED', status: 503 });

  const malformed = await createLineAuthHandoffRequest({ payload, fetchImpl: async () => ({ ok: true, status: 201, json: async () => { throw new Error('bad json'); } }) });
  assert.deepEqual(malformed, { ok: false, reason: 'HANDOFF_RESPONSE_INVALID', status: 201 });

  const missingToken = await createLineAuthHandoffRequest({ payload, fetchImpl: async () => ({ ok: true, status: 201, json: async () => ({ expiresAt: 1_760_001_200_000 }) }) });
  assert.deepEqual(missingToken, { ok: false, reason: 'HANDOFF_TOKEN_MISSING', status: 201 });
});
