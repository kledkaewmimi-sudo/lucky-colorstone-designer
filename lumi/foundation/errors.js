export const LUMI_ERROR_CODES = Object.freeze({
  DISABLED: 'LUMI_DISABLED', CONTRACT_INVALID: 'LUMI_CONTRACT_INVALID',
  CONTRACT_VERSION_UNSUPPORTED: 'LUMI_CONTRACT_VERSION_UNSUPPORTED',
  WRIST_CONTEXT_MISMATCH: 'LUMI_WRIST_CONTEXT_MISMATCH', BEAD_CONTEXT_MISMATCH: 'LUMI_BEAD_CONTEXT_MISMATCH',
  MATERIAL_NOT_FOUND: 'LUMI_MATERIAL_NOT_FOUND', MATERIAL_INACTIVE: 'LUMI_MATERIAL_INACTIVE',
  SIZE_UNSUPPORTED: 'LUMI_SIZE_UNSUPPORTED', CHARM_LIMIT_EXCEEDED: 'LUMI_CHARM_LIMIT_EXCEEDED',
  DESIGN_UNREPRESENTABLE: 'LUMI_DESIGN_UNREPRESENTABLE', FIT_INVALID: 'LUMI_FIT_INVALID'
});
export class LumiFoundationError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = 'LumiFoundationError'; this.code = code; this.details = details; }
}
export function lumiError(code, message, details) { return new LumiFoundationError(code, message, details); }
