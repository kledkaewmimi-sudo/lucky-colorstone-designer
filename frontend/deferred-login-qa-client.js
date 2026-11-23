const QA_PROBE_COOKIE = 'lucky_deferred_login_qa_probe';
const QA_ACTIVATION_FRAGMENT_PREFIX = '#deferred-login-qa=';

function hasQaProbeCookie(cookieText = '') {
  return String(cookieText || '')
    .split(';')
    .map((part) => part.trim())
    .includes(`${QA_PROBE_COOKIE}=1`);
}

// The probe is never trusted as an enablement signal. It only avoids an
// unnecessary request for normal visitors; the server validates its HttpOnly
// opaque session cookie before returning enabled: true.
export async function getValidatedDeferredLoginQaState({
  cookieText = typeof document === 'undefined' ? '' : document.cookie,
  fetchImpl = typeof fetch === 'undefined' ? null : fetch
} = {}) {
  if (!hasQaProbeCookie(cookieText) || typeof fetchImpl !== 'function') {
    return { enabled: false };
  }

  try {
    const response = await fetchImpl('/api/deferred-login-qa-sessions/current', {
      credentials: 'same-origin'
    });
    const result = await response.json().catch(() => null);
    return response.ok && result?.enabled === true && Number(result.expiresAt) > Date.now()
      ? { enabled: true, expiresAt: Number(result.expiresAt) }
      : { enabled: false };
  } catch {
    return { enabled: false };
  }
}

function getQaActivationToken(hash = '') {
  const value = String(hash || '');
  const token = value.startsWith(QA_ACTIVATION_FRAGMENT_PREFIX)
    ? value.slice(QA_ACTIVATION_FRAGMENT_PREFIX.length)
    : '';
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : '';
}

// This is a private bootstrap transport, not a flag. The one-time opaque value
// stays in the URL fragment (so it is not sent as a request/referrer), is POSTed
// to the server for validation, then is removed immediately.
export async function activateDeferredLoginQaSessionFromFragment({
  hash = typeof location === 'undefined' ? '' : location.hash,
  fetchImpl = typeof fetch === 'undefined' ? null : fetch,
  clearFragment = () => {
    if (typeof history !== 'undefined' && typeof location !== 'undefined') {
      history.replaceState({}, document.title, `${location.pathname}${location.search}`);
    }
  }
} = {}) {
  const token = getQaActivationToken(hash);
  if (!token || typeof fetchImpl !== 'function') return { enabled: false, attempted: false };

  try {
    const response = await fetchImpl('/api/deferred-login-qa-sessions/activate', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    const result = await response.json().catch(() => null);
    clearFragment();
    return response.ok && result?.enabled === true && Number(result.expiresAt) > Date.now()
      ? { enabled: true, expiresAt: Number(result.expiresAt), attempted: true }
      : { enabled: false, attempted: true };
  } catch {
    clearFragment();
    return { enabled: false, attempted: true };
  }
}

export { QA_PROBE_COOKIE, QA_ACTIVATION_FRAGMENT_PREFIX, getQaActivationToken, hasQaProbeCookie };
