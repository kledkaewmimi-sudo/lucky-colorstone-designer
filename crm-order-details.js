// Order-detail helpers stay independent from the CRM DOM so their privacy-safe
// formatting and preview selection can be regression-tested directly.
export function getOrderFinalBraceletPreviewImage(order = {}) {
  const candidates = [
    order.braceletPreviewImage,
    order.braceletPreviewDataUrl,
    order.braceletPreviewSnapshot,
    order.checkoutSummary?.braceletPreviewImage,
    order.checkoutSummary?.braceletPreviewDataUrl,
    order.checkoutSummary?.braceletPreviewSnapshot
  ];
  return candidates.find((value) => typeof value === 'string' && value.startsWith('data:image/')) || '';
}

// CRM detail responses may be returned directly or under an `order` key by a
// compatible backend. Normalize only the transport shape; stored snapshots
// and the selected-order preview remain untouched.
export function normalizeCrmOrderDetailResponse(response = {}) {
  const order = response?.order && typeof response.order === 'object'
    ? response.order
    : response;
  if (!order || typeof order !== 'object') return null;

  const normalized = { ...order };
  const preview = getOrderFinalBraceletPreviewImage(order);
  if (!normalized.braceletPreviewImage && preview) normalized.braceletPreviewImage = preview;
  return normalized;
}

export function buildCopyReadyShippingLabel(shippingInfo = {}) {
  const recipientName = String(shippingInfo.recipientName || '').trim();
  const addressLine = String(shippingInfo.addressLine || '').trim();
  const province = String(shippingInfo.province || '').trim();
  const postalCode = String(shippingInfo.postalCode || '').trim();
  const phoneNumber = String(shippingInfo.phoneNumber || '').trim();
  const fullAddress = [addressLine, province, postalCode].filter(Boolean).join(' ');

  // Always preserve the three-line shipping-label contract, even when a legacy
  // order has an incomplete address.
  return [recipientName, fullAddress, phoneNumber].join('\n');
}
