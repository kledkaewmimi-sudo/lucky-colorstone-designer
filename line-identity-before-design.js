// Pure landing identity gate. It deliberately establishes identity before any
// bracelet design exists, so it never creates or restores a design handoff.
export function isInitialLineIdentityCallback(search = '') {
  const params = new URLSearchParams(search);
  if (params.get('line_auth') === 'identity') return true;

  // LIFF can return the original redirect query inside `liff.state` rather
  // than restoring it as a top-level query parameter. This is only a resume
  // marker; the caller still requires a verified LIFF profile before Step 1.
  const liffState = params.get('liff.state');
  if (!liffState) return false;
  const nestedParams = new URLSearchParams(liffState.startsWith('?') ? liffState.slice(1) : liffState);
  return nestedParams.get('line_auth') === 'identity';
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
