const PRODUCTION_RENDER_HOST = 'lucky-colorstone-designer.onrender.com';
const REQUIRED_UAT_ENVIRONMENT = 'uat';

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function collectUnsafeUatEnvironmentIssues(env = process.env) {
  const issues = [];
  const appEnvironment = String(env.APP_ENV || '').trim().toLowerCase();

  if (appEnvironment !== REQUIRED_UAT_ENVIRONMENT) issues.push('APP_ENV must be uat');
  if (String(env.UAT_BACKEND || '').trim().toLowerCase() !== 'true') issues.push('UAT_BACKEND must be true');

  if (hasValue(env.SUPABASE_URL) || hasValue(env.SUPABASE_SERVICE_ROLE_KEY)) {
    issues.push('Supabase credentials are prohibited in the fixture-only UAT backend');
  }

  if (hasValue(env.STRIPE_SECRET_KEY) || hasValue(env.STRIPE_WEBHOOK_SECRET)) {
    issues.push('Stripe credentials are prohibited in the fixture-only UAT backend');
  }

  if (hasValue(env.LINE_CHANNEL_ACCESS_TOKEN) || hasValue(env.LINE_CHANNEL_SECRET)) {
    issues.push('LINE credentials are prohibited in the fixture-only UAT backend');
  }

  if (hasValue(env.ADMIN_LINE_USER_IDS) || hasValue(env.ADMIN_LINE_GROUP_ID)) {
    issues.push('LINE notification targets are prohibited in the fixture-only UAT backend');
  }

  Object.entries(env).forEach(([key, value]) => {
    if (!hasValue(value)) return;
    if (/^(META_|ANALYTICS_)/.test(key)) {
      issues.push(`${key} is prohibited in the fixture-only UAT backend`);
    }
    if (String(value).includes(PRODUCTION_RENDER_HOST)) {
      issues.push(`${key} targets the production Render host`);
    }
  });

  return [...new Set(issues)];
}

function assertSafeUatEnvironment(env = process.env) {
  const issues = collectUnsafeUatEnvironmentIssues(env);
  if (issues.length > 0) {
    throw new Error(`Unsafe UAT backend environment: ${issues.join('; ')}`);
  }
}

function isUatReadOnlyApiRequest(method, pathname) {
  return method === 'GET' && [
    '/api/stones',
    '/api/charms',
    '/api/spacers',
    '/api/settings'
  ].includes(pathname);
}

module.exports = {
  assertSafeUatEnvironment,
  collectUnsafeUatEnvironmentIssues,
  isUatReadOnlyApiRequest
};
