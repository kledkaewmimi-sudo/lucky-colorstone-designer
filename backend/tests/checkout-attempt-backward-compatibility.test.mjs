import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');

function between(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, 'Missing source boundary: ' + start);
  return source.slice(from, to);
}

const helpers = between(server, 'function normalizeStripeCheckoutAttemptId', 'function getEnvValue');
const identity = vm.runInNewContext(`(() => {
  ${helpers}
  return { resolveStripeCheckoutAttemptId, getStripeCheckoutOrderId };
})()`, { crypto });
const route = between(server, '    const checkoutAttemptId = resolveStripeCheckoutAttemptId', '    const sessionId = urlObj.searchParams.get');
const stripe = between(server, 'async function createStripeCheckoutSession', 'async function getStripeCheckoutSession');
const authoritative = between(server, 'async function buildAuthoritativeStripeOrder', 'function verifyStripeWebhookSignature');
const webhook = between(server, 'async function applyStripeCheckoutPaymentEvent', 'function getCatalogItemDisplayName');

test('old frontend omission receives a unique valid server attempt ID', () => {
  const first = identity.resolveStripeCheckoutAttemptId(undefined);
  const second = identity.resolveStripeCheckoutAttemptId(undefined);
  assert.match(first, /^[0-9a-f-]{36}$/i);
  assert.notEqual(first, second);
});

test('new frontend supplied attempt ID passes through unchanged', () => {
  const supplied = '12345678-1234-4234-8234-123456789abc';
  assert.equal(identity.resolveStripeCheckoutAttemptId(supplied), supplied);
});

test('same supplied attempt retains one order and Stripe identity', () => {
  const supplied = '12345678-1234-4234-8234-123456789abc';
  assert.equal(identity.getStripeCheckoutOrderId(supplied), identity.getStripeCheckoutOrderId(supplied));
  assert.match(route, /id: getStripeCheckoutOrderId\(checkoutAttemptId\)/);
  assert.match(route, /idempotencyKey: checkoutAttemptId/);
  assert.match(stripe, /Idempotency-Key.: idempotencyKey/);
});

test('malformed supplied attempt ID is rejected safely', () => {
  assert.equal(identity.resolveStripeCheckoutAttemptId('bad'), '');
  assert.equal(identity.resolveStripeCheckoutAttemptId(null), '');
  assert.match(route, /if \(!checkoutAttemptId\) \{\s*sendJson\(res, 400,/);
});

test('pricing and stock authority still precede Stripe', () => {
  assert.match(authoritative, /validateAuthoritativeOrder/);
  assert.match(authoritative, /readSettingsForApi/);
  assert.ok(route.indexOf('await validateOrderStockOrThrow') < route.indexOf('await createStripeCheckoutSession'));
});

test('paid webhook remains the inventory and notification authority', () => {
  assert.match(webhook, /await deductStockForOrder/);
  assert.match(webhook, /notifyPaidOrderLineRecipients/);
  assert.doesNotMatch(route, /deductStockForOrder|notifyPaidOrderLineRecipients/);
});
