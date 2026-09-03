# Phase 1 — Meta Attribution Persistence (UAT)

## สรุป

Phase นี้เพิ่มเฉพาะการเก็บ attribution จากหน้า landing ให้คงอยู่จนถึง order payload เดิม เพื่อใช้ต่อใน CAPI Purchase ระยะถัดไปได้อย่างปลอดภัย รองรับทั้ง Direct Meta Ad → website และ Meta/Instagram → Linktree/link hub → website โดยไม่สร้าง identifier ที่ไม่ได้รับมาจริง

ไม่มีการส่ง Pixel event ใหม่, browser Purchase, Purchase deduplication, CAPI user-data enrichment, Meta CAPI change, consent banner หรือการเปลี่ยนแปลง Stripe/payment/webhook

## ไฟล์ที่เปลี่ยน

- `meta-attribution.js` — pure client-side helper สำหรับอ่าน URL/cookie, ตรวจรูปแบบ `_fbp`/`_fbc`, derive `_fbc` ได้เฉพาะเมื่อมี `fbclid`, และจัดการ first/last touch โดยไม่ log identifier
- `app.js` — เรียก helper แบบ best-effort เมื่อเริ่มแอป, persist state ใน `localStorage` key `lucky_meta_attribution_v1`, และเพิ่ม `metaAttribution` เข้า `getAnalyticsOrderFields()` ซึ่งถูก spread เข้า `buildCurrentOrderPayload()` อยู่แล้ว
- `tests/meta-attribution.test.mjs` — regression tests สำหรับ capture/state/order payload contract
- `reports/meta-ads/2026-09-03-meta-pixel-capi-purchase-audit.md` — audit/design source of truth ของ Phase นี้

ไม่มีการแก้ `server.js`, `server.ps1`, Stripe metadata, Stripe webhook, CRM หรือ Supabase schema

## Storage และ session/order continuity

state ที่ persist มีรูปแบบ:

```js
{
  firstTouch: { utm, meta, referrer, landingUrl, landedAt },
  lastTouch: { utm, meta, referrer, landingUrl, landedAt }
}
```

`buildCurrentOrderPayload()` ใช้ `...getAnalyticsOrderFields()` อยู่ก่อนแล้ว จึงพา `metaAttribution` เข้า pending order/session correlation เดิมโดยไม่ต้องใส่ค่า Meta identifiers ลง Stripe metadata และไม่เปลี่ยน checkout amount, currency หรือ paid-order authority

## First touch และ last touch

- first eligible landing ถูกสร้างครั้งเดียวและไม่ถูกเขียนทับเมื่อมี landing ภายนอกครั้งถัดไป
- last touch เริ่มจาก landing แรก และเปลี่ยนเฉพาะเมื่อ URL มี UTM/`fbclid` หรือมี referrer คนละ origin
- internal navigation/referrer origin เดียวกันไม่ถือเป็น external touch จึงไม่แทนที่ attribution
- delayed cookie hydration เก็บ `_fbp`/`_fbc` ที่ browser มีจริงภายหลัง Pixel base script ทำงาน โดยไม่เปลี่ยน source, landing URL หรือ timestamp ของ touch

ตัวอย่าง: first `instagram / paid` จะคงเดิม แม้ later landing เป็น `instagram / linktree`; last touch จะเป็น Linktree

## fbclid / fbp / fbc lifecycle

- UTM อ่านจาก URL generically: `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`; ไม่มีค่าจะเป็น `null`
- `fbclid` เก็บเฉพาะเมื่ออยู่ใน incoming URL
- `_fbp` อ่านเฉพาะจาก cookie `_fbp` ที่มีและผ่านรูปแบบ Meta; ไม่มีการสังเคราะห์
- `_fbc` ใช้ cookie `_fbc` ที่มีและผ่านรูปแบบ Meta ก่อน หากไม่มี จะ derive เป็น `fb.1.<millisecond timestamp>.<fbclid>` เฉพาะเมื่อ URL มี `fbclid` จริง
- ไม่มี `fbclid` และไม่มี `_fbc` ที่ valid จะไม่สร้าง `_fbc` จาก UTM หรือ referrer
- ไม่มี raw `fbclid`, `_fbp`, `_fbc` ใน console/debug logging

## Linktree / link-hub

Linktree ถูก support เป็น normal external landing: URL เช่น `?utm_source=instagram&utm_medium=linktree&utm_campaign=launch_2026` จะ update last touch แม้ไม่มี `fbclid` หรือ referrer จำกัด

- ถ้า `fbclid` ไปถึงเว็บ จะเก็บและ derive/retain `_fbc` ตามกติกาข้างต้น
- ถ้าไม่มี `fbclid` แต่มี real `_fbp`/`_fbc` จะเก็บเฉพาะค่าที่มี
- ถ้าไม่มี Meta identifier เลย ระบบยังเก็บ UTM/referrer/landing/session-order linkage ภายใน แต่ไม่อ้างว่า Meta จะ attribute กลับ ad ได้

สำหรับ paid conversion campaign ยังคงแนะนำ direct destination ไป `customize.luckycolorstone.com` พร้อม UTM; Linktree ยังรองรับสำหรับ Instagram-profile journey

## ผลการทดสอบ

ผ่าน:

- `node --test tests/meta-attribution.test.mjs` — 7 tests: Facebook/Instagram/Linktree, Linktree+fbclid, immutable first touch, last touch, internal navigation, missing/invalid identifiers, delayed `_fbp` hydration, และ order payload/logging contract
- `node --test tests/analytics-tracking.test.mjs` — 7 tests passed
- `node --test tests/step4-checkout-fit-tolerance-root-fix.test.mjs` — 4 tests passed
- `node tests/uat-frontend-safety.test.cjs` — passed
- `node --test tests/uat-backend-guard.test.cjs` — passed
- `git diff --check` — passed

`node --test tests/analytics-v2-server.test.mjs` ไม่สามารถเริ่ม backend ได้ เพราะ shell ไม่มี required UAT environment (`APP_ENV=uat`, `UAT_BACKEND=true`, และ UAT Supabase values) และ UAT backend guard ปฏิเสธการเริ่ม server ตามที่ออกแบบไว้ การ guard ไม่ถูก bypass และ `server.js` ไม่ได้ถูกแก้เพื่อให้ test ผ่าน

## ขอบเขตและความปลอดภัย

- Attribution persistence implemented: YES
- Linktree supported: YES
- Browser Purchase implemented: NO
- CAPI Purchase modified: NO
- Stripe behavior modified: NO
- Payment behavior modified: NO
- Production modified: NO
- Supabase migration/data modified: NO
- Frontend UI exposed identifiers: NO

Implementation commit: `a279aec` (`Persist Meta landing attribution through orders`).
