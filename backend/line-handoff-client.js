// Side-effect-free client contract for the pre-LINE server handoff.
// Reasons are deliberately non-sensitive and safe for production diagnostics.
export async function createLineAuthHandoffRequest({
  fetchImpl = globalThis.fetch,
  url = '/api/auth-handoffs',
  payload
} = {}) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch {
    return { ok: false, reason: 'HANDOFF_POST_NETWORK_FAILED' };
  }

  let result;
  try {
    result = await response.json();
  } catch {
    return { ok: false, reason: response.ok ? 'HANDOFF_RESPONSE_INVALID' : 'HANDOFF_POST_HTTP_FAILED', status: response.status };
  }
  if (!response.ok) return { ok: false, reason: 'HANDOFF_POST_HTTP_FAILED', status: response.status };
  if (!result || typeof result.token !== 'string' || !result.token) {
    return { ok: false, reason: 'HANDOFF_TOKEN_MISSING', status: response.status };
  }
  return { ok: true, token: result.token, expiresAt: result.expiresAt };
}
