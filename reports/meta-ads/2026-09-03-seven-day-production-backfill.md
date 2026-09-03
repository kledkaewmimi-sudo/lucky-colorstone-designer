# รายงาน: Controlled 7-Day Meta Ads Production Backfill

## สถานะสรุป

ช่วงที่อนุมัติสำหรับงานนี้คือ **2026-08-26 ถึง 2026-09-01 (รวม 7 วัน)** และจำกัดเฉพาะสองชุดข้อมูลที่ยืนยันแล้วเท่านั้น:

1. `public.meta_ads_hourly_performance_insights` — baseline performance รายชั่วโมงระดับ ad
2. `public.meta_ads_daily_demographics` — demographics รายวันตาม `age` และ `gender`

ขั้นตอน pre-write ใน shell นี้หยุดอย่างปลอดภัยก่อนเรียก Meta หรือ Supabase เพราะไม่พบ environment variables ที่จำเป็นทั้งห้าชื่อ และไม่สามารถยืนยัน URL/project identity ของ Production Supabase ได้ จึงไม่มีการเขียนข้อมูล Production ในงานนี้ และไม่มีผลลัพธ์ row count หลัง backfill ที่จะอ้างว่าเป็นจริงได้

## ขอบเขตและข้อห้าม

ไม่เรียก placement, geo, engagement, Pixel, Conversions API, CRM dashboard หรือ scheduler งานนี้จะไม่แตะ customer frontend, CRM, `server.js`, Orders, Stripe/payment/webhook, purchases, inventory, catalog, renderer/Beryl, analytics เดิม หรือ application tables เดิม

มีเพียง isolated Meta Ads tables ที่ได้รับอนุญาตเป็นปลายทางเขียน:

- `public.meta_ads_hourly_performance_insights`
- `public.meta_ads_daily_demographics`

## Pre-write gate

ตรวจชื่อ environment variables (ไม่แสดงค่า secret) ใน shell ที่ใช้ทำงานนี้เมื่อ 2026-09-03:

| Variable | สถานะใน shell นี้ |
| --- | --- |
| `META_AD_ACCOUNT_ID` | ไม่พบ |
| `META_ACCESS_TOKEN` | ไม่พบ |
| `META_API_VERSION` | ไม่พบ |
| `META_ADS_SUPABASE_URL` | ไม่พบ |
| `META_ADS_SUPABASE_SERVICE_ROLE_KEY` | ไม่พบ |

จึงไม่สามารถยืนยันว่า `META_ADS_SUPABASE_URL` ชี้ไปยัง Production project ที่ owner อนุมัติได้ และไม่สามารถอ่าน row count ก่อนเขียน หรือยืนยัน rows ของ `2026-09-01` (baseline 24 / demographics 13) จาก Production ด้วยตนเองได้ แม้ owner จะรายงานว่า state ดังกล่าวผ่านแล้วก็ตาม

CLI ได้รับการตรวจว่าใช้งาน date range ที่ต้องการได้ โดยไม่ต้องแก้โค้ดเพิ่มเติม:

```powershell
node scripts/meta-ads-sync.js --since 2026-08-26 --until 2026-09-01
node scripts/meta-ads-analytics-sync.js --since 2026-08-26 --until 2026-09-01 --datasets demographics --demographics-stage age_gender --granularity daily
```

## คำสั่ง owner-run ที่ควรทำหลังผ่าน gate

ใน trusted Production shell ที่มี credentials ครบ และหลัง owner ยืนยัน Supabase project แล้ว ให้รันตามลำดับนี้เท่านั้น:

```powershell
node scripts/meta-ads-sync.js --since 2026-08-26 --until 2026-09-01
node scripts/meta-ads-analytics-sync.js --since 2026-08-26 --until 2026-09-01 --datasets demographics --demographics-stage age_gender --granularity daily
```

ห้ามขยายช่วงวัน ห้ามเพิ่ม dataset และห้ามใช้ `--dry-run` สำหรับสองคำสั่งเขียนนี้ หลังคำสั่งทั้งสองเสร็จ ต้องอ่านข้อมูลกลับจาก Supabase ก่อนถือว่าสำเร็จ

## การตรวจ Production ก่อนและหลังเขียน

รัน queries ต่อไปนี้ใน SQL Editor ของ **Production project ที่ยืนยันแล้ว** ก่อนเขียน, หลังเขียน, และหลัง idempotency rerun โดยเปรียบเทียบผลลัพธ์แต่ละรอบ:

