import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('deferred callback requires LINE OA friendship before consuming a handoff', async () => {
  const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const restoreStart = source.indexOf('async function restoreDeferredLineCallbackBeforeReset');
  const restoreEnd = source.indexOf('function persistLandingDismissed', restoreStart);
  const restore = source.slice(restoreStart, restoreEnd);
  assert.ok(restore.indexOf('const friendship = await getLineOaFriendshipStatus()') >= 0);
  assert.ok(restore.indexOf("reason: 'line_oa_friendship_required'") >= 0);
  assert.ok(restore.indexOf('const friendship = await getLineOaFriendshipStatus()') < restore.indexOf('runDormantV2CallbackRestore'));
  assert.match(source, /liff\.getFriendship\(\)/);
  assert.match(source, /liff\.requestFriendship\(\)/);
});

test('friendship gate has the required Thai copy and explicit add/recheck actions', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /เพมเพอน LINE เพอดำเนนการตอ/);
  assert.match(html, /กรณาเพม Lucky Colorstone เปนเพอนใน LINE เพอรบขอมลคำสงซอและการแจงเตอนหลงชำระเงน/);
  assert.match(html, /เพมเพอน LINE/);
  assert.match(html, /ตรวจสอบอกครง/);
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

test('authenticated deferred Step 3 fast path requires friendship before Step 4', async () => {
  const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const navigationStart = source.indexOf('function setupNavigationEvents()');
  const navigationEnd = source.indexOf('// Home Button clicks', navigationStart);
  const navigation = source.slice(navigationStart, navigationEnd);
  const gateStart = source.indexOf('async function requireLineOaFriendshipBeforeAuthenticatedStep4()');
  const gateEnd = source.indexOf('// LIFF Initialization', gateStart);
  const gate = source.slice(gateStart, gateEnd);

  assert.match(gate, /const friendship = await getLineOaFriendshipStatus\(\)/);
  assert.match(gate, /if \(friendship\.friendFlag\) return true/);
  assert.match(gate, /lineOaFriendshipStep4ResumePending = true/);
  assert.match(gate, /showLineOaFriendshipGate\(\)/);
  assert.match(navigation, /isDeferredLineLoginEffectivelyEnabled\(\) && isLineIdentityAvailable\(\)/);
  assert.ok(navigation.indexOf('requireLineOaFriendshipBeforeAuthenticatedStep4()') < navigation.indexOf('await goToStep(State.currentStep + 1)'));
});

test('existing add-friend recheck resumes the authenticated Step 4 continuation only after a true friendship result', async () => {
  const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const start = source.indexOf('async function recheckLineOaFriendshipAndResume()');
  const end = source.indexOf('async function requestLineOaFriendship()', start);
  const recheck = source.slice(start, end);

  assert.ok(recheck.indexOf('if (!friendship.friendFlag)') < recheck.indexOf('if (lineOaFriendshipStep4ResumePending)'));
  assert.match(recheck, /if \(!isLineIdentityAvailable\(\) \|\| State\.currentStep !== 3\)/);
  assert.match(recheck, /lineOaFriendshipStep4ResumePending = false/);
  assert.match(recheck, /await goToStep\(4\)/);
  assert.ok(recheck.indexOf('await goToStep(4)') < recheck.indexOf('restoreDeferredLineCallbackBeforeReset'));
});
