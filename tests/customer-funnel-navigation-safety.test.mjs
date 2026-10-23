import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');

function between(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, 'Missing source boundary: ' + start);
  return source.slice(from, to);
}

const navigation = between(app, 'function setupNavigationEvents()', 'function setCallbackBootstrapHold');
const goToStep = between(app, 'async function goToStep(step)', 'function configureFooterNavigation()');
const stepViews = between(app, 'async function renderStepViews()', '// Navigate to step');
const step4 = between(app, 'async function renderStep4()', 'function buildDesignConfigurationCode()');
const checkout = between(app, 'async function handleStripeCheckout()', 'function renderBraceletShowcaseCard()');
const authoritative = between(server, 'async function buildAuthoritativeStripeOrder', 'function verifyStripeWebhookSignature');
const stripeCreate = between(server, 'async function createStripeCheckoutSession', 'async function getStripeCheckoutSession');
const stripeRoute = between(server, 'if (pathname === "/api/stripe/checkout-session" && method === "POST")', 'if (pathname === "/api/stripe/checkout-session" && method === "GET")');
const webhook = between(server, 'async function applyStripeCheckoutPaymentEvent', 'function getCatalogItemDisplayName');
const checkoutIdentityHelpers = between(server, 'function normalizeStripeCheckoutAttemptId', 'function getEnvValue');
const checkoutIdentity = vm.runInNewContext(`(() => {
  ${checkoutIdentityHelpers}
  return { normalizeStripeCheckoutAttemptId, resolveStripeCheckoutAttemptId, getStripeCheckoutOrderId };
})()`, { crypto });

test('1. Step 2 to 3 still commits visibility before async catalog rendering', () => {
  const atomic = between(app, 'async function renderStep2ToStep3Atomically()', '// Stepper bar rendering logic');
  assert.ok(atomic.indexOf('syncActiveStepView()') < atomic.indexOf('await renderStepViews'));
});

test('2. a complete Step 3 design reaches Step 4', () => {
  assert.ok(navigation.indexOf('if (!validationState.isFull)') < navigation.indexOf('await goToStep(4)'));
});

