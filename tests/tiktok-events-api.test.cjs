const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const test = require('node:test');
const { buildTikTokCompletePaymentEvent, buildTikTokEventsRequest, hashEmail, hashE164Phone, summarizeTikTokEventsApiResponse } = require('../tiktok-events-api.js');

test('CompletePayment uses a deterministic ID, authoritative THB value, and genuine matching data', () => {
  const event = buildTikTokCompletePaymentEvent({
    order: { stripeCheckoutSessionId: 'cs_paid_123', analyticsVisitorId: 'visitor-123', tiktokAttribution: { firstTouch: { landingUrl: 'https://customize.luckycolorstone.com/?ttclid=real', tiktok: { ttclid: 'real', ttp: 'ttp-value' } } } },
    stripeSession: { customer_details: { email: 'Buyer@example.com', phone: '+66 81 234 5678' } },
    totalPrice: 1290,
    currency: 'THB',
    eventTime: Date.UTC(2026, 8, 1),
    fallbackEventSourceUrl: 'https://customize.luckycolorstone.com/'
  });
  assert.equal(event.event_id, 'stripe_checkout_cs_paid_123');
  assert.deepEqual(event.properties.currency, 'THB');
  assert.equal(event.properties.value, 1290);
  assert.equal(event.user.ttclid, 'real');
  assert.equal(event.user.ttp, 'ttp-value');
  assert.deepEqual(event.user.email, [crypto.createHash('sha256').update('buyer@example.com').digest('hex')]);
});

test('test code is optional and response observability is non-sensitive', () => {
  const event = { event: 'CompletePayment' };
  assert.deepEqual(buildTikTokEventsRequest({ pixelId: 'pixel_12345', event }), { event_source: 'web', event_source_id: 'pixel_12345', data: [event] });
  assert.equal(buildTikTokEventsRequest({ pixelId: 'pixel_12345', event, testEventCode: 'test-code' }).test_event_code, 'test-code');
  assert.deepEqual(summarizeTikTokEventsApiResponse('{"code":0,"request_id":"opaque"}'), { code: 0, requestIdPresent: true });
  assert.deepEqual(summarizeTikTokEventsApiResponse('invalid'), { code: null, requestIdPresent: false });
  assert.equal(hashEmail('Buyer@example.com'), crypto.createHash('sha256').update('buyer@example.com').digest('hex'));
  assert.equal(hashE164Phone('0812345678'), null);
});

test('server exposes only the public Pixel ID and isolates paid delivery', () => {
  const source = fs.readFileSync('server.js', 'utf8');
  const route = source.slice(source.indexOf("if (pathname === '/api/tracking/config'"), source.indexOf('if (pathname === "/api/stripe/webhook"'));
  assert.match(route, /tiktokPixelId: getEnvValue\('TIKTOK_PIXEL_ID'\)\.trim\(\)/);
  assert.doesNotMatch(route, /ACCESS_TOKEN|TEST_EVENT_CODE|accessToken|testEventCode/);
  assert.match(source, /await saveOrderForApi\(paidOrder\);[\s\S]*?sendTikTokCompletePaymentEvent\(paidOrder, session\)\.catch/);
  assert.match(source, /\[tiktok-events-api\] CompletePayment delivery failed for order=\$\{orderReference\}/);
});
