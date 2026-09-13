import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');

function between(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Missing source boundary: ${start}`);
  return source.slice(from, to);
}

const catalogRefresh = between(app, 'function refreshCustomerCatalog(', 'function requestCustomerCatalogRefresh(');
const requestRefresh = between(app, 'function requestCustomerCatalogRefresh(', 'function startCustomerCatalogWarmup()');
const warmup = between(app, 'function startCustomerCatalogWarmup()', 'function refreshCustomerCatalogForStep3Entry()');
const visibility = between(app, 'function bindCustomerCatalogRefreshEvents()', 'function createAnalyticsSessionId()');
const goToStep = between(app, 'async function goToStep(step)', 'function configureFooterNavigation()');
const stripeRoute = between(server, 'if (pathname === "/api/stripe/checkout-session" && method === "POST")', 'if (pathname === "/api/stripe/checkout-session" && method === "GET")');
const authoritative = between(server, 'async function buildAuthoritativeStripeOrder', 'function verifyStripeWebhookSignature');
const webhook = between(server, 'async function applyStripeCheckoutPaymentEvent', 'function getCatalogItemDisplayName');

test('1. catalog refresh has no periodic three-second interval', () => {
  assert.doesNotMatch(app, /startCatalogRefreshPollingAfterWarmup|catalogRefreshPollingTimer/);
  assert.doesNotMatch(catalogRefresh, /setInterval/);
});

test('2. initial warmup still includes catalog, settings, and layout data', () => {
  assert.match(warmup, /refreshCustomerCatalog\(\{ includeLayoutOrder: true \}\)/);
  assert.match(catalogRefresh, /refreshCatalog\(\)/);
  assert.match(catalogRefresh, /refreshCharmCatalog\(\)/);
  assert.match(catalogRefresh, /refreshCustomerSpacerCatalog\(\)/);
  assert.match(catalogRefresh, /refreshCatalogLayoutOrder\(\), getSharedSettings\(\)/);
});

test('3. Step 3 entry requests one non-blocking refresh after the visible render', () => {
  assert.match(goToStep, /if \(step === 3 && previousStep !== 3\) refreshCustomerCatalogForStep3Entry\(\);/);
  assert.ok(goToStep.indexOf('refreshCustomerCatalogForStep3Entry()') > goToStep.indexOf('await renderStep2ToStep3Atomically()'));
});

test('4. repeated renders do not own a Step 3 refresh trigger', () => {
  const renderApp = between(app, 'async function renderApp()', 'async function renderStep2ToStep3Atomically()');
  assert.doesNotMatch(renderApp, /refreshCustomerCatalogForStep3Entry/);
});

test('5. visibility resume refreshes only visible active customer states', () => {
  assert.match(visibility, /document\.visibilityState !== 'visible'/);
  assert.match(visibility, /State\.currentStep < 3 \|\| State\.currentStep > 4/);
  assert.match(visibility, /requestCustomerCatalogRefresh\(\{ renderStep3AfterRefresh: State\.currentStep === 3 \}\)/);
});

test('6. one shared in-flight promise collapses overlapping refreshes and clears on failure', () => {
  assert.match(catalogRefresh, /if \(customerCatalogRefreshPromise\) return customerCatalogRefreshPromise/);
  assert.match(catalogRefresh, /pending\.finally\(\(\) => \{\s*customerCatalogRefreshPromise = null;/);
  assert.match(requestRefresh, /if \(customerCatalogRefreshPromise\) return customerCatalogRefreshPromise/);
});

test('7. resume events are debounced and refresh does not reset design state', () => {
  assert.match(requestRefresh, /CUSTOMER_CATALOG_RESUME_DEBOUNCE_MS/);
  assert.match(catalogRefresh, /if \(renderStep3AfterRefresh && State\.currentStep === 3\) renderStep3\(\)/);
  assert.doesNotMatch(catalogRefresh, /State\.selectedStones\s*=|resetStep3DesignState|State\.wristSize\s*=/);
});

test('8. analytics heartbeat remains a distinct sixty-second interval', () => {
  assert.match(app, /analyticsHeartbeatTimer = window\.setInterval\([\s\S]*?ANALYTICS_HEARTBEAT_MS/);
  assert.match(app, /const ANALYTICS_HEARTBEAT_MS = 60000/);
});

test('9. checkout remains authoritative for current price, settings, and stock', () => {
  assert.match(authoritative, /readStockCatalogMapsForOrder\(\)/);
  assert.match(authoritative, /readSettingsForApi\(\)/);
  assert.match(authoritative, /Price changed/);
  assert.ok(stripeRoute.indexOf('await validateOrderStockOrThrow') < stripeRoute.indexOf('await createStripeCheckoutSession'));
});

test('10. inventory, LINE, and Meta paid authority remain webhook-only', () => {
  assert.match(webhook, /await deductStockForOrder\(\{[\s\S]*?stripePaymentStatus: 'paid'/);
  assert.match(webhook, /sendMetaPurchaseEvent/);
  assert.ok(webhook.indexOf('await saveOrderForApi(paidOrder)') < webhook.lastIndexOf('notifyPaidOrderLineRecipients'));
});