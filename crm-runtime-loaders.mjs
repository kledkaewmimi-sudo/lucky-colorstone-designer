export function createCrmSettingsLoader(loadSettings) {
  let cachedValue;
  let hasCachedValue = false;
  let inFlight = null;

  const load = () => {
    if (hasCachedValue) return cachedValue;
    if (inFlight) return inFlight;

    inFlight = Promise.resolve()
      .then(loadSettings)
      .then((value) => {
        cachedValue = value;
        hasCachedValue = true;
        return value;
      })
      .finally(() => {
        inFlight = null;
      });

    return inFlight;
  };

  load.clear = () => {
    cachedValue = undefined;
    hasCachedValue = false;
  };

  return load;
}

export function isValidCrmOverview(overview) {
  return Number.isFinite(Number(overview?.paidOrderCount))
    && Number.isFinite(Number(overview?.revenue))
    && Array.isArray(overview?.recentOrders);
}

export async function loadCrmOverviewWithFallback({ requestOverview, renderOverview, fallback, onFallback }) {
  try {
    const overview = await requestOverview();
    if (!isValidCrmOverview(overview)) throw new Error('Invalid CRM overview response.');
    renderOverview(overview);
    return { source: 'compact', overview };
  } catch (error) {
    onFallback?.(error);
    await fallback(error);
    return { source: 'legacy' };
  }
}
