import { resolveDeferredLineLoginFlag, shouldDeferInitialLineLogin } from './line-redirect-restore.js';

// Pure adapter for the existing pre-Step-1 guard. Tests can pass a feature value
// directly; application code uses the production wrapper below instead.
export function shouldBypassInitialLineLogin({
  featureEnabled = false,
  requiresLineLogin = false,
  isAuthenticated = false,
  isCustomization = false
} = {}) {
  return shouldDeferInitialLineLogin({
    featureEnabled,
    requiresLineLogin,
    isAuthenticated,
    isCustomization
  });
}

// This is the only entry used by app.js. Its feature value has no runtime user
// input path and therefore remains false in production.
export function shouldBypassInitialLineLoginInProduction(context = {}) {
  return shouldBypassInitialLineLogin({
    ...context,
    featureEnabled: resolveDeferredLineLoginFlag()
  });
}
