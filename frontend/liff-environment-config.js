export const UAT_LIFF_ENV_VARIABLE = 'UAT_LIFF_ID';

export function resolveLiffEnvironmentConfig({ environment, liffId } = {}) {
  const normalizedId = String(liffId || '').trim();
  if (environment === 'uat') {
    return normalizedId
      ? { ok: true, liffId: normalizedId, reason: '' }
      : { ok: false, liffId: '', reason: 'UAT_LIFF_CONFIG_MISSING' };
  }
  return normalizedId
    ? { ok: true, liffId: normalizedId, reason: '' }
    : { ok: false, liffId: '', reason: 'LIFF_CONFIG_MISSING' };
}
