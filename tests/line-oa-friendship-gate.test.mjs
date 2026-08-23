import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('deferred callback requires LINE OA friendship before consuming a handoff', async () => {
  const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const restoreStart = source.indexOf('async function restoreDeferredLineCallbackBeforeReset');
  const restoreEnd = source.indexOf('function persistLandingDismissed', restoreStart);
  const restore = source.slice(restoreStart, restoreEnd);
  assert.ok(restore.indexOf('const canEnterStep4 = await canEnterOperationalStep4') >= 0);
  assert.ok(restore.indexOf("reason: 'line_oa_friendship_required'") >= 0);
  assert.ok(restore.indexOf('const canEnterStep4 = await canEnterOperationalStep4') < restore.indexOf('runDormantV2CallbackRestore'));
  assert.match(source, /liff\.getFriendship\(\)/);
});

test('friendship gate uses the official LINE destination instead of a custom website modal', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /lineOaFriendshipModal|btnLineOaAddFriend|btnLineOaRecheck/);
  assert.match(source, /fetch\('\/api\/line-oa-add-friend'/);
  assert.match(source, /window\.location\.assign\(addFriendUrl\)/);
  assert.match(source, /liff\.requestFriendship\(\)/);
});

test('server resolves the direct OA add-friend destination from the configured Messaging API bot', async () => {
  const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(server, /https:\/\/api\.line\.me\/v2\/bot\/info/);
  assert.match(server, /https:\/\/line\.me\/R\/ti\/p\//);
  assert.match(server, /pathname === '\/api\/line-oa-add-friend' && method === 'GET'/);
});

test('buyer notification logs delivery outcome without logging LINE identity or credentials', async () => {
  const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  const start = server.indexOf('async function trySendPaidOrderLineNotification');
  const end = server.indexOf('async function trySendShippedLineNotification', start);
  const buyer = server.slice(start, end);
  assert.match(buyer, /\[buyer-line-notify\] attempted order=/);
  assert.match(buyer, /\[buyer-line-notify\] success order=/);
  assert.match(buyer, /\[buyer-line-notify\] failure order=.*category=/);
  assert.doesNotMatch(buyer, /lineUserId|LINE_CHANNEL_ACCESS_TOKEN/);
});

test('every mobile operational Step 4 entry uses the centralized friendship guard', async () => {
  const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const gateStart = source.indexOf('async function canEnterOperationalStep4');
  const gateEnd = source.indexOf('async function resumeLineOaFriendshipAfterReturn()', gateStart);
  const gate = source.slice(gateStart, gateEnd);
  const navigationStart = source.indexOf('async function goToStep(step)');
  const navigationEnd = source.indexOf('// Stepper bar rendering logic', navigationStart);
  const navigation = source.slice(navigationStart, navigationEnd);
  const renderStart = source.indexOf('async function renderStepViews()');
  const renderEnd = source.indexOf('// Navigate to step', renderStart);
  const render = source.slice(renderStart, renderEnd);
  const checkoutStart = source.indexOf('async function handleStripeCheckout()');
  const checkoutEnd = source.indexOf('async function submitOrderToCRM', checkoutStart);
  const checkout = source.slice(checkoutStart, checkoutEnd);
  const step4Start = source.indexOf('async function renderStep4()');
  const step4End = source.indexOf('function renderStep4PriceSummary', step4Start);
  const step4 = source.slice(step4Start, step4End);

  assert.match(gate, /if \(!isLineIdentityAvailable\(\)\) return false/);
  assert.match(gate, /const friendship = await getLineOaFriendshipStatus\(\)/);
  assert.match(gate, /if \(friendship\.friendFlag\) return true/);
  assert.match(gate, /lineOaFriendshipStep4ResumePending = queueStep3Resume && State\.currentStep === 3/);
  assert.match(gate, /await openLineOaAddFriendExperience\(\)/);
  assert.ok(navigation.indexOf('await canEnterOperationalStep4') < navigation.indexOf('State.currentStep = step'));
  assert.match(render, /State\.currentStep === 4 && requiresLineOaFriendshipForOperationalStep4\(\)/);
  assert.match(render, /State\.currentStep = 3/);
  assert.match(step4, /const canEnterStep4 = await canEnterOperationalStep4\(\)/);
  assert.ok(checkout.indexOf('await canEnterOperationalStep4') < checkout.indexOf("fetch('/api/stripe/checkout-session'"));
});

test('friendship recheck resumes the authenticated Step 4 continuation only after a true friendship result', async () => {
  const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const start = source.indexOf('async function recheckLineOaFriendshipAndResume()');
  const end = source.indexOf('async function canEnterOperationalStep4', start);
  const recheck = source.slice(start, end);

  assert.ok(recheck.indexOf('if (!friendship.friendFlag)') < recheck.indexOf('if (lineOaFriendshipStep4ResumePending)'));
  assert.match(recheck, /if \(!isLineIdentityAvailable\(\) \|\| State\.currentStep !== 3\)/);
  assert.match(recheck, /lineOaFriendshipStep4ResumePending = false/);
  assert.match(recheck, /await goToStep\(4\)/);
});

test('return from the direct LINE screen restores the canonical design and rechecks friendship before Step 4', async () => {
  const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const start = source.indexOf('async function resumeLineOaFriendshipAfterReturn()');
  const end = source.indexOf('function persistCustomizationLoginIntent', start);
  const resume = source.slice(start, end);
  assert.match(resume, /restoreGuestDesignSnapshot\(\)/);
  assert.match(resume, /const friendship = await getLineOaFriendshipStatus\(\)/);
  assert.match(resume, /if \(!friendship\.friendFlag \|\| State\.currentStep !== 3\) return false/);
  assert.match(resume, /State\.currentStep = 4/);
});

test('deferred callback uses the centralized guard before handoff consume and opens the real add-friend route for non-friends', async () => {
  const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const start = source.indexOf('async function restoreDeferredLineCallbackBeforeReset');
  const end = source.indexOf('function persistLandingDismissed', start);
  const restore = source.slice(start, end);
  assert.ok(restore.indexOf('await canEnterOperationalStep4') < restore.indexOf('runDormantV2CallbackRestore'));
  assert.match(restore, /openAddFriend: true/);
});
