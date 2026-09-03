const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const {
  buildMetaPurchaseEvent,
  buildMetaPurchaseUserData,
  getMetaPurchaseEventId,
  hashE164Phone,
  hashEmail,
  summarizeMetaCapiSuccessBody
} = require('../meta-capi-purchase.js');

const NOW = Date.UTC(2026, 8, 1, 10, 0, 0);
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function order(overrides = {}) {
  return {
    id: 'ORDER-immutable-123',
    stripeCheckoutSessionId: 'cs_test_paid_123',
    phoneNumber: '+66 81 234 5678',
    analyticsSource: { user_agent: 'Mozilla/5.0 customer browser' },
    metaAttribution: {
      firstTouch: {
        landingUrl: 'https://customize.luckycolorstone.com/?utm_source=facebook&fbclid=do-not-send-in-logs',
        meta: {
          fbp: 'fb.1.1725184800000.123456789',
          fbc: 'fb.1.1725184800000.RealClickId'
        }
      },
      lastTouch: { meta: {} }
    },
    ...overrides
  };
}

function stripeSession(overrides = {}) {
  return {
    customer_details: { email: ' Buyer@Example.COM ', phone: '+66 81 234 5678' },
    ...overrides
  };
}

function event(overrides = {}) {
  const { order: orderOverrides, stripeSession: stripeSessionOverrides, ...eventOverrides } = overrides;
  return buildMetaPurchaseEvent({
    order: order(orderOverrides),
    stripeSession: stripeSession(stripeSessionOverrides),
    totalPrice: 1290,
    currency: 'THB',
    eventTime: NOW,
    fallbackEventSourceUrl: 'https://customize.luckycolorstone.com/',
    ...eventOverrides
  });
}

test('paid order with fbp and fbc sends real cookies and hashed matching fields', () => {
  const payload = event();
  assert.equal(payload.event_name, 'Purchase');
  assert.equal(payload.user_data.fbp, 'fb.1.1725184800000.123456789');
  assert.equal(payload.user_data.fbc, 'fb.1.1725184800000.RealClickId');
  assert.deepEqual(payload.user_data.em, [sha256('buyer@example.com')]);
  assert.deepEqual(payload.user_data.ph, [sha256('+66812345678')]);
  assert.deepEqual(payload.user_data.external_id, [sha256('ORDER-immutable-123')]);
});

test('paid Linktree order without fbclid or fbc omits fbc without fabrication', () => {
  const payload = event({
    order: {
      metaAttribution: {
        firstTouch: { landingUrl: 'https://customize.luckycolorstone.com/?utm_source=instagram&utm_medium=linktree', meta: { fbp: 'fb.1.1725184800000.123456789' } },
        lastTouch: { meta: {} }
      }
    }
  });
  assert.equal(payload.user_data.fbp, 'fb.1.1725184800000.123456789');
  assert.equal(Object.hasOwn(payload.user_data, 'fbc'), false);
});

test('paid order with fbp only remains valid', () => {
  const payload = event({ order: { metaAttribution: { firstTouch: { meta: { fbp: 'fb.1.1725184800000.123456789' } }, lastTouch: { meta: {} } } } });
  assert.equal(payload.user_data.fbp, 'fb.1.1725184800000.123456789');
  assert.equal(Object.hasOwn(payload.user_data, 'fbc'), false);
});

test('no Meta identifiers omits them and does not invent them', () => {
  const payload = event({ order: { metaAttribution: null } });
  assert.equal(Object.hasOwn(payload.user_data, 'fbp'), false);
  assert.equal(Object.hasOwn(payload.user_data, 'fbc'), false);
});

test('email and explicitly international phone values are normalized and SHA-256 hashed', () => {
  assert.equal(hashEmail(' Buyer@Example.COM '), sha256('buyer@example.com'));
  assert.equal(hashE164Phone('+66 (81) 234-5678'), sha256('+66812345678'));
});

