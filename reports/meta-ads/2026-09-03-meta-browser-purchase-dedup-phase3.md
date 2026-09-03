# Phase 3 — Browser Purchase + Meta deduplication contract (UAT)

## สรุป

Phase นี้เพิ่ม browser Pixel `Purchase` เพื่อเป็น tracking-only companion ของ CAPI `Purchase` เดิม โดย browser จะส่งได้ต่อเมื่อ server ยืนยันว่า order ถูก persist เป็น `stripePaymentStatus: paid` แล้วเท่านั้น Stripe webhook ยังคงเป็น sole business authority

ไม่มีการสร้าง order, mark paid, modify Stripe, inventory, CRM หรือ pricing จาก browser code

## Browser paid-confirmation mechanism

Flow เดิมหลัง Stripe redirect คือ `?stripe=success&session_id=<opaque Stripe session id>` แล้ว `handleStripeReturnIfNeeded()` ตรวจ `/api/stripe/checkout-session` ว่า Stripe และ persisted application order เป็น paid

Phase นี้เพิ่ม endpoint read-only แยกต่างหาก:

```text
GET /api/stripe/purchase-tracking?session_id=<opaque Stripe checkout session id>
```

endpoint lookup order ที่สัมพันธ์กับ session ID และตอบเพียง:

```js
{ paid: true, event_id, value, currency: 'THB' }
// หรือ
{ paid: false }
```

ไม่มี email, phone, shipping, Stripe metadata, order payload, token หรือ service credential ใน response. Browser เรียก endpoint นี้แบบ best-effort หลัง return flow เดิม server-confirmed paid สำเร็จแล้ว; response `paid: false`, endpoint failure, หรือ malformed payload จะไม่ส่ง Pixel Purchase

## Browser Purchase trigger

`verifyAndTrackMetaPurchase(sessionId)` validate server response ผ่าน `normalizeBrowserPurchaseTracking()` แล้วเรียก:

```js
fbq('track', 'Purchase', {
  value,
  currency: 'THB'
}, { eventID })
```

ค่า `value`/`currency` ไม่มาจาก DOM, localStorage, URL หรือ basket reconstruction: backend สร้างจาก `getOrderTotalPrice(order)` หลัง existing Stripe webhook amount/currency validation

## Event ID และ deduplication contract

server endpoint ใช้ `getMetaPurchaseEventId(order)` เดียวกับ Phase 2 CAPI:

```text
stripe_checkout_<Stripe Checkout Session ID>
```

สำหรับ paid order เดียว:

| Channel | event_name | event_id | value | currency |
| --- | --- | --- | --- | --- |
| Browser Pixel | `Purchase` | `stripe_checkout_<session>` | authoritative order total | `THB` |
| Server CAPI | `Purchase` | `stripe_checkout_<session>` | authoritative order total | `THB` |

จึงรองรับทั้ง CAPI-first และ browser-first delivery order โดย Meta dedup relies on matching event name + event ID. Browser does not generate another ID.

## Refresh / repeat safety

หลัง `fbq` call สำเร็จ browser เก็บ first-party localStorage key:

```text
lucky_meta_purchase_sent_<encoded deterministic event ID>
```

refresh, tab reopen, back/forward และ repeated verification จะไม่ส่ง browser event ใหม่ใน browser storage เดิม. หาก storage ถูก block, event ID เดิมยังคงเป็น Meta cross-channel deduplication safeguard; browser never generates a replacement ID

## Linktree and identifier behavior

Direct Meta ad และ Instagram/Linktree journeysใช้ paid endpoint/ID/value/currency เดียวกัน ไม่ต้องมี `fbclid`, `_fbc` หรือ `_fbp` เพื่อ fire legitimate Purchase. หาก identifiers ไม่มี Meta matching อาจอ่อนลง แต่ Purchase จะไม่ถูก fabricate หรือ blocked

## Failure and security isolation

- Pixel unavailable/blocked: `trackMetaEvent` returns false; paid order, Stripe, webhook, inventory, CRM และ CAPI path ไม่ได้รับผล
- CAPI failure: CAPI remains independent best-effort after paid persistence; browser tracking response remains independently eligible
- ทั้ง Pixel/CAPI unavailable: payment behavior unchanged
- Browser verification response intentionally minimal and uses opaque Stripe session IDs already present in the controlled success redirect. It never returns raw order/customer data
- Existing production `PageView`, `ViewContent`, `InitiateCheckout` behavior is not changed. UAT `index.html` intentionally remains Pixel-free and `IS_UAT_MODE` makes tracking no-op

## Files changed

- `server.js` — imports common event-ID helper and adds minimal read-only `/api/stripe/purchase-tracking` endpoint; existing webhook/business logic unchanged
- `app.js` — imports browser tracking validator, invokes tracking only after existing paid return handling, and supports Pixel event options for `eventID`; existing events retain their two-argument calls
- `meta-browser-purchase.js` — pure browser response validator and deterministic local storage key helper
- `tests/meta-browser-purchase.test.mjs` — paid/unpaid, dedup contract, endpoint-minimization, repeat, Linktree, async/card, privacy and regression tests
- `reports/meta-ads/2026-09-03-meta-browser-purchase-dedup-phase3.md` — this report

No changes to `index.html`, CRM, Meta Ads ingestion/scheduler, Supabase, catalog, inventory, or payment amount logic

## Test results

Passed:

- `node --test tests/meta-browser-purchase.test.mjs` — 9 tests: unpaid/abandoned denial, paid card/async contract, browser/CAPI ID-value-currency equality, repeat key, Linktree/direct/no identifier, Pixel syntax/isolation, endpoint privacy, UAT Pixel isolation, duplicate webhook/CAPI behavior
- `node --test tests/meta-capi-purchase.test.cjs` — 12 passed
- `node --test tests/meta-attribution.test.mjs` — 7 passed
- `node --test tests/analytics-tracking.test.mjs` — 7 passed
- `node --test tests/step4-checkout-fit-tolerance-root-fix.test.mjs` — 4 passed
- `node tests/uat-frontend-safety.test.cjs` — passed
- `node --test tests/uat-backend-guard.test.cjs` — passed
- `node --check server.js`, `git diff --check` — passed

No real checkout, Stripe webhook, Meta request, Test Events request, Production deployment, or Production data modification was performed. The protected full backend integration test was not bypassed because this shell does not have its required UAT environment values.

## Production promotion requirements

Before any production promotion, review the endpoint as part of the authenticated/opaque Stripe session return model, obtain privacy/consent approval, deploy through the normal controlled release process, then perform one approved low-risk payment and Meta Events Manager Test Events verification. Confirm matching `Purchase` event name, ID, value and currency from browser and CAPI, and observe deduplication. That live verification is Phase 4 and is not claimed here.

## Final status

- Browser Purchase implemented: YES
- Server-confirmed paid trigger: YES
- Same event_id as CAPI: YES
- Same value/currency as CAPI: YES
- Refresh safe: YES
- Linktree supported: YES
- Stripe authority changed: NO
- Payment behavior changed: NO
- Production modified: NO
- Live Meta dedup verified: NO

Implementation commit: `35ddeeb` (`Add browser Meta Purchase deduplication`).
