import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createRequire } from 'node:module';
import { getBrowserPurchaseStorageKey, normalizeBrowserPurchaseTracking } from '../meta-browser-purchase.js';
const require = createRequire(import.meta.url);
const { buildMetaPurchaseEvent } = require('../meta-capi-purchase.js');

test('unpaid responses cannot create a browser Purchase and refresh key is deterministic', () => {
  assert.equal(normalizeBrowserPurchaseTracking({ paid: false }), null);
  assert.deepEqual(normalizeBrowserPurchaseTracking({ paid: true, event_id: 'stripe_checkout_cs', value: 1290, currency: 'THB' }), { eventId: 'stripe_checkout_cs', value: 1290, currency: 'THB' });
  assert.equal(getBrowserPurchaseStorageKey('stripe_checkout_cs'), getBrowserPurchaseStorageKey('stripe_checkout_cs'));
});

test('browser and CAPI Purchase contract has the same ID, value and currency', () => {
  const capi = buildMetaPurchaseEvent({ order: { id: 'o', stripeCheckoutSessionId: 'cs', metaAttribution: null }, stripeSession: {}, totalPrice: 1290, currency: 'THB', eventTime: Date.UTC(2026, 8, 1), fallbackEventSourceUrl: 'https://customize.luckycolorstone.com/' });
  const browser = normalizeBrowserPurchaseTracking({ paid: true, event_id: capi.event_id, value: capi.custom_data.value, currency: capi.custom_data.currency });
  assert.equal(browser.eventId, capi.event_id); assert.equal(browser.value, capi.custom_data.value); assert.equal(browser.currency, capi.custom_data.currency);
});

test('server endpoint is minimal and browser uses Pixel eventID only after it', async () => {
  const [server, app] = await Promise.all([readFile(new URL('../server.js', import.meta.url), 'utf8'), readFile(new URL('../app.js', import.meta.url), 'utf8')]);
  const endpoint = server.slice(server.indexOf('if (pathname === "/api/stripe/purchase-tracking"'), server.indexOf('if (pathname === "/api/storage/status"'));
  assert.match(endpoint, /\{ paid: true, event_id: eventId, value, currency: 'THB' \}/);
  assert.match(endpoint, /Cache-Control', 'private, no-store'/);
  assert.doesNotMatch(endpoint, /customerEmail|phoneNumber|shipping|metadata|\border\s*:/);
  assert.match(app, /trackMetaEvent\('Purchase',[\s\S]*?\{ eventID: purchase\.eventId \}\)/);
});
