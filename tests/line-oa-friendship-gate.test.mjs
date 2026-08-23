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
