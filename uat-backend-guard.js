const PRODUCTION_RENDER_HOST = 'lucky-colorstone-designer.onrender.com';
const REQUIRED_UAT_ENVIRONMENT = 'uat';
const APPROVED_UAT_SUPABASE_PROJECT_REF = 'crviqzaziboxshbzhpri';
const APPROVED_UAT_SUPABASE_URL = 'https://crviqzaziboxshbzhpri.supabase.co';

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function collectUnsafeUatEnvironmentIssues(env = process.env) {
  const issues = [];
  const appEnvironment = String(env.APP_ENV || '').trim().toLowerCase();

  if (appEnvironment !== REQUIRED_UAT_ENVIRONMENT) issues.push('APP_ENV must be uat');
  if (String(env.UAT_BACKEND || '').trim().toLowerCase() !== 'true') issues.push('UAT_BACKEND must be true');

  if (hasValue(env.SUPABASE_URL) || hasValue(env.SUPABASE_SERVICE_ROLE_KEY)) {
    issues.push('Generic Supabase variables are prohibited; use UAT_SUPABASE_* only');
  }

  const uatSupabaseUrl = String(env.UAT_SUPABASE_URL || '').trim();
  const uatSupabaseKey = String(env.UAT_SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const uatProjectRef = String(env.UAT_SUPABASE_PROJECT_REF || '').trim();
  if (!uatSupabaseUrl || !uatSupabaseKey || !uatProjectRef) {
    issues.push('UAT_SUPABASE_URL, UAT_SUPABASE_SERVICE_ROLE_KEY, and UAT_SUPABASE_PROJECT_REF are required');
  } else {
    try {
      const parsed = new URL(uatSupabaseUrl);
      const exactUrl = parsed.protocol === 'https:'
        && !parsed.username && !parsed.password && !parsed.port
        && parsed.pathname === '/' && !parsed.search && !parsed.hash
        && uatSupabaseUrl === APPROVED_UAT_SUPABASE_URL;
      if (uatProjectRef !== APPROVED_UAT_SUPABASE_PROJECT_REF || !exactUrl || parsed.hostname !== `${APPROVED_UAT_SUPABASE_PROJECT_REF}.supabase.co`) {
        issues.push('UAT Supabase project ref and URL must match the owner-approved UAT project');
      }
    } catch {
      issues.push('UAT Supabase URL is invalid');
    }
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

// UAT catalog records live only in the UAT JSON fixture directory.  These are
// the sole mutations permitted by this service; every order, payment, LINE,
// upload, analytics, and generic API mutation remains fail-closed.
function isUatFixtureApiRequest(method, pathname) {
  if (isUatReadOnlyApiRequest(method, pathname)) return true;

  if (method === 'POST' && [
    '/api/stones/save',
    '/api/charms',
    '/api/settings/save'
  ].includes(pathname)) return true;

  return method === 'PUT' && (
    pathname.startsWith('/api/charms/') ||
    pathname.startsWith('/api/spacers/')
  );
}

function isUatSupabaseApiRequest(method, pathname) {
  if (isUatFixtureApiRequest(method, pathname)) return true;
  if (method === 'GET' && pathname === '/api/line-oa-add-friend') return true;
  if (method === 'POST' && pathname === '/api/auth-handoffs') return true;
  if (method === 'GET' && /^\/api\/auth-handoffs\/[A-Za-z0-9_-]{43}$/.test(pathname)) return true;
  return method === 'POST' && /^\/api\/auth-handoffs\/[A-Za-z0-9_-]{43}\/consume$/.test(pathname);
}

module.exports = {
  APPROVED_UAT_SUPABASE_PROJECT_REF,
  APPROVED_UAT_SUPABASE_URL,
  assertSafeUatEnvironment,
  collectUnsafeUatEnvironmentIssues,
  isUatReadOnlyApiRequest,
  isUatFixtureApiRequest,
  isUatSupabaseApiRequest
};
