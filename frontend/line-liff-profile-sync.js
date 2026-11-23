export async function syncLiffProfileIdentity({ isLoggedIn, getProfile, applyIdentity } = {}) {
  if (typeof isLoggedIn !== 'function' || isLoggedIn() !== true) {
    return { ok: false, reason: 'LIFF_PROFILE_SESSION_UNAVAILABLE' };
  }

  try {
    const profile = await getProfile();
    const lineUserId = String(profile?.userId || '').trim();
    if (!lineUserId) return { ok: false, reason: 'LIFF_PROFILE_MISSING_USER_ID' };
    if (typeof applyIdentity !== 'function' || applyIdentity({ lineUserId, displayName: String(profile?.displayName || '').trim() }) !== true) {
      return { ok: false, reason: 'LIFF_PROFILE_STATE_ID_MISSING' };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: 'LIFF_PROFILE_GET_THROW' };
  }
}
