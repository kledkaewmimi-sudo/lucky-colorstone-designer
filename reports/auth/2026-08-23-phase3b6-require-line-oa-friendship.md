# Phase 3B.6 — require LINE OA friendship before Step 4

## Outcome

The deferred callback now requires both a valid LINE identity and
`liff.getFriendship().friendFlag === true` before it consumes the handoff,
restores the design, or opens Step 4. A false/unavailable friendship result
preserves the V2 intent and local snapshot at Step 3 and displays the required
Thai add-friend gate. This is still limited to the existing private QA effective
flag; the broad production default remains `false`.

## Implemented callback behavior

```text
LINE callback → identity sync → getFriendship()
  friendFlag true  → consume handoff → reconcile/recompute → Step 4
  friendFlag false → preserve Step 3 recovery state → add-friend gate
```

The gate uses LINE’s supported LIFF APIs:

- `liff.getFriendship()` checks the linked OA relationship.
- `liff.requestFriendship()` invokes LINE’s official add/unblock UI from the
  user-initiated primary CTA.
- **ตรวจสอบอกครง** rechecks and resumes only after `friendFlag === true`.

The UI copy is exactly:

- Title: `เพมเพอน LINE เพอดำเนนการตอ`
- Body: `กรณาเพม Lucky Colorstone เปนเพอนใน LINE เพอรบขอมลคำสงซอและการแจงเตอนหลงชำระเงน`
- Primary: `เพมเพอน LINE`
- Secondary: `ตรวจสอบอกครง`

## Buyer notification audit

The buyer push path uses `order.lineUserId`, populated from the authenticated
LIFF profile and carried through the existing order payload. It sends only on
the existing paid-order eligibility path through the configured Messaging API
channel. Buyer delivery logging now records only order ID and a category:
attempted, success, skipped, or failure with HTTP category. It logs no access
token, LINE user ID, or raw API response.

LINE’s Messaging API only reliably delivers push messages to OA friends; a
friendship gate therefore prevents the observed case where a paid order exists
but the buyer cannot receive the push.

## Required owner configuration before E2E test

In LINE Developers Console, the LINE Login channel containing LIFF ID
`2010525799-qImIuhla` must be linked to the Lucky Colorstone OA that owns the
Messaging API channel used by `LINE_CHANNEL_ACCESS_TOKEN`.

1. Confirm the LINE Login channel and OA Messaging API channel belong to the
   same provider.
2. In the LINE Login channel, open **Channel settings / Basic settings**.
3. Under **Linked LINE Official Account**, select the Lucky Colorstone OA and
   update it. The operator needs LINE Login channel Admin permission and OA
   administrator permission.
4. In the LIFF app settings, enable the official Add Friend option with
   `botPrompt` / `bot_prompt` set to `aggressive`.
5. Ensure the LIFF app has the `profile` scope, required by `getFriendship()`.

Without this linkage/configuration, LINE cannot return a valid friendship status
for this OA, and the app correctly blocks Step 4.

Official references: [LINE add-friend option](https://developers.line.biz/en/docs/messaging-api/sharing-bot/),
[LIFF friendship APIs](https://developers.line.biz/en/docs/liff/developing-liff-apps/), and
[Messaging API push conditions](https://developers.line.biz/en/reference/messaging-api/).

## Safety and non-changes

- No Stripe, webhook, CRM, order semantics, pricing, catalog, renderer,
  ResolvedLayout, UTM, analytics event definition, Meta Pixel definition, or
  admin notification behavior was changed.
- The handoff is not consumed for a non-friend, keeping the design recoverable.
- Existing authenticated direct Step 3 → Step 4 behavior is unchanged outside
  the deferred callback path.
- Browser/device E2E remains manual; no Android/LINE real-device automation was
  available in this environment.

## Verification

Focused source tests cover friendship-before-consume, exact UI copy/actions, and
safe buyer notification logging. Existing auth, callback, handoff, snapshot,
and Beryl tests remain part of the regression run.

## Rollback

Leave `DEFER_LINE_LOGIN_TO_STEP4` false or revoke the private QA session. No
database rollback is required; the legacy mobile flow remains unchanged.
