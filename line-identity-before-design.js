// Pure landing identity gate. It deliberately establishes identity before any
// bracelet design exists, so it never creates or restores a design handoff.
export function isInitialLineIdentityCallback(search = '') {
  let candidate = String(search || '');
  for (let depth = 0; depth < 4 && candidate; depth += 1) {
    const query = candidate.includes('?') ? candidate.slice(candidate.indexOf('?') + 1) : candidate.replace(/^\?/, '');
    const params = new URLSearchParams(query);
    if (params.get('line_auth') === 'identity') return true;
    const nested = params.get('liff.state');
    if (!nested) return false;
    candidate = nested;
  }
  return false;
}

export async function establishLineIdentityBeforeDesign({
  hasCanonicalIdentity = () => false,
  isLiffLoggedIn = () => false,
  synchronizeProfile = async () => ({ ok: false, reason: 'PROFILE_SYNC_FAILED' }),
  startLogin = async () => ({ started: false, reason: 'LOGIN_START_FAILED' })
} = {}) {
  if (hasCanonicalIdentity()) return { ok: true, state: 'identity_ready' };

  if (isLiffLoggedIn()) {
    const synchronized = await synchronizeProfile();
    return synchronized?.ok
      ? { ok: true, state: 'profile_synchronized' }
      : { ok: false, state: 'profile_sync_failed', reason: synchronized?.reason || 'PROFILE_SYNC_FAILED' };
  }

  const login = await startLogin();
  if (login?.started === true) return { ok: false, state: 'login_redirect_started' };
  return { ok: false, state: 'login_start_failed', reason: login?.reason || 'LOGIN_START_FAILED' };
}
