import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildCopyReadyShippingLabel } from '../crm-order-details.js';
import { paginateCrmOrders, resolveCrmOrderShippingInfo, toCrmOrderSummary, toCrmOverviewOrderSummary } from '../crm-order-read-model.js';

const RECIPIENT = '\u0E2A\u0E21\u0E0A\u0E32\u0E22 \u0E17\u0E14\u0E2A\u0E2D\u0E1A';
const ADDRESS = '1/1 \u0E16.\u0E17\u0E14\u0E2A\u0E2D\u0E1A';
const PROVINCE = '\u0E01\u0E23\u0E38\u0E07\u0E40\u0E17\u0E1E\u0E21\u0E2B\u0E32\u0E19\u0E04\u0E23';

const paidOrder = (id, shippingInfo) => ({
  id,
  date: '2026-10-10T00:00:00.000Z',
  status: 'Payment Received',
  stripePaymentStatus: 'paid',
  customerName: 'QA Customer ' + id,
  totalPrice: 480,
  braceletPreviewImage: 'data:image/webp;base64,fixture',
  shippingInfo
});

test('the paginated CRM order list carries the shipping presentation of each order', () => {
  const first = paidOrder('QA-1', { recipientName: RECIPIENT, phoneNumber: '0800000001', addressLine: ADDRESS, province: PROVINCE, postalCode: '10900' });
  const second = paidOrder('QA-2', { recipientName: RECIPIENT + ' \u0E2A\u0E2D\u0E07', phoneNumber: '0800000002', addressLine: ADDRESS, province: '\u0E0A\u0E25\u0E1A\u0E38\u0E23\u0E35', postalCode: '20150' });
  const page = paginateCrmOrders([first, second], 1, 20);

  assert.equal(page.orders.length, 2);
  for (const summary of page.orders) {
    assert.equal(summary.shippingInfo.recipientName, summary.id === 'QA-2' ? second.shippingInfo.recipientName : RECIPIENT);
    assert.equal(summary.shippingInfo.postalCode, summary.id === 'QA-2' ? '20150' : '10900');
    assert.equal(summary.shippingInfo.addressLine, ADDRESS);
    assert.deepEqual(buildCopyReadyShippingLabel(summary.shippingInfo).split('\n'), [
      summary.shippingInfo.recipientName,
      `${ADDRESS} ${summary.shippingInfo.province} ${summary.shippingInfo.postalCode}`,
      summary.shippingInfo.phoneNumber
    ]);
  }
  assert.notEqual(page.orders[0].shippingInfo.recipientName, page.orders[1].shippingInfo.recipientName);
  assert.notEqual(buildCopyReadyShippingLabel(page.orders[0].shippingInfo), buildCopyReadyShippingLabel(page.orders[1].shippingInfo));
});

test('legacy top-level address fields are still read, and the overview stays free of them', () => {
  const legacy = { id: 'QA-3', recipientName: RECIPIENT, phoneNumber: '0800000003', addressLine: ADDRESS, province: PROVINCE, postalCode: '10900' };
  assert.deepEqual(resolveCrmOrderShippingInfo(legacy), {
    recipientName: RECIPIENT,
    phoneNumber: '0800000003',
    addressLine: ADDRESS,
    province: PROVINCE,
    postalCode: '10900'
  });
  assert.deepEqual(resolveCrmOrderShippingInfo({}).recipientName, '');

  const summary = toCrmOrderSummary(paidOrder('QA-4', legacy));
  assert.equal(summary.shippingInfo.recipientName, RECIPIENT);
  const overview = toCrmOverviewOrderSummary(paidOrder('QA-4', legacy));
  assert.equal('shippingInfo' in overview, false, 'the overview list must not carry customer addresses');
  assert.equal('braceletPreviewImage' in overview, false);
});

test('the order card renders the shipping section between pricing and cost and copies its own order', async () => {
  const [crmSource, htmlSource, cssSource] = await Promise.all([
    readFile(new URL('../crm.js', import.meta.url), 'utf8'),
    readFile(new URL('../crm.html', import.meta.url), 'utf8'),
    readFile(new URL('../crm.css', import.meta.url), 'utf8')
  ]);
  // Scope the check to the order card template: the inventory table also renders a Cost cell.
  const cardStart = crmSource.indexOf('tr.innerHTML = `\n      <td data-label="Order ID">');
  const cardEnd = crmSource.indexOf('<td data-label="Invoice"', cardStart);
  assert.ok(cardStart > 0 && cardEnd > cardStart, 'the order card template must be found');
  const card = crmSource.slice(cardStart, cardEnd);
  const pricing = card.indexOf('<td data-label="Pricing">');
  const shipping = card.indexOf('<td data-label="Shipping Information"');
  const cost = card.indexOf('<td data-label="Cost">');
  assert.ok(pricing > 0 && shipping > pricing && cost > shipping, 'card columns must read pricing -> shipping -> cost');

  assert.match(crmSource, /const cardShippingInfo = getOrderShippingInfo\(order\);/);
  assert.match(crmSource, /const cardShippingLabel = buildCopyReadyShippingLabel\(cardShippingInfo\);/);
  assert.match(crmSource, /cardCopyShippingButton\?\.addEventListener\('click', \(\) => copyOrderShippingLabel\(cardShippingLabel\)\);/);
  assert.match(crmSource, /const shippingInfoText = renderOrderCardShipping\(cardShippingInfo\);/);
  assert.match(crmSource, /renderCopyReadyShippingLabel\(shippingInfo\)/);
  assert.match(crmSource, /<td data-label="Shipping Information" data-order-id="\$\{escapeHtml\(order\.id\)\}">/);
  // A list payload without the shipping fields is completed from the detail endpoint, bounded to the
  // rendered page and never blocking the list render.
  assert.match(crmSource, /if \(missingShippingOrderIds\.length > 0\) void hydrateOrderCardShipping\(missingShippingOrderIds\);/);
  assert.match(crmSource, /if \(shippingInfoNeedsFallback\) missingShippingOrderIds\.push\(order\.id\);/);
  assert.match(crmSource, /const isOrderCardShippingMissing = \(shippingInfo = \{\}\) => !\(/);
  assert.match(htmlSource, /<th width="320">Visual Bead Sequence Map \(Artisan Layout\)<\/th>\s*<th>Price Summary<\/th>\s*<th>Shipping Information<\/th>\s*<th>COST<\/th>/);
  assert.match(cssSource, /\.order-card-shipping \{/);
  assert.match(cssSource, /\.crm-table td\[data-label="Shipping Information"\],/);
  assert.match(cssSource, /\.crm-table td\[data-label="Shipping Information"\]::before,/);
});

test('the server projection selects the shipping fields for the authenticated CRM list', async () => {
  const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(server, /recipientName:payload->>recipientName,phoneNumber:payload->>phoneNumber,addressLine:payload->>addressLine,province:payload->>province,postalCode:payload->>postalCode,shippingInfo:payload->shippingInfo/);
  assert.match(server, /recipientName: row\.shippingInfo\?\.recipientName \?\? row\.recipientName \?\? ''/);
});
