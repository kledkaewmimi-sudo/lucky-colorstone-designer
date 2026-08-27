export function invokeInitialLineAuthentication({
  method = 'LIFF_LOGIN',
  isInClient = false,
  liffInitialized = false,
  liff = null,
  liffId = '',
  redirectUri = '',
  persistIntent = () => true,
  navigate = () => {}
} = {}) {
  const intentPersisted = persistIntent() !== false;

  if (isInClient) {
    return { started: false, method: 'NONE', invocation: 'NOT_AVAILABLE', intentPersisted, reason: 'F05E3_LIFF_CLIENT_SESSION_UNAVAILABLE' };
  }

  if (method === 'LIFF_LOGIN') {
    if (!liffInitialized || typeof liff?.login !== 'function') {
      return { started: false, method: 'LIFF_LOGIN', invocation: 'NOT_AVAILABLE', intentPersisted, reason: 'F05E1_LIFF_LOGIN_NOT_AVAILABLE' };
    }
    try {
      liff.login({ redirectUri });
      return { started: true, method: 'LIFF_LOGIN', invocation: 'STARTED', intentPersisted, reason: '' };
    } catch (error) {
      return { started: false, method: 'LIFF_LOGIN', invocation: 'THREW', intentPersisted, reason: 'F05E2_LIFF_LOGIN_THROWN', error };
    }
  }

  const entryUrl = String(liffId || '').trim() ? `https://liff.line.me/${String(liffId).trim()}` : '';
  if (!entryUrl) {
    return { started: false, method: 'LIFF_ENTRY', invocation: 'NOT_AVAILABLE', intentPersisted, reason: 'F05E4_LIFF_ENTRY_URL_MISSING' };
  }
  try {
    navigate(entryUrl);
    return { started: true, method: 'LIFF_ENTRY', invocation: 'STARTED', intentPersisted, reason: '' };
  } catch (error) {
    return { started: false, method: 'LIFF_ENTRY', invocation: 'THREW', intentPersisted, reason: 'F05E5_LIFF_ENTRY_THROWN', error };
  }
}
