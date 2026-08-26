import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { UAT_LIFF_ENV_VARIABLE, resolveLiffEnvironmentConfig } from '../liff-environment-config.js';

const require = createRequire(import.meta.url);
const liffConfigHandler = require('../api/liff-config.js');

test('production-style configuration resolves only its supplied LIFF ID', () => {
  assert.deepEqual(resolveLiffEnvironmentConfig({ environment: 'production', liffId: 'production-id' }), {
    ok: true, liffId: 'production-id', reason: ''
  });
});

test('UAT resolves only its separately supplied LIFF ID', () => {
  assert.equal(UAT_LIFF_ENV_VARIABLE, 'UAT_LIFF_ID');
  assert.deepEqual(resolveLiffEnvironmentConfig({ environment: 'uat', liffId: 'uat-id' }), {
    ok: true, liffId: 'uat-id', reason: ''
  });
});

test('UAT missing configuration fails closed and cannot fall back to a production ID', () => {
  assert.deepEqual(resolveLiffEnvironmentConfig({ environment: 'uat', liffId: '' }), {
    ok: false, liffId: '', reason: 'UAT_LIFF_CONFIG_MISSING'
  });
});

test('UAT config endpoint exposes only the UAT environment LIFF ID', () => {
  const original = process.env.UAT_LIFF_ID;
  const response = {
    setHeader() {},
    status() { return this; },
    json(payload) { this.payload = payload; }
  };
  try {
    process.env.UAT_LIFF_ID = 'uat-id';
    liffConfigHandler({}, response);
    assert.deepEqual(response.payload, { environment: 'uat', liffId: 'uat-id' });
  } finally {
    if (original === undefined) delete process.env.UAT_LIFF_ID;
    else process.env.UAT_LIFF_ID = original;
  }
});