```sql
select
  report_date,
  count(*) as row_count,
  count(distinct insight_key) as distinct_insight_keys,
  sum(spend) as total_spend,
  sum(impressions) as total_impressions,
  sum(clicks) as total_clicks,
  sum(link_clicks) as total_link_clicks
from public.meta_ads_hourly_performance_insights
where report_date between date '2026-08-26' and date '2026-09-01'
group by report_date
order by report_date;

select
  report_date,
  count(*) as row_count,
  count(distinct insight_key) as distinct_insight_keys,
  string_agg(distinct concat_ws('/', age, gender), ', ' order by concat_ws('/', age, gender)) as age_gender_groups
from public.meta_ads_daily_demographics
where report_date between date '2026-08-26' and date '2026-09-01'
group by report_date
order by report_date;

select report_date, insight_key, count(*) as duplicate_count
from public.meta_ads_hourly_performance_insights
where report_date between date '2026-08-26' and date '2026-09-01'
group by report_date, insight_key
having count(*) > 1;

select report_date, insight_key, count(*) as duplicate_count
from public.meta_ads_daily_demographics
where report_date between date '2026-08-26' and date '2026-09-01'
group by report_date, insight_key
having count(*) > 1;
```

Verify independently that the pre-existing `2026-09-01` rows remain `24` baseline and `13` demographics, as reported by the owner. Do not assume 24 baseline rows for every other day: report exactly what Meta returns.

For baseline, inspect that `account_timezone`, `raw_insight`, `fetched_at`, and `api_version` are present; numeric spend and delivery fields must reflect returned Meta values. For demographics, inspect raw payload retention, `account_timezone`, age/gender dimensions, and confirm there are no fabricated hour fields.

## Idempotency gate

Only if the first post-write queries show no duplicates, rerun the **same two commands** once. Then run all four verification queries again.

Expected outcome: total row count and `distinct_insight_keys` remain unchanged; duplicate queries return zero rows. `fetched_at` and `updated_at` may refresh, and upserted values may reflect Meta revisions. Any duplicate result is a stop condition: do not proceed to a wider historical range.

## Data-quality summary queries

The following aggregate is valid for baseline delivery only. Hourly `reach` must not be summed as a unique seven-day audience figure because people can recur across hours.

```sql
select
  sum(spend) as total_spend,
  sum(impressions) as total_impressions,
  sum(clicks) as total_clicks,
  sum(link_clicks) as total_link_clicks,
  case when sum(impressions) > 0
    then round((sum(clicks)::numeric / sum(impressions)::numeric) * 100, 4)
  end as derived_ctr_percent,
  min((report_date + hour_start)::timestamp) filter (where impressions > 0 or spend > 0) as first_delivery_hour,
  max((report_date + hour_start)::timestamp) filter (where impressions > 0 or spend > 0) as last_delivery_hour
from public.meta_ads_hourly_performance_insights
where report_date between date '2026-08-26' and date '2026-09-01';

select
  report_date,
  age,
  gender,
  sum(spend) as spend,
  sum(impressions) as impressions,
  sum(clicks) as clicks
from public.meta_ads_daily_demographics
where report_date between date '2026-08-26' and date '2026-09-01'
group by report_date, age, gender
order by report_date, age, gender;
```

Do not add demographic totals to baseline totals: the demographics table is a separate distribution view, while the hourly baseline is authoritative for total spend, impressions, and clicks.

## Results for this execution

| Item | Result |
| --- | --- |
| Baseline rows before | NOT READ — credentials/project verification unavailable |
| Demographics rows before | NOT READ — credentials/project verification unavailable |
| Baseline backfill write | NOT RUN |
| Demographics backfill write | NOT RUN |
| Rows after | NOT READ |
| Duplicate check | NOT RUN |
| Idempotency rerun | NOT RUN |
| Meta/API errors | None observed; no request was made |
| Supabase errors | None observed; no request was made |

## Files changed and tests

- Created: `reports/meta-ads/2026-09-03-seven-day-production-backfill.md`
- Application/runtime files changed: none
- Code changes required for the requested range: none; both existing collectors already support `--since` and `--until`
- Tests run for this report-only safety gate: collector CLI range/help inspection and environment-name presence check. No production tests, SQL, Meta request, or Supabase request was run.

Commit hash at report creation: `c93787474d0c04c3703c0a00b492bda3527a96d3` (pending a report-only commit, if created).

## Final safety status

- Production Supabase modified: **NO**
- Existing app tables modified: **NO**
- Frontend affected: **NO**
- CRM affected: **NO**
- Orders affected: **NO**
- Stripe affected: **NO**
- Production Meta ingestion executed: **NO**

This task stops at the pre-write safety gate. Do not begin a wider backfill until this exact seven-day range has been written and re-read successfully in the owner-approved Production environment.
