# Phase 2 — Enrich existing Meta CAPI Purchase (UAT)

## สรุป

Phase นี้ปรับคุณภาพข้อมูลของ CAPI `Purchase` เดิมเท่านั้น โดยยังส่งจาก `server.js` หลัง Stripe webhook ยืนยัน `payment_status === 'paid'`, stock/order/cost snapshot ถูก persist และ analytics ถูก link แล้ว ไม่มี browser Purchase และไม่มี Purchase path ใหม่

## Existing CAPI implementation และการเปลี่ยนแปลง

ก่อน Phase นี้ `sendMetaPurchaseEvent(order)` ส่ง `Purchase` ไป `https://graph.facebook.com/v22.0/<pixel-id>/events` โดยมี event ID `stripe_checkout_<checkout session id>`, THB value และไม่มี `user_data`; ไม่มี timeout/retry

หลัง Phase นี้:

- `server.js` ยังคงเรียก `sendMetaPurchaseEvent(paidOrder, session)` แบบไม่ await หลัง `saveOrderForApi(paidOrder)` และ `linkAnalyticsOrderConversion(paidOrder)`
- `meta-capi-purchase.js` สร้าง payload แบบ server-only และไม่มี logging
- Meta request มี `AbortController` timeout 8 วินาที; error ถูก catch ที่เดิมและไม่กระทบ webhook/order/customer flow
- ไม่มี retry/outbox เพิ่มใน Phase นี้ เพื่อหลีกเลี่ยง queue subsystem หรือ repeated delivery ที่ควบคุมไม่ได้

## Final CAPI Purchase payload

```js
{
  event_name: 'Purchase',
  event_time: Math.floor(Date.now() / 1000),
  action_source: 'website',
  event_source_url: '<persisted Lucky Colorstone landing origin + pathname, or site root>',
  event_id: 'stripe_checkout_<Stripe Checkout Session ID>',
  user_data: {
    em: ['<sha256 normalized email>'],        // only if Stripe provided valid email
    ph: ['<sha256 E.164 phone>'],             // only if a real explicit + country-code phone exists
    external_id: ['<sha256 order ID>'],
    fbp: '<real valid _fbp>',                 // only if Phase 1 persisted it
    fbc: '<real valid _fbc>',                 // only if Phase 1 persisted it
    client_user_agent: '<persisted browser UA>' // only when original browser value exists
  },
  custom_data: { currency: 'THB', value: <authoritative order total> }
}
```

Unavailable values are omitted; the payload never creates fake identifiers.

## Event ID และ duplicate webhook safety

`stripe_checkout_<Stripe Checkout Session ID>` เป็น deterministic, immutable ID ที่มีอยู่แล้ว และยังเป็น event ID เดียวต่อ paid order จึงพร้อม reuse สำหรับ browser Purchase/deduplication ใน Phase 3

`applyStripeCheckoutPaymentEvent()` ยัง return duplicate ก่อน side effects/CAPI เมื่อ webhook event ถูก process แล้วหรือ order มี `stripePaymentStatus: paid`; duplicate webhook จึงไม่สร้าง ID ใหม่หรือ CAPI path ใหม่

## Attribution และ user_data sources

| Field | Source at paid webhook | Rule |
| --- | --- | --- |
| `fbp` / `fbc` | `paidOrder.metaAttribution` จาก Phase 1; first touch ก่อน แล้ว last touch fallback | ส่ง raw เฉพาะรูปแบบ Meta ที่ valid; ไม่ hash และไม่ fabricate |
| `em` | `session.customer_details.email` / `session.customer_email` จาก Stripe | lowercase/trim, validate email, SHA-256; omit เมื่อไม่มี/invalid |
| `ph` | `session.customer_details.phone`, fallback order shipping phone | รับเฉพาะ explicit E.164 (`+` + country code), normalize separators, SHA-256; ไม่เดา Thai country code |
| `external_id` | immutable Lucky Colorstone `order.id` | SHA-256; raw ID อยู่ภายในระบบ |
| `client_user_agent` | existing client-captured `order.analyticsSource.user_agent` | raw only when present; never generated server-side |
| `client_ip_address` | unavailable | ไม่ส่ง: webhook request IP เป็น Stripe ไม่ใช่ customer browser |

