function normalizeUatSupabaseKey(value) {
  return String(value || '').trim();
}

function isModernSupabaseSecretKey(value) {
  return normalizeUatSupabaseKey(value).startsWith('sb_secret_');
}

function describeUatSupabaseKey(value) {
  const raw = String(value || '');
  const key = normalizeUatSupabaseKey(raw);
  return {
    present: key.length > 0,
    type: isModernSupabaseSecretKey(key) ? 'SB_SECRET' : key.startsWith('eyJ') ? 'LEGACY_JWT' : 'UNKNOWN',
    hasLeadingOrTrailingWhitespace: raw !== key,
    length: key.length
  };
}

function buildUatSupabaseAuthHeaders(key) {
  const normalizedKey = normalizeUatSupabaseKey(key);
  const headers = { apikey: normalizedKey };
  // Modern sb_secret_* keys are opaque API keys, not JWTs. Supabase rejects
  // them when supplied as Authorization: Bearer. Legacy service_role JWTs
  // retain the Authorization header for compatibility.
  if (!isModernSupabaseSecretKey(normalizedKey)) headers.Authorization = `Bearer ${normalizedKey}`;
  return headers;
}

module.exports = { buildUatSupabaseAuthHeaders, describeUatSupabaseKey, isModernSupabaseSecretKey, normalizeUatSupabaseKey };
