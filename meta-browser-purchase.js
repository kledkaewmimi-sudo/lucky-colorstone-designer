export function normalizeBrowserPurchaseTracking(payload) {
  const eventId = String(payload?.event_id || '').trim();
  const value = Number(payload?.value);
  const currency = String(payload?.currency || '').trim().toUpperCase();
  if (payload?.paid !== true || !eventId || !Number.isFinite(value) || value < 0 || currency !== 'THB') return null;
  return { eventId, value, currency };
}

export function getBrowserPurchaseStorageKey(eventId) {
  return `lucky_meta_purchase_sent_${encodeURIComponent(String(eventId || ''))}`;
}
