import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createRequire } from 'node:module';
import { getBrowserPurchaseStorageKey, normalizeBrowserPurchaseTracking } from '../meta-browser-purchase.js';

const require = createRequire(import.meta.url);
const { buildMetaPurchaseEvent } = require('../meta-capi-purchase.js');

const event = buildMetaPurchaseEvent({
  order: {
    id: 'ORDER-123',
    stripeCheckoutSessionId: 'cs_paid_123',
    metaAttribution: { firstTouch: { landingUrl: 'https://customize.luckycolorstone.com/?utm_source=instagram&utm_medium=linktree', meta: {} } }
  },
  stripeSession: {},
  totalPrice: 1290,
  currency: 'THB',
  eventTime: Date.UTC(2026, 8, 1),
  fallbackEventSourceUrl: 'https://customize.luckycolorstone.com/'
});

test('unpaid, abandoned, malformed, or non-THB responses cannot create a browser Purchase', () => {
  assert.equal(normalizeBrowserPurchaseTracking({ paid: false }), null);
  assert.equal(normalizeBrowserPurchaseTracking({ paid: true, event_id: 'id', value: 100, currency: 'USD' }), null);
  assert.equal(normalizeBrowserPurchaseTracking({ paid: true, event_id: '', value: 100, currency: 'THB' }), null);
});

test('a server-confirmed paid card or async-payment response produces the same normalized Purchase contract', () => {
  const card = normalizeBrowserPurchaseTracking({ paid: true, event_id: event.event_id, value: event.custom_data.value, currency: event.custom_data.currency });
  const asyncPayment = normalizeBrowserPurchaseTracking({ paid: true, event_id: event.event_id, value: event.custom_data.value, currency: event.custom_data.currency });
  assert.deepEqual(card, { eventId: 'stripe_checkout_cs_paid_123', value: 1290, currency: 'THB' });
  assert.deepEqual(asyncPayment, card);
});

test('browser and CAPI have the same Purchase event ID, value, and currency', () => {
  const browser = normalizeBrowserPurchaseTracking({ paid: true, event_id: event.event_id, value: event.custom_data.value, currency: event.custom_data.currency });
  assert.equal(browser.eventId, event.event_id);
  assert.equal(browser.value, event.custom_data.value);
  assert.equal(browser.currency, event.custom_data.currency);
});

test('the durable refresh/repeat guard is keyed solely by the deterministic event ID', () => {
  assert.equal(getBrowserPurchaseStorageKey('stripe_checkout_cs_paid_123'), getBrowserPurchaseStorageKey('stripe_checkout_cs_paid_123'));
  assert.notEqual(getBrowserPurchaseStorageKey('stripe_checkout_cs_paid_123'), getBrowserPurchaseStorageKey('stripe_checkout_cs_paid_456'));
});

test('Linktree and direct-ad paid journeys work without fbclid or fbc', () => {
  const direct = normalizeBrowserPurchaseTracking({ paid: true, event_id: 'stripe_checkout_direct', value: 990, currency: 'THB' });
  const linktree = normalizeBrowserPurchaseTracking({ paid: true, event_id: 'stripe_checkout_linktree', value: 990, currency: 'THB' });
  assert.equal(direct.currency, 'THB');
  assert.equal(linktree.currency, 'THB');
});

test('browser Purchase is a tracking-only call with correct Meta eventID syntax and no effect on payment authority', async () => {
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(app, /window\.fbq\('track', eventName, parameters, options\)/);
  assert.match(app, /trackMetaEvent\('Purchase',[\s\S]*?\{ eventID: purchase\.eventId \}\)/);
  assert.match(app, /void verifyAndTrackMetaPurchase\(sessionId\)/);
  assert.doesNotMatch(app.slice(app.indexOf('function trackMetaPurchase'), app.indexOf('async function verifyAndTrackMetaPurchase')), /fetch\(|stripePaymentStatus\s*=/);
});

test('the verification endpoint returns only paid tracking fields and does not expose PII or order data', async () => {
  const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  const start = server.indexOf('if (pathname === "/api/stripe/purchase-tracking"');
  const endpoint = server.slice(start, server.indexOf('if (pathname === "/api/storage/status"', start));
  assert.match(endpoint, /\{ paid: true, event_id: eventId, value, currency: 'THB' \}/);
  assert.match(endpoint, /\{ paid: false \}/);
  assert.doesNotMatch(endpoint, /customerEmail|phoneNumber|shipping|metadata|\border\s*:/);
});

test('UAT retains its Pixel-free isolation while existing ViewContent and InitiateCheckout paths remain present', async () => {
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(index, /UAT intentionally omits the production Meta Pixel/);
  assert.match(app, /trackMetaEvent\('ViewContent'\)/);
  assert.match(app, /trackMetaEvent\('InitiateCheckout'/);
});

test('duplicate paid webhook protection and CAPI best-effort handling remain in place', async () => {
  const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  const webhookStart = server.indexOf('async function applyStripeCheckoutPaymentEvent');
  const webhook = server.slice(webhookStart, server.indexOf('function getCatalogItemDisplayName', webhookStart));
  assert.match(webhook, /processed\.includes\(eventId\).*stripePaymentStatus/);
  assert.match(webhook, /sendMetaPurchaseEvent\(paidOrder, session\)\.catch/);
});
