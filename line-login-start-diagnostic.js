export const LINE_LOGIN_START_DIAGNOSTICS = Object.freeze({
  ORDER_DETAIL_CONTEXT_BLOCK: Object.freeze({ code: 'F05E1', branch: 'ORDER_DETAIL_CONTEXT_BLOCK' }),
  LOGIN_ALREADY_IN_PROGRESS: Object.freeze({ code: 'F05E2', branch: 'LOGIN_ALREADY_IN_PROGRESS' }),
  LIFF_LOGGED_IN_BUT_APP_IDENTITY_MISSING: Object.freeze({ code: 'F05E3', branch: 'LIFF_LOGGED_IN_BUT_APP_IDENTITY_MISSING' }),
  LOGIN_STARTER_RETURNED_FALSE: Object.freeze({ code: 'F05E4', branch: 'LOGIN_STARTER_RETURNED_FALSE' }),
  LOGIN_STARTER_RETURNED_NULL_OR_UNDEFINED: Object.freeze({ code: 'F05E5', branch: 'LOGIN_STARTER_RETURNED_NULL_OR_UNDEFINED' }),
  LOGIN_STARTER_RETURNED_UNEXPECTED_OBJECT: Object.freeze({ code: 'F05E6', branch: 'LOGIN_STARTER_RETURNED_UNEXPECTED_OBJECT' }),
  UNKNOWN_PRELOGIN_CONTROL_BRANCH: Object.freeze({ code: 'F05E7', branch: 'UNKNOWN_PRELOGIN_CONTROL_BRANCH' })
});

export function classifyLineLoginStarterResult(result) {
  if (result === false) return 'LOGIN_STARTER_RETURNED_FALSE';
  if (result == null) return 'LOGIN_STARTER_RETURNED_NULL_OR_UNDEFINED';
  if (typeof result === 'object') return result.reason || 'LOGIN_STARTER_RETURNED_UNEXPECTED_OBJECT';
  return 'UNKNOWN_PRELOGIN_CONTROL_BRANCH';
}

export function getLineLoginStartDiagnostic(reason) {
  return LINE_LOGIN_START_DIAGNOSTICS[reason] || null;
}
