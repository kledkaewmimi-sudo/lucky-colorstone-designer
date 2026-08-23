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

// The same wrapper is constructed once for production and can be constructed
// with an in-memory resolver by isolated Node tests. No app runtime path can
// replace the production resolver.
export function createInitialLineLoginGuard({
  resolveFeatureEnabled = resolveDeferredLineLoginFlag
} = {}) {
  return function shouldBypassInitialLineLoginForGuard(context = {}) {
    return shouldBypassInitialLineLogin({
      ...context,
      featureEnabled: resolveFeatureEnabled() === true
    });
  };
}

// This is the only entry used by app.js. Its resolver has no runtime user input
// path and therefore remains false in production.
export const shouldBypassInitialLineLoginInProduction = createInitialLineLoginGuard();
