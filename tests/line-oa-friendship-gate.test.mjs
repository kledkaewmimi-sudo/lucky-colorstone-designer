import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('deferred callback requires LINE OA friendship before consuming a handoff', async () => {
  const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const restoreStart = source.indexOf('async function restoreDeferredLineCallbackBeforeReset');
  const restoreEnd = source.indexOf('function persistLandingDismissed', restoreStart);
  const restore = source.slice(restoreStart, restoreEnd);
  assert.ok(restore.indexOf('const canEnterStep4 = await canEnterOperationalStep4') >= 0);
  assert.match(restore, /line_oa_friendship_required/);
  assert.ok(restore.indexOf('runDormantV2CallbackRestore') < restore.indexOf('const canEnterStep4 = await canEnterOperationalStep4'));
  assert.match(source, /liff\.getFriendship\(\)/);
});

test('friendship gate uses LIFF native friendship first and keeps the OA URL as a last-resort fallback', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /lineOaFriendshipModal|btnLineOaAddFriend|btnLineOaRecheck/);
  const start = source.indexOf('async function openLineOaAddFriendExperience({ resumeIntent = null } = {})');
  const end = source.indexOf('async function recheckLineOaFriendshipAndResume()', start);
  const flow = source.slice(start, end);
  assert.ok(flow.indexOf('canUseNativeLineOaFriendshipPrompt()') < flow.indexOf("source: 'liff_entry'"));
  assert.match(source, /liff\.requestFriendship\(\)/);
  assert.ok(flow.indexOf('liff.requestFriendship()') < flow.indexOf("source: 'official_add_friend_url_fallback'"));
  assert.match(flow, /window\.location\.assign\(getLiffEntryUrl\(\{ resumeIntent \}\)\)/);
  assert.match(source, /fetch\('\/api\/line-oa-add-friend'/);
  assert.match(flow, /window\.location\.assign\(addFriendUrl\)/);
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
  assert.match(gate, /if \(friendship\.friendFlag\) \{\s*trackVerifiedLineOaConnection\(\);\s*return true;\s*\}/);
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
  assert.match(recheck, /setCallbackBootstrapHold\(true\)/);
  assert.match(recheck, /hideLineOaFriendshipTransition\(\)/);
  assert.ok(recheck.indexOf('await goToStep(4)') < recheck.indexOf('setCallbackBootstrapHold(false)'));
});

test('return from a LIFF friendship route restores the canonical design and rechecks friendship before Step 4', async () => {
  const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const start = source.indexOf('async function resumeLineOaFriendshipAfterReturn()');
  const end = source.indexOf('function persistCustomizationLoginIntent', start);
  const resume = source.slice(start, end);
  assert.match(resume, /restoreGuestDesignSnapshot\(\)/);
  assert.match(resume, /const friendship = await getLineOaFriendshipStatus\(\)/);
  assert.match(resume, /lineOaFriendshipStep4ResumePending = true/);
  assert.match(resume, /if \(!friendship\.friendFlag \|\| State\.currentStep !== 3\)/);
  assert.match(resume, /await openLineOaAddFriendExperience\(\)/);
  assert.match(resume, /State\.currentStep = 4/);
  assert.match(resume, /return await recheckLineOaFriendshipAndResume\(\)/);
});

test('native friendship prompt automatically rechecks and resumes while cancellation remains on Step 3', async () => {
  const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const gateStart = source.indexOf('async function canEnterOperationalStep4');
  const gateEnd = source.indexOf('async function resumeLineOaFriendshipAfterReturn()', gateStart);
  const gate = source.slice(gateStart, gateEnd);
  assert.match(gate, /addFriend\.source === 'liff_request_friendship'/);
  assert.match(gate, /await recheckLineOaFriendshipAndResume\(\)/);
  assert.doesNotMatch(gate, /showToast\('\\u0e44\u0e21\u0e48\u0e2a\u0e32\u0e21\u0e32\u0e23\u0e16\u0e40\u0e1b\u0e34\u0e14 LINE/);
});

test('deferred callback uses the centralized guard before handoff consume and opens the real add-friend route for non-friends', async () => {
  const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const start = source.indexOf('async function restoreDeferredLineCallbackBeforeReset');
  const end = source.indexOf('function persistLandingDismissed', start);
  const restore = source.slice(start, end);
  assert.ok(restore.indexOf('runDormantV2CallbackRestore') < restore.indexOf('await canEnterOperationalStep4'));
  assert.match(restore, /queueStep3Resume: true/);
});

test('customer Step 4 does not mount the legacy export/download controls', async () => {
  const [html, source] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../app.js', import.meta.url), 'utf8')
  ]);
  assert.doesNotMatch(html, /Bracelet Design & LINE Receipt Export/);
  assert.doesNotMatch(html, /btnDownloadHero|btnDownloadReceipt|exportReceiptPreview/);
  assert.match(html, /id="braceletShowcaseCard"/);
  const showcaseStart = source.indexOf('function renderBraceletShowcaseCard()');
  const showcaseEnd = source.indexOf('function getBraceletShowcaseRenderKey()', showcaseStart);
  const showcase = source.slice(showcaseStart, showcaseEnd);
  assert.match(showcase, /getElementById\('braceletShowcaseCard'\)/);
  assert.doesNotMatch(showcase, /querySelector\('\.billing-card'\)/);
});

test('Step 4 preview preparation completes before callback hold can release', async () => {
  const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const step4Start = source.indexOf('async function renderStep4()');
  const step4End = source.indexOf('function buildDesignConfigurationCode()', step4Start);
  const step4 = source.slice(step4Start, step4End);
  assert.match(step4, /await generateImageExports\(/);
  assert.doesNotMatch(step4, /setTimeout\(async/);
});
