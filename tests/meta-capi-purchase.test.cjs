const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const { buildMetaPurchaseEvent, hashEmail, hashE164Phone, summarizeMetaCapiSuccessBody } = require('../meta-capi-purchase.js');
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');

function build() {
  return buildMetaPurchaseEvent({
    order: { id: 'ORDER-123', stripeCheckoutSessionId: 'cs_paid_123', analyticsSource: { user_agent: 'Customer UA' }, metaAttribution: { firstTouch: { landingUrl: 'https://customize.luckycolorstone.com/?fbclid=x', meta: { fbp: 'fb.1.1725184800000.123', fbc: 'fb.1.1725184800000.click' } } } },
    stripeSession: { customer_details: { email: 'Buyer@example.com', phone: '+66 81 234 5678' } }, totalPrice: 1290, currency: 'THB', eventTime: Date.UTC(2026, 8, 1), fallbackEventSourceUrl: 'https://customize.luckycolorstone.com/'
  });
}

test('CAPI uses deterministic identity, authoritative value/currency, and only real matching data', () => {
  const event = build();
  assert.equal(event.event_id, 'stripe_checkout_cs_paid_123');
  assert.deepEqual(event.custom_data, { currency: 'THB', value: 1290 });
  assert.equal(event.user_data.fbp, 'fb.1.1725184800000.123');
  assert.equal(event.user_data.fbc, 'fb.1.1725184800000.click');
  assert.deepEqual(event.user_data.em, [sha('buyer@example.com')]);
  assert.deepEqual(event.user_data.ph, [sha('+66812345678')]);
});

test('email/phone normalize safely and ambiguous phone is omitted', () => {
  assert.equal(hashEmail('Buyer@example.com'), sha('buyer@example.com'));
  assert.equal(hashE164Phone('+66 (81) 234-5678'), sha('+66812345678'));
  assert.equal(hashE164Phone('0812345678'), null);
});

test('CAPI success observability retains only delivery metadata', () => {
  assert.deepEqual(summarizeMetaCapiSuccessBody('{"events_received":1,"fbtrace_id":"not-logged"}'), { eventsReceived: 1, fbtraceIdPresent: true });
  assert.deepEqual(summarizeMetaCapiSuccessBody('not json'), { eventsReceived: null, fbtraceIdPresent: false });
});

test('CAPI logs only safe attempt, accepted, and failure metadata', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'server.js'), 'utf8');
  assert.match(source, /\[meta-capi\] Purchase attempt order=\$\{orderReference\}/);
  assert.match(source, /\[meta-capi\] Purchase accepted order=\$\{orderReference\} events_received=\$\{delivery\.eventsReceived \?\? 'unknown'\} fbtrace_id_present=\$\{delivery\.fbtraceIdPresent\} http_status=\$\{response\.status\}/);
  assert.match(source, /\[meta-capi\] Purchase delivery failed for order=\$\{orderReference\}/);
  const metaLogs = source.split(/\r?\n/).filter((line) => line.includes('[meta-capi]')).join('\n');
  assert.doesNotMatch(metaLogs, /(fbclid|_fbp|_fbc|customer_details|email|phone|access_token|META_CONVERSIONS_API_ACCESS_TOKEN|user_data|event_id|custom_data)/i);
});
