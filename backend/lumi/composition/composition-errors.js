import { LumiFoundationError } from '../foundation/errors.js';
export const LUMI_COMPOSITION_ERROR_CODES = Object.freeze({
  INVALID_INPUT:'LUMI_COMPOSITION_INVALID_INPUT', VERSION_UNSUPPORTED:'LUMI_COMPOSITION_VERSION_UNSUPPORTED',
  NO_PRIMARY:'LUMI_COMPOSITION_NO_PRIMARY', NO_SECONDARY:'LUMI_COMPOSITION_NO_SECONDARY',
  NO_FILLER:'LUMI_COMPOSITION_NO_FILLER', NO_CHARM:'LUMI_COMPOSITION_NO_CHARM',
  NO_VALID_CANDIDATE:'LUMI_COMPOSITION_NO_VALID_CANDIDATE', ROLE_INVALID:'LUMI_COMPOSITION_ROLE_INVALID'
});
export class LumiCompositionError extends LumiFoundationError {
  constructor(code, message, details = {}) { super(code, message, details); this.name = 'LumiCompositionError'; }
}
export const compositionError = (code, message, details) => new LumiCompositionError(code, message, details);
