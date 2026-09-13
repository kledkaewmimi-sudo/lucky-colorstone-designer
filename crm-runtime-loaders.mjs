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

// The historical overview card labelled "Active Stones" counted stones that
// can currently be sold (in stock). Keep that legacy label/meaning while
// taking explicit database-column values over stale payload values.
export function getCrmStoneOverviewMetrics(stones = []) {
  const list = Array.isArray(stones) ? stones : [];
  const isInStock = (stone = {}) => {
    if (typeof stone.in_stock === 'boolean') return stone.in_stock;
    if (typeof stone.inStock === 'boolean') return stone.inStock;
    if (typeof stone.availability?.inStock === 'boolean') return stone.availability.inStock;
    return true;
  };
  return {
    activeStonesCount: list.filter(isInStock).length,
    outOfStockCount: list.filter((stone) => !isInStock(stone)).length
  };
}

export async function loadCrmOverviewWithFallback({ requestOverview, renderOverview, fallback, onFallback }) {
  try {
    const overview = await requestOverview();
    if (!isValidCrmOverview(overview)) throw new Error('Invalid CRM overview response.');
    await renderOverview(overview);
    return { source: 'compact', overview };
  } catch (error) {
    onFallback?.(error);
    await fallback(error);
    return { source: 'legacy' };
  }
}
