function isModernSupabaseSecretKey(value) {
  return typeof value === 'string' && value.startsWith('sb_secret_');
}

function buildUatSupabaseAuthHeaders(key) {
  const headers = { apikey: key };
  // Modern sb_secret_* keys are opaque API keys, not JWTs. Supabase rejects
  // them when supplied as Authorization: Bearer. Legacy service_role JWTs
  // retain the Authorization header for compatibility.
  if (!isModernSupabaseSecretKey(key)) headers.Authorization = `Bearer ${key}`;
  return headers;
}

module.exports = { buildUatSupabaseAuthHeaders, isModernSupabaseSecretKey };
