# รายงานตรวจสอบต้นทุน Order ที่ไม่สามารถ resolve ได้ (Production)

วันที่ตรวจสอบ: 2026-09-01 (read-only จาก `https://customize.luckycolorstone.com/api/*`)

## ผลสรุป

- Paid orders ทั้งหมด 25 รายการ: `complete` 2, `unavailable` 1, และไม่มี `costSnapshot` 22 รายการ
- CRM จะแสดง `UNKNOWN / UNRESOLVED COST` ทั้ง `unavailable` และ order ที่ไม่มี snapshot จึงมีผลกระทบ 23 paid orders
- ไม่มีปัญหา ID/name/size mismatch, purchase record ที่ link ผิด, หรือ catalog item ถูกลบ/inactive ในกลุ่มที่ตรวจพบ
- `ORD-266992` เป็น order ใหม่ที่ snapshot แล้ว แต่ขาด Purchase cost จริง 2 variant: `pink_tiger_eye` 10mm และ `red_tiger_eye` 10mm
- 22 orders เก่าเป็นกรณี C: ไม่มี historical cost snapshot เลย ไม่ใช่ผลจาก UI lookup ล้มเหลว
- จาก 22 รายการเก่า มีเพียง `ORD-123066` ที่ทุก component มี exact Purchase ก่อนวัน order และสามารถเสนอ backfill แบบ deterministic ได้; อีก 21 รายการยังมีอย่างน้อยหนึ่ง component ที่ Purchase ที่ exact ตรงกันถูกบันทึกหลังวัน order

## กฎที่ใช้งานอยู่ใน Production

เมื่อ Stripe webhook เปลี่ยน paid order จะสร้าง `order.costSnapshot` เพียงครั้งเดียวจาก Purchase rows ที่ exact identity:

- Stone: `item_type=stone + catalog_item_id + size_mm`
- Charm/Spacer: `item_type + catalog_item_id`
- unit cost = `sum(total_cost) / sum(quantity)` ของ Purchase ที่ match ทั้งหมด (weighted average)
- Material Cost = ผลรวม `unit cost × quantity` ทุก component; Delivery Cost = 80
- หาก component ใด component หนึ่ง resolve ไม่ได้ snapshot ทั้งก้อนเป็น `unavailable`; Material/Total/Profit/Margin ไม่คำนวณแบบ partial
- Snapshot ที่มีอยู่จะไม่ถูก recompute เมื่อ Purchase เปลี่ยน

ข้อควรระวัง: current new-order creation aggregate Purchase ที่มีอยู่ขณะ webhook โดยไม่ได้ใช้ order-date cutoff. แต่เนื่องจาก snapshot ถูกบันทึกทันทีและ immutable จึงไม่ใช่การนำต้นทุนปัจจุบันไปเขียนทับ order เก่า. ห้ามใช้กฎนี้กับ historical backfill.

## ตรวจสอบตัวอย่างที่ resolve สำเร็จ

| Order | Material | Total Cost | Profit | Margin |
| --- | ---: | ---: | ---: | ---: |
| ORD-959627 | 64.83 | 144.83 | 327.17 | 69.3% |
| ORD-660274 | 33.95 | 113.95 | 388.05 | 77.3% |

## Order ใหม่ที่ unresolved

| Order | Date | Component | Type | Catalog ID | Size | Qty | Purchase cost | Result / reason |
| --- | --- | --- | --- | --- | --- | ---: | --- | --- |
| ORD-266992 | 2026-09-01 | ไทเกอร์อายชมพู | stone | pink_tiger_eye | 10mm | 1 | ไม่มี exact row | A — no purchase cost configured |
| ORD-266992 | 2026-09-01 | เรดไทเกอร์อาย | stone | red_tiger_eye | 10mm | 1 | ไม่มี exact row | A — no purchase cost configured |

ทุก component อื่นของ `ORD-266992` resolve สำเร็จจาก exact ID + size. ทั้ง order จึง unresolved ตามกฎ all-or-nothing. Owner ต้องเพิ่ม Purchase record ของสอง variant ข้างต้นเท่านั้นสำหรับ order ใหม่ในอนาคต; ห้ามใช้ manual catalog cost เป็น substitute.

## Historical orders

22 orders ต่อไปนี้ไม่มี `costSnapshot`: `ORD-572404`, `ORD-478676`, `ORD-364998`, `ORD-690039`, `ORD-175365`, `ORD-514883`, `ORD-576378`, `ORD-192061`, `ORD-103465`, `ORD-299037`, `ORD-307039`, `ORD-931320`, `ORD-855854`, `ORD-148174`, `ORD-896440`, `ORD-448551`, `ORD-635588`, `ORD-154067`, `ORD-760245`, `ORD-123066`, `ORD-806246`, `ORD-383094`.

ทุก order เก่ามี `itemizedBilling` ที่เก็บ type, catalog ID, size (stone) และ quantity จึงไม่ใช่ legacy schema mismatch. แต่ snapshot ไม่ได้ถูกสร้างในอดีต (C). ตารางต่อไปนี้คือ component groups ที่ทำให้ historical reconstruction ยังไม่ปลอดภัย (F); Purchase exact row มีอยู่แล้ว แต่วัน Purchase อยู่หลังวัน order จึงห้ามนำมาใช้.

