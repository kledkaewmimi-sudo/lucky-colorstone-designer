const assert = require('assert/strict');
const {
  assertSafeUatEnvironment,
  collectUnsafeUatEnvironmentIssues,
  isUatReadOnlyApiRequest
} = require('../uat-backend-guard.js');

const safeEnvironment = { APP_ENV: 'uat', UAT_BACKEND: 'true' };

assert.deepEqual(collectUnsafeUatEnvironmentIssues(safeEnvironment), []);
assert.doesNotThrow(() => assertSafeUatEnvironment(safeEnvironment));
assert.throws(
  () => assertSafeUatEnvironment({ ...safeEnvironment, STRIPE_SECRET_KEY: 'sk_live_example' }),
  /Stripe credentials are prohibited/
);
assert.throws(
  () => assertSafeUatEnvironment({ ...safeEnvironment, SUPABASE_URL: 'https://example.supabase.co' }),
  /Supabase credentials are prohibited/
);
assert.throws(
  () => assertSafeUatEnvironment({ ...safeEnvironment, LINE_CHANNEL_ACCESS_TOKEN: 'token' }),
  /LINE credentials are prohibited/
);
assert.throws(
  () => assertSafeUatEnvironment({ ...safeEnvironment, META_PIXEL_ID: '1573172861217430' }),
  /META_PIXEL_ID is prohibited/
);
assert.throws(
  () => assertSafeUatEnvironment({ ...safeEnvironment, API_URL: 'https://lucky-colorstone-designer.onrender.com' }),
  /production Render host/
);

['/api/stones', '/api/charms', '/api/spacers', '/api/settings'].forEach((pathname) => {
  assert.equal(isUatReadOnlyApiRequest('GET', pathname), true);
});
assert.equal(isUatReadOnlyApiRequest('POST', '/api/orders'), false);
assert.equal(isUatReadOnlyApiRequest('GET', '/api/orders'), false);
assert.equal(isUatReadOnlyApiRequest('POST', '/api/stripe/checkout-session'), false);

console.log('uat-backend-guard.test.cjs passed');