test('ambiguous phone and unavailable PII are omitted', () => {
  const userData = buildMetaPurchaseUserData({
    order: order({ phoneNumber: '0812345678', analyticsSource: {} }),
    stripeSession: stripeSession({ customer_details: {} })
  });
  assert.equal(Object.hasOwn(userData, 'em'), false);
  assert.equal(Object.hasOwn(userData, 'ph'), false);
  assert.equal(Object.hasOwn(userData, 'client_user_agent'), false);
});

test('event ID is deterministic and duplicated webhook deliveries reuse it', () => {
  const paidOrder = order();
  assert.equal(getMetaPurchaseEventId(paidOrder), 'stripe_checkout_cs_test_paid_123');
  assert.equal(event({ order: paidOrder }).event_id, event({ order: paidOrder }).event_id);
});

test('authoritative value and THB currency are represented in major currency units', () => {
  const payload = event({ totalPrice: 1290.5 });
  assert.deepEqual(payload.custom_data, { currency: 'THB', value: 1290.5 });
  assert.equal(payload.event_source_url, 'https://customize.luckycolorstone.com/');
});

test('only a persisted Lucky Colorstone website URL is used as event source URL', () => {
  const payload = event({ order: { metaAttribution: { firstTouch: { landingUrl: 'https://linktr.ee/example', meta: {} } } } });
  assert.equal(payload.event_source_url, 'https://customize.luckycolorstone.com/');
});

test('server keeps CAPI after paid persistence, passes the Stripe session, and bounds the request', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'server.js'), 'utf8');
  const webhookStart = source.indexOf('async function applyStripeCheckoutPaymentEvent');
  const webhook = source.slice(webhookStart, source.indexOf('function getCatalogItemDisplayName', webhookStart));
  assert.ok(webhook.indexOf('await saveOrderForApi(paidOrder)') < webhook.indexOf('sendMetaPurchaseEvent(paidOrder, session)'));
  assert.match(source, /setTimeout\(\(\) => timeout\.abort\(\), 8000\)/);
  assert.match(webhook, /sendMetaPurchaseEvent\(paidOrder, session\)\.catch/);
});

test('both Stripe paid event types retain the single authoritative webhook path', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'server.js'), 'utf8');
  assert.match(source, /\['checkout\.session\.completed', 'checkout\.session\.async_payment_succeeded'\]/);
  assert.match(source, /event\.data\?\.object\?\.payment_status === 'paid'/);
});

test('CAPI success response observability retains only delivery metadata', () => {
  assert.deepEqual(
    summarizeMetaCapiSuccessBody('{"events_received":1,"fbtrace_id":"safe-to-omit"}'),
    { eventsReceived: 1, fbtraceIdPresent: true }
  );
  assert.deepEqual(summarizeMetaCapiSuccessBody('not json'), { eventsReceived: null, fbtraceIdPresent: false });
});

test('CAPI logs only safe attempt, accepted, and failure metadata', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'server.js'), 'utf8');
  const capiStart = source.indexOf('async function sendMetaPurchaseEvent');
  const capi = source.slice(capiStart, source.indexOf('function getLineChannelAccessToken', capiStart));
  assert.match(capi, /\[meta-capi\] Purchase attempt order=\$\{orderReference\}/);
  assert.match(capi, /\[meta-capi\] Purchase accepted order=\$\{orderReference\} events_received=\$\{delivery\.eventsReceived \?\? 'unknown'\} fbtrace_id_present=\$\{delivery\.fbtraceIdPresent\} http_status=\$\{response\.status\}/);
  assert.match(source, /\[meta-capi\] Purchase delivery failed for order=\$\{orderReference\}/);
  assert.match(capi, /summarizeMetaCapiSuccessBody\(await response\.text\(\)\)/);
  const metaLogs = source.split(/\r?\n/).filter((line) => line.includes('[meta-capi]')).join('\n');
  assert.doesNotMatch(metaLogs, /(fbclid|_fbp|_fbc|customer_details|email|phone|access_token|META_CONVERSIONS_API_ACCESS_TOKEN|user_data|event_id|custom_data)/i);
});