| Component / SKU / size | Type | Affected orders | Qty | Earliest exact Purchase after order | Reason |
| --- | --- | ---: | ---: | --- | --- |
| white_jade 10mm | stone | 5 | 25 | 2026-08-31 | F |
| diamond-ball-blue-9mm | spacer | 2 | 3 | 2026-08-31 | F |
| amethyst_quartz 10mm | stone | 4 | 6 | 2026-08-31 | F |
| cherry_quartz 10mm | stone | 4 | 6 | 2026-08-31 | F |
| citrine 4mm | stone | 3 | 13 | 2026-08-31 | F |
| blue_cat_eye 6mm | stone | 1 | 3 | 2026-08-31 | F |
| red_tiger_eye 6mm | stone | 1 | 2 | 2026-08-31 | F |
| lapis_lazuli 6mm | stone | 4 | 11 | 2026-08-31 | F |
| black_tourmaline 4mm | stone | 2 | 9 | 2026-08-31 | F |
| ice_quartz 4mm | stone | 2 | 11 | 2026-08-31 | F |
| carnelian 4mm | stone | 2 | 8 | 2026-08-31 | F |
| gold_flower | spacer | 3 | 10 | 2026-08-31 | F |
| golden_rutile 10mm | stone | 1 | 1 | 2026-08-31 | F |
| rutilated_quartz 10mm | stone | 3 | 7 | 2026-08-31 | F |
| golden_ball | spacer | 4 | 64 | 2026-08-31 | F |
| blue_agate 6mm | stone | 1 | 1 | 2026-08-31 | F |
| pyrite 10mm | stone | 1 | 1 | 2026-08-31 | F |
| honey_jade 10mm | stone | 1 | 1 | 2026-08-31 | F |
| carnelian 10mm | stone | 2 | 8 | 2026-08-31 | F |
| gold_sand_stone 6mm | stone | 1 | 2 | 2026-08-31 | F |
| moss_agate 6mm | stone | 3 | 7 | 2026-08-31 | F |
| aquamarine 6mm | stone | 5 | 14 | 2026-08-31 | F |
| clear_quartz 6mm | stone | 2 | 5 | 2026-08-31 | F |
| golden_rutile 6mm | stone | 3 | 9 | 2026-08-30 | F |
| silver_sand_stone 6mm | stone | 1 | 4 | 2026-08-31 | F |
| black_tourmaline 6mm | stone | 3 | 9 | 2026-08-30 | F |
| amethyst 4mm | stone | 1 | 4 | 2026-08-29 | F |
| rose_quartz 4mm | stone | 1 | 12 | 2026-08-30 | F |
| citrine 6mm | stone | 2 | 5 | 2026-08-30 | F |
| honey_jade 6mm | stone | 1 | 1 | 2026-08-31 | F |
| white_cat_eye 6mm | stone | 1 | 2 | 2026-08-31 | F |
| silver_flower | spacer | 1 | 2 | 2026-08-31 | F |
| pearls 10mm | stone | 1 | 15 | 2026-08-31 | F |

`ORD-123066` ไม่มี component group ในตาราง F: ทุก component exact-match Purchase ก่อน order date. จึงเป็น candidate เดียวสำหรับ owner-approved, create-only backfill ที่บันทึก method, cutoff date และ source rows; ต้องไม่ overwrite snapshot เดิม. อีก 21 historical orders ต้องคง `unresolved` จนกว่า owner จะเพิ่ม Purchase history ที่มีวันที่ก่อน/ในวัน order อย่างถูกต้อง.

## การเปลี่ยนแปลง CRM

เพิ่ม diagnostic เฉพาะ CRM admin ใต้ COST ที่ unresolved:

- snapshot `unavailable`: แสดง `Missing cost:` พร้อมชื่อที่เก็บใน order, size และ quantity ของทุก unresolved component
- ไม่มี historical snapshot: แสดงว่า snapshot หายและไม่ได้เอา Purchase cost ปัจจุบันมาใช้

การเปลี่ยนแปลงนี้เป็นการแสดงข้อมูลเท่านั้น: ไม่แตะราคา, ส่วนลด, Stripe, order total, order item, inventory, Beryl หรือ catalog identity. ไม่มี SQL/database change และไม่มี backfill/write ไป Production.

## สถานะการทดสอบและ deployment

- Cost snapshot tests และ persistence tests: ผ่าน
- Beryl visual test ที่รันร่วมกันล้มเหลวก่อนถึง assertion ของงานนี้ เพราะ test harness สร้าง data-URL module ที่มี duplicate import (`BERYL_CATALOG_FADE_MS`); ไม่มีไฟล์ Beryl ถูกแก้
- ยังไม่ได้ deploy หรือ verify UI ที่ Production เพราะงานนี้ไม่มี authorization ให้ deploy Production. ดังนั้นยังห้ามเรียกว่า production fixed.
