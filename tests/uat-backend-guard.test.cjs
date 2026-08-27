const assert = require('assert/strict');
const {
  assertSafeUatEnvironment,
  collectUnsafeUatEnvironmentIssues,
  APPROVED_UAT_SUPABASE_PROJECT_REF,
  APPROVED_UAT_SUPABASE_URL,
  isUatReadOnlyApiRequest,
  isUatFixtureApiRequest,
  isUatSupabaseApiRequest
} = require('../uat-backend-guard.js');

const safeEnvironment = {
  APP_ENV: 'uat', UAT_BACKEND: 'true',
  UAT_SUPABASE_PROJECT_REF: APPROVED_UAT_SUPABASE_PROJECT_REF,
  UAT_SUPABASE_URL: APPROVED_UAT_SUPABASE_URL,
  UAT_SUPABASE_SERVICE_ROLE_KEY: 'uat-test-key'
};

assert.deepEqual(collectUnsafeUatEnvironmentIssues(safeEnvironment), []);
assert.doesNotThrow(() => assertSafeUatEnvironment(safeEnvironment));
assert.throws(
  () => assertSafeUatEnvironment({ ...safeEnvironment, STRIPE_SECRET_KEY: 'sk_live_example' }),
  /Stripe credentials are prohibited/
);
assert.throws(
  () => assertSafeUatEnvironment({ ...safeEnvironment, SUPABASE_URL: 'https://example.supabase.co' }),
  /Generic Supabase variables are prohibited/
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

['/api/stones/save', '/api/charms', '/api/settings/save'].forEach((pathname) => {
  assert.equal(isUatFixtureApiRequest('POST', pathname), true);
});
assert.equal(isUatFixtureApiRequest('PUT', '/api/spacers/uat-test'), true);
assert.equal(isUatFixtureApiRequest('PUT', '/api/charms/uat-test'), true);
assert.equal(isUatFixtureApiRequest('POST', '/api/orders'), false);
assert.equal(isUatFixtureApiRequest('POST', '/api/auth-handoffs'), false);
assert.equal(isUatFixtureApiRequest('POST', '/api/stripe/checkout-session'), false);
assert.equal(isUatSupabaseApiRequest('POST', '/api/auth-handoffs'), true);
assert.equal(isUatSupabaseApiRequest(`GET`, `/api/auth-handoffs/${'a'.repeat(43)}`), true);
assert.equal(isUatSupabaseApiRequest(`POST`, `/api/auth-handoffs/${'a'.repeat(43)}/consume`), true);
assert.equal(isUatSupabaseApiRequest('GET', '/api/line-oa-add-friend'), true);
assert.equal(isUatSupabaseApiRequest('POST', '/api/orders'), false);
assert.match(collectUnsafeUatEnvironmentIssues({ ...safeEnvironment, SUPABASE_URL: 'https://production.supabase.co' }).join(' '), /Generic Supabase variables/);
assert.match(collectUnsafeUatEnvironmentIssues({ ...safeEnvironment, UAT_SUPABASE_PROJECT_REF: 'wrong-project-ref' }).join(' '), /owner-approved UAT project/);
assert.match(collectUnsafeUatEnvironmentIssues({ ...safeEnvironment, UAT_SUPABASE_URL: 'https://wrong-project.supabase.co' }).join(' '), /owner-approved UAT project/);

console.log('uat-backend-guard.test.cjs passed');
