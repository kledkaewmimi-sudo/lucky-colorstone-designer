const SENSITIVE_QUERY_PARAMS = new Set([
  'handoff',
  'code',
  'state',
  'liff.state',
  'access_token',
  'id_token',
  'refresh_token',
  'token',
  'authorization'
]);

function redactSensitiveUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || ''), 'https://uat.customize.luckycolorstone.com');
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (SENSITIVE_QUERY_PARAMS.has(key.toLowerCase())) {
        parsed.searchParams.set(key, '[REDACTED]');
      }
    }
    return parsed.toString().replace(
      /\/api\/auth-handoffs\/[A-Za-z0-9_-]{43}/g,
      '/api/auth-handoffs/[REDACTED]'
    );
  } catch {
    return String(rawUrl || '')
      .replace(/\/api\/auth-handoffs\/[A-Za-z0-9_-]{43}/g, '/api/auth-handoffs/[REDACTED]')
      .replace(
        /([?&](?:handoff|code|state|access_token|id_token|refresh_token|token|authorization)=)[^&#\s]*/gi,
        '$1[REDACTED]'
      );
  }
}

module.exports = { SENSITIVE_QUERY_PARAMS, redactSensitiveUrl };