test('3. an incomplete Step 3 design exits before transition starts', () => {
  assert.match(navigation, /if \(!validationState\.isFull\) \{[\s\S]*?return;[\s\S]*?step3ToStep4TransitionInProgress = true/);
});

test('4. rapid Step 3 taps share one transition', () => {
  assert.ok(navigation.indexOf('step3ToStep4TransitionInProgress) return') < navigation.indexOf('step3ToStep4TransitionInProgress = true'));
  assert.ok(navigation.indexOf('step3ToStep4TransitionInProgress = true') < navigation.indexOf('await beginDeferredStep3AuthBoundary()'));
});

test('5. Step 4 display uses the canonical checkout summary total', () => {
  assert.match(step4, /rememberCheckoutSummary\(buildCheckoutSummary\(\)\)/);
  assert.match(step4, /priceTotal\.textContent = .*finalPrice/);
});

test('6. charm and spacer quantity builders remain in the order payload', () => {
  assert.match(app, /function buildSelectedCharmOrderData/);
  assert.match(app, /function buildSelectedSpacerOrderData/);
  assert.match(app, /stoneVariants: createStoneVariantPayload/);
});

test('7. Pay enters single flight before awaited work', () => {
  assert.ok(checkout.indexOf('if (stripeCheckoutInProgress) return') < checkout.indexOf('await requireLineLoginForCustomization()'));
  assert.ok(checkout.indexOf('stripeCheckoutInProgress = true') < checkout.indexOf("fetch('/api/stripe/checkout-session'"));
});

test('8. Pay provides immediate disabled and busy feedback', () => {
  assert.match(checkout, /checkoutButton\.disabled = true/);
  assert.match(checkout, /setAttribute\('aria-busy', 'true'\)/);
});

test('9. checkout failure releases the button for safe retry', () => {
  assert.match(checkout, /const releaseCheckout = \(\) =>/);
  assert.ok(checkout.lastIndexOf('releaseCheckout()') > checkout.indexOf('catch (error)'));
});

test('10. checkout request carries one bounded attempt identifier', () => {
  assert.match(checkout, /window\.crypto\.randomUUID\(\)/);
  assert.match(checkout, /checkoutAttemptId,\s*order: orderPayload/);
});

test('10a. old frontend checkout requests receive a valid unique server-side fallback identifier', () => {
  const first = checkoutIdentity.resolveStripeCheckoutAttemptId(undefined);
  const second = checkoutIdentity.resolveStripeCheckoutAttemptId(undefined);
  assert.match(first, /^[0-9a-f-]{36}$/i);
  assert.notEqual(first, second);
  assert.match(stripeRoute, /resolveStripeCheckoutAttemptId\(bodyObj\.checkoutAttemptId\)/);
});

test('10b. new frontend identifiers pass through unchanged', () => {
  const supplied = '12345678-1234-4234-8234-123456789abc';
  assert.equal(checkoutIdentity.resolveStripeCheckoutAttemptId(supplied), supplied);
});

test('10c. repeated new frontend identifiers retain one order and Stripe identity', () => {
  const supplied = '12345678-1234-4234-8234-123456789abc';
  assert.equal(checkoutIdentity.getStripeCheckoutOrderId(supplied), checkoutIdentity.getStripeCheckoutOrderId(supplied));
  assert.match(stripeRoute, /id: getStripeCheckoutOrderId\(checkoutAttemptId\)/);
  assert.match(stripeRoute, /idempotencyKey: checkoutAttemptId/);
});

test('10d. supplied malformed checkout attempt identifiers remain rejected', () => {
  assert.equal(checkoutIdentity.resolveStripeCheckoutAttemptId('bad'), '');
  assert.equal(checkoutIdentity.resolveStripeCheckoutAttemptId(null), '');
  assert.match(stripeRoute, /if \(!checkoutAttemptId\) \{\s*sendJson\(res, 400,/);
});

test('11. missing identifiers cannot reach the malformed-identifier rejection', () => {
  assert.ok(checkoutIdentity.resolveStripeCheckoutAttemptId(undefined));
});

test('12. Stripe receives the same idempotency key', () => {
  assert.match(stripeCreate, /"Idempotency-Key": idempotencyKey/);
  assert.match(stripeRoute, /idempotencyKey: checkoutAttemptId/);
});

test('13. deterministic attempts retain the ORD-six-digit format', () => {
  assert.match(server, /function getStripeCheckoutOrderId/);
  assert.match(server, /digest\.readUInt32BE\(0\) % 900000/);
});

test('14. backend remains authoritative for catalog prices and discounts', () => {
  assert.match(authoritative, /getAuthoritativeStoneVariant/);
  assert.match(authoritative, /readSettingsForApi/);
  assert.match(authoritative, /Price changed/);
});

test('15. Stripe session creation remains server-only', () => {
  assert.match(stripeCreate, /https:\/\/api\.stripe\.com\/v1\/checkout\/sessions/);
  assert.doesNotMatch(checkout, /api\.stripe\.com/);
});

test('16. backend stock validation precedes Stripe creation', () => {
  assert.ok(stripeRoute.indexOf('await validateOrderStockOrThrow') < stripeRoute.indexOf('await createStripeCheckoutSession'));
});

test('17. inventory deduction remains paid-webhook-only for Stripe', () => {
  assert.match(webhook, /await deductStockForOrder\(\{[\s\S]*?stripePaymentStatus: 'paid'/);
  assert.doesNotMatch(stripeRoute, /deductStockForOrder/);
});

test('18. Purchase analytics is not emitted by the Pay click', () => {
  assert.doesNotMatch(checkout, /Purchase|payment_success/);
  assert.match(webhook, /sendMetaPurchaseEvent/);
});

test('19. LINE notifications remain after authoritative paid confirmation', () => {
  assert.ok(webhook.indexOf('await saveOrderForApi(paidOrder)') < webhook.lastIndexOf('notifyPaidOrderLineRecipients'));
});

test('20. stale Step 4 authorization cannot overwrite later navigation', () => {
  assert.ok(goToStep.indexOf('State.currentStep !== previousStep') < goToStep.indexOf('State.currentStep = step'));
  assert.match(stepViews, /State\.currentStep !== requestedStep/);
});
