const ORDER_STATUS_SEQUENCE = Object.freeze([
  'New Order',
  'Stone Selection Photo Sent',
  'Payment Received',
  'Shipped',
  'Completed'
]);

function normalizeOrderStatus(value) {
  const status = String(value || '').trim();
  return ORDER_STATUS_SEQUENCE.includes(status) ? status : '';
}

function getOrderTrackingNumber(order = {}) {
  return String(
    order?.trackingNumber ||
    order?.trackingNo ||
    order?.shippingTrackingNumber ||
    order?.shipmentTrackingNumber ||
    ''
  ).trim();
}

function getOrderShippingCarrier(order = {}) {
  const carrier = String(order?.shippingCarrier || '').trim();
  const custom = String(order?.shippingCarrierCustom || '').trim();
  return carrier === 'Other' ? custom : carrier;
}

function validateOrderWorkflowUpdate(previousOrder = {}, updates = {}) {
  const previousStatus = normalizeOrderStatus(previousOrder?.status) || String(previousOrder?.status || '').trim();
  const nextStatus = normalizeOrderStatus(updates?.status);
  if (!nextStatus) return { ok: false, status: 400, error: 'Invalid order status.' };

  const previousIndex = ORDER_STATUS_SEQUENCE.indexOf(previousStatus);
  const nextIndex = ORDER_STATUS_SEQUENCE.indexOf(nextStatus);
  if (previousIndex >= 0 && nextIndex < previousIndex) {
    return { ok: false, status: 409, error: `Order cannot move backward from ${previousStatus} to ${nextStatus}.` };
  }
  if (nextStatus === 'Shipped' && !['Payment Received', 'Shipped'].includes(previousStatus)) {
    return { ok: false, status: 409, error: 'Only a paid order can be marked Shipped.' };
  }

  const proposed = { ...previousOrder };
  if (Object.prototype.hasOwnProperty.call(updates, 'trackingNumber')) proposed.trackingNumber = String(updates.trackingNumber || '').trim();
  if (Object.prototype.hasOwnProperty.call(updates, 'shippingCarrier')) proposed.shippingCarrier = String(updates.shippingCarrier || '').trim();
  if (Object.prototype.hasOwnProperty.call(updates, 'shippingCarrierCustom')) proposed.shippingCarrierCustom = String(updates.shippingCarrierCustom || '').trim();

  if (nextStatus === 'Shipped') {
    const carrier = getOrderShippingCarrier(proposed);
    const trackingNumber = getOrderTrackingNumber(proposed);
    if (!carrier) return { ok: false, status: 400, error: 'A shipping carrier is required before marking an order Shipped.' };
    if (proposed.shippingCarrier === 'Other' && !String(proposed.shippingCarrierCustom || '').trim()) {
      return { ok: false, status: 400, error: 'A custom shipping carrier name is required.' };
    }
    if (!trackingNumber) return { ok: false, status: 400, error: 'A tracking number is required before marking an order Shipped.' };
    if (trackingNumber.length > 120) return { ok: false, status: 400, error: 'Tracking number is too long.' };
  }

  return { ok: true, previousStatus, nextStatus };
}

function confirmedOrderMatchesUpdate(order = {}, updates = {}) {
  const expectedStatus = normalizeOrderStatus(updates?.status);
  if (!order || !expectedStatus || normalizeOrderStatus(order.status) !== expectedStatus) return false;
  if (Object.prototype.hasOwnProperty.call(updates, 'trackingNumber') && getOrderTrackingNumber(order) !== String(updates.trackingNumber || '').trim()) return false;
  if (Object.prototype.hasOwnProperty.call(updates, 'shippingCarrier') && String(order.shippingCarrier || '').trim() !== String(updates.shippingCarrier || '').trim()) return false;
  if (Object.prototype.hasOwnProperty.call(updates, 'shippingCarrierCustom') && String(order.shippingCarrier === 'Other' ? order.shippingCarrierCustom || '' : '').trim() !== String(updates.shippingCarrier === 'Other' ? updates.shippingCarrierCustom || '' : '').trim()) return false;
  return true;
}

module.exports = {
  ORDER_STATUS_SEQUENCE,
  normalizeOrderStatus,
  validateOrderWorkflowUpdate,
  confirmedOrderMatchesUpdate
};
