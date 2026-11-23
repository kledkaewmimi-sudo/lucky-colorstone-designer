import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');

function between(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, 'Missing source boundary: ' + start);
  return source.slice(from, to);
}

const atomic = between(app, 'async function renderStep2ToStep3Atomically', '// Stepper bar rendering logic');
const views = between(app, 'async function renderStepViews', '// Navigate to step');
const goToStep = between(app, 'async function goToStep', 'function configureFooterNavigation');
const navigation = between(app, 'function setupNavigationEvents', 'function setCallbackBootstrapHold');
const step4 = between(app, 'async function renderStep4', 'function buildDesignConfigurationCode');
const checkout = between(app, 'async function handleStripeCheckout', 'function renderBraceletShowcaseCard');

test('Step 2 commits visible Step 3 before catalog rendering', () => {
  assert.ok(atomic.indexOf('syncActiveStepView()') < atomic.indexOf('await renderStepViews'));
  assert.match(atomic, /requestAnimationFrame/);
});

test('rapid Step 2 taps share one transition', () => {
  assert.ok(navigation.indexOf('if (step2ToStep3TransitionInProgress) return') < navigation.indexOf('step2ToStep3TransitionInProgress = true'));
});

test('Step 3 completeness rejects before transition lock', () => {
  assert.ok(navigation.indexOf('if (!validationState.isFull)') < navigation.indexOf('step3ToStep4TransitionInProgress = true'));
});

test('rapid Step 3 taps share one transition and no fresh catalog await blocks it', () => {
  assert.ok(navigation.indexOf('step3ToStep4TransitionInProgress) return') < navigation.indexOf('step3ToStep4TransitionInProgress = true'));
  assert.doesNotMatch(navigation, /validateCurrentDesignStockWithLatestCatalog/);
});

test('Step 4 authorization is reused only during the authorized render', () => {
  assert.match(views, /!step4AuthorizationInProgress/);
  assert.match(step4, /!step4AuthorizationInProgress/);
  assert.match(goToStep, /finally[\s\S]*step4AuthorizationInProgress = false/);
});

test('stale authorization cannot overwrite later navigation', () => {
  assert.ok(goToStep.indexOf('State.currentStep !== previousStep') < goToStep.indexOf('State.currentStep = step'));
  assert.match(views, /State\.currentStep !== requestedStep/);
});

test('Pay locks before awaited work and triple clicks share one request', () => {
  assert.ok(checkout.indexOf('if (stripeCheckoutInProgress) return') < checkout.indexOf('await requireLineLoginForCustomization'));
  assert.ok(checkout.indexOf('stripeCheckoutInProgress = true') < checkout.indexOf('fetch(\'/api/stripe/checkout-session\''));
  assert.match(checkout, /setAttribute\('aria-busy', 'true'\)/);
});

test('Pay relies on backend stock authority and sends checkoutAttemptId', () => {
  assert.doesNotMatch(checkout, /validateCurrentDesignStockWithLatestCatalog/);
  assert.match(checkout, /window\.crypto\.randomUUID\(\)/);
  assert.match(checkout, /checkoutAttemptId,\s*order: orderPayload/);
});

test('checkout failure releases the button for safe retry', () => {
  assert.match(checkout, /const releaseCheckout = \(\) =>/);
  assert.ok(checkout.lastIndexOf('releaseCheckout()') > checkout.indexOf('catch (error)'));
});

test('existing analytics Meta and TikTok checkout semantics remain', () => {
  assert.match(checkout, /trackCheckoutStarted\(payload\.id\)/);
  assert.match(checkout, /trackMetaInitiateCheckout\(payload\.id/);
  assert.match(checkout, /trackTikTokInitiateCheckout\(payload\.id/);
  assert.doesNotMatch(checkout, /Purchase|CompletePayment/);
});
