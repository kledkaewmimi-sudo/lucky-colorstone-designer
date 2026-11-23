const assert = require('node:assert/strict');
const test = require('node:test');
const {
  normalizeOrderStatus,
  validateOrderWorkflowUpdate,
  confirmedOrderMatchesUpdate
} = require('../order-workflow.js');
const { toCrmOrderSummary, toCrmOverviewOrderSummary } = require('../crm-order-read-model.js');

const paidOrder = {
  id: 'ORD-WORKFLOW-1',
  status: 'Payment Received',
  stripePaymentStatus: 'paid',
  lineUserId: 'U_TEST'
};

test('accepts Paid to Shipped with a carrier and tracking number', () => {
  const result = validateOrderWorkflowUpdate(paidOrder, {
    status: 'Shipped',
    shippingCarrier: 'Kerry',
    trackingNumber: 'KERRY123'
  });
  assert.equal(result.ok, true);
  assert.equal(result.nextStatus, 'Shipped');
});

test('requires carrier, custom carrier, and tracking for Shipped', () => {
  assert.equal(validateOrderWorkflowUpdate(paidOrder, { status: 'Shipped', trackingNumber: 'TRACK1' }).status, 400);
  assert.equal(validateOrderWorkflowUpdate(paidOrder, { status: 'Shipped', shippingCarrier: 'Other' }).status, 400);
  assert.equal(validateOrderWorkflowUpdate(paidOrder, { status: 'Shipped', shippingCarrier: 'Kerry' }).status, 400);
  assert.equal(validateOrderWorkflowUpdate(paidOrder, {
    status: 'Shipped',
    shippingCarrier: 'Other',
    shippingCarrierCustom: 'Local Courier',
    trackingNumber: 'TRACK1'
  }).ok, true);
});

test('rejects unknown statuses and backward transitions', () => {
  assert.equal(validateOrderWorkflowUpdate(paidOrder, { status: 'Delivered' }).status, 400);
  assert.equal(validateOrderWorkflowUpdate({ ...paidOrder, status: 'Shipped' }, {
    status: 'Payment Received',
    shippingCarrier: 'Kerry',
    trackingNumber: 'TRACK1'
  }).status, 409);
  assert.equal(validateOrderWorkflowUpdate({ ...paidOrder, status: 'Completed' }, { status: 'Shipped' }).status, 409);
});

test('normalizes only supported workflow statuses', () => {
  assert.equal(normalizeOrderStatus(' Shipped '), 'Shipped');
  assert.equal(normalizeOrderStatus('delivered'), '');
});

test('confirmation compares authoritative persisted fields', () => {
  const update = { status: 'Shipped', shippingCarrier: 'Kerry', trackingNumber: 'TRACK1' };
  assert.equal(confirmedOrderMatchesUpdate({ ...paidOrder, ...update }, update), true);
  assert.equal(confirmedOrderMatchesUpdate({ ...paidOrder, ...update, trackingNumber: 'OLD' }, update), false);
});

test('CRM list projection retains confirmed carrier and tracking fields', () => {
  const summary = toCrmOrderSummary({
    ...paidOrder,
    status: 'Shipped',
    shippingCarrier: 'Other',
    shippingCarrierCustom: 'Local Courier',
    trackingNumber: 'CUSTOM123',
    trackingUrl: 'https://tracking.example/CUSTOM123'
  });
  assert.equal(summary.status, 'Shipped');
  assert.equal(summary.shippingCarrier, 'Other');
  assert.equal(summary.shippingCarrierCustom, 'Local Courier');
  assert.equal(summary.trackingNumber, 'CUSTOM123');
  assert.equal(summary.trackingUrl, 'https://tracking.example/CUSTOM123');
});

test('CRM overview projection omits shipping and tracking fields', () => {
  const overview = toCrmOverviewOrderSummary({
    ...paidOrder,
    status: 'Shipped',
    shippingCarrier: 'Kerry',
    trackingNumber: 'TRACK1'
  });
  assert.equal('shippingCarrier' in overview, false);
  assert.equal('trackingNumber' in overview, false);
});