`event_source_url` ใช้ landing URL ที่ Phase 1 persist เฉพาะเมื่อเป็น HTTPS `customize.luckycolorstone.com` (หรือ UAT equivalent), และเก็บแค่ origin/pathname ไม่ส่ง query/hash; otherwise ใช้ `https://customize.luckycolorstone.com/`. ไม่ใช้ Stripe webhook URL, Meta endpoint หรือ Linktree URL

## Value / currency authority

value มาจาก `getOrderTotalPrice(paidOrder)` เดิม หลัง webhook ตรวจ `session.currency === thb` และ `session.amount_total` เท่ากับ `normalizeCurrencyAmount(getOrderTotalPrice(order))` แล้ว CAPI ส่ง major THB value (`1290.50`, ไม่ใช่ minor unit `129050`) และ `THB` ตามพฤติกรรมเดิม

## Failure isolation และ privacy

- CAPI call เป็น best-effort, timeout 8 seconds และ error ถูก catch โดย asynchronous caller หลัง paid persistence
- Meta failure ไม่ block Stripe webhook success, stock deduction, order persistence, fulfillment/LINE notification, CRM หรือ customer confirmation
- ไม่มี infinite retry
- ไม่มี raw email, phone, `fbclid`, `_fbp`, `_fbc` หรือ hash ถูก log โดย CAPI builder/error log
- ไม่มี IP/UA ที่สร้างจาก webhook/server

## Files changed

- `server.js` — reuse existing CAPI trigger; pass Stripe session only for available customer matching data; use new builder and bounded timeout
- `meta-capi-purchase.js` — new isolated CAPI payload/normalization helper
- `tests/meta-capi-purchase.test.cjs` — focused payload, paid authority, duplicate-ID, timeout, privacy tests
- `reports/meta-ads/2026-09-03-meta-capi-purchase-enrichment-phase2.md` — this report

No changes to `index.html`, `app.js`, CRM, Orders UI, catalog, inventory, scheduler, Supabase, or Meta Ads ingestion.

## Tests

Passed:

- `node --test tests/meta-capi-purchase.test.cjs` — 12 tests covering fbp/fbc, Linktree without fbc, fbp-only/no-identifier cases, hashes/omission, deterministic ID, value/currency, source URL, timeout/paid path, both Stripe paid event types, and log hygiene
- `node --test tests/meta-attribution.test.mjs` — 7 passed
- `node --test tests/analytics-tracking.test.mjs` — 7 passed
- `node --test tests/step4-checkout-fit-tolerance-root-fix.test.mjs` — 4 passed
- `node tests/uat-frontend-safety.test.cjs` — passed
- `node --test tests/uat-backend-guard.test.cjs` — passed
- `node --check server.js`, `node --check meta-capi-purchase.js`, `git diff --check` — passed

The full backend analytics test still requires the protected UAT server environment and was not run with a bypass. No production credentials, Meta credentials, real payment, CAPI request, deployment, or production data change was used in this Phase.

## Production promotion requirements

Before a separate production promotion: review privacy/consent legal basis, configure durable server-side `META_PIXEL_ID` and `META_CONVERSIONS_API_ACCESS_TOKEN`, validate Events Manager Test Events with an approved test payment, confirm event match quality/value/currency, and monitor redacted CAPI failures. Do not promote browser Purchase in this Phase.

## Final status

- CAPI Purchase enriched: YES
- Deterministic event ID added/verified: YES (verified existing stable design)
- fbp supported: YES
- fbc supported: YES
- Matching user_data improved: YES
- Browser Purchase implemented: NO
- Stripe authority changed: NO
- Payment behavior changed: NO
- Production modified: NO

Implementation commit: `8e86ebe` (`Enrich Meta CAPI purchase matching data`).
