'use strict';

const assert = require('node:assert/strict');
const { HOURLY_BREAKDOWN, BASELINE_INSIGHT_FIELDS, parseHourStart, localHourToUtc, nullableNumber, normalizeInsight, normalizeBaselineInsight, normalizeAnalyticsInsight, makeSupabaseUpsertRequest, isRateLimitResponse } = require('../scripts/lib/meta-ads-sync-core.js');
const { getAllInsights, metaRequest } = require('../scripts/meta-ads-sync.js');
const { fieldsForDataset, syncDataset } = require('../scripts/meta-ads-analytics-sync.js');

assert.equal(parseHourStart('09:00:00 - 09:59:59'), '09:00:00');
assert.equal(parseHourStart('24:00:00 - 24:59:59'), null);
assert.equal(parseHourStart(null), null);
assert.deepEqual(localHourToUtc('2026-09-01', '09:00:00', 'Asia/Bangkok'), { utc: '2026-09-01T02:00:00.000Z', status: 'exact' });
assert.equal(localHourToUtc('2026-11-01', '01:00:00', 'America/New_York').status, 'ambiguous');
assert.equal(nullableNumber('12.3400'), 12.34);
assert.equal(nullableNumber(''), null);
assert.equal(nullableNumber('not-a-number'), null);

const raw = { account_id: 'act_7', date_start: '2026-09-01', ad_id: 'ad-9', spend: '10.50', impressions: '120', clicks: '4', inline_link_clicks: null, ctr: '3.333', actions: [{ action_type: 'purchase', value: '2' }], action_values: [{ action_type: 'purchase', value: '100.5' }], [HOURLY_BREAKDOWN]: '09:00:00 - 09:59:59', publisher_platform: 'instagram', platform_position: 'stream', device_platform: 'mobile' };
const row = normalizeInsight(raw, { accountId: 'act_7', accountTimezone: 'Asia/Bangkok', apiVersion: 'v24.0', fetchedAt: '2026-09-01T03:00:00.000Z' });
assert.equal(row.spend, 10.5);
assert.equal(row.link_clicks, null);
assert.deepEqual(row.raw_actions, raw.actions);
assert.equal(row.insight_key, 'act_7|2026-09-01|09:00:00|ad-9|instagram|stream|mobile');
const baseline = normalizeBaselineInsight({ ...raw, unique_clicks: '3', outbound_clicks: [{ action_type: 'outbound_click', value: '2' }] }, { accountId: 'act_7', accountTimezone: 'Asia/Bangkok', apiVersion: 'v26.0' });
assert.equal(baseline.insight_key, 'act_7|2026-09-01|09:00:00|ad-9');
assert.equal(baseline.unique_clicks, 3);
assert.deepEqual(baseline.raw_outbound_clicks, [{ action_type: 'outbound_click', value: '2' }]);
assert.equal(BASELINE_INSIGHT_FIELDS.includes('publisher_platform'), false);
assert.equal(BASELINE_INSIGHT_FIELDS.includes('unique_clicks'), true);
assert.deepEqual(normalizeInsight({ ...raw, publisher_platform: null, platform_position: null, device_platform: null }, { accountId: 'act_7', accountTimezone: 'Asia/Bangkok', apiVersion: 'v24.0' }).insight_key, 'act_7|2026-09-01|09:00:00|ad-9|unknown|unknown|unknown');
assert.throws(() => normalizeInsight({ ...raw, [HOURLY_BREAKDOWN]: null }, { accountId: 'act_7', accountTimezone: 'Asia/Bangkok', apiVersion: 'v24.0' }), /hourly breakdown/);

const request = makeSupabaseUpsertRequest('https://example.supabase.co/', 'secret', [row]);
assert.match(request.url, /on_conflict=insight_key/);
assert.equal(request.options.headers.Prefer, 'resolution=merge-duplicates,return=minimal');
assert.equal(isRateLimitResponse({ status: 429 }, {}), true);
assert.equal(isRateLimitResponse({ status: 400 }, { error: { code: 613 } }), true);
assert.equal(isRateLimitResponse({ status: 400 }, { error: { code: 100 } }), false);
assert.deepEqual(JSON.parse(request.options.body), [row]);

async function testCollectorTransport() {
  const originalFetch = global.fetch;
  try {
    const pages = [
      new Response(JSON.stringify({ data: [{ id: 'first' }], paging: { next: 'https://example.test/page-2' } }), { status: 200 }),
      new Response(JSON.stringify({ data: [{ id: 'second' }] }), { status: 200 })
    ];
    global.fetch = async () => pages.shift();
    assert.deepEqual(await getAllInsights('https://example.test/page-1', {}), [{ id: 'first' }, { id: 'second' }]);

    global.fetch = async () => new Response(JSON.stringify({ data: [] }), { status: 200 });
    assert.deepEqual(await getAllInsights('https://example.test/empty', {}), []);

    global.fetch = async () => new Response(JSON.stringify({ error: { code: 100, message: 'invalid field' } }), { status: 400 });
    await assert.rejects(() => metaRequest('https://example.test/failure', {}), /Meta API request failed \(400\): invalid field/);
  } finally {
    global.fetch = originalFetch;
  }
}

async function testExpandedDatasets() {
  const demographics = normalizeAnalyticsInsight({ ...raw, age: '25-34', gender: 'female', unique_clicks: '3', unique_ctr: '2.5', outbound_clicks: [{ action_type: 'outbound_click', value: '2' }], cost_per_action_type: [{ action_type: 'link_click', value: '5.25' }] }, { dataset: 'demographics', accountId: 'act_7', accountTimezone: 'Asia/Bangkok', apiVersion: 'v24.0' });
  assert.equal(demographics.age, '25-34');
  assert.equal(demographics.gender, 'female');
  assert.equal(demographics.unique_clicks, 3);
  assert.deepEqual(demographics.raw_outbound_clicks, [{ action_type: 'outbound_click', value: '2' }]);
  assert.notEqual(demographics.insight_key, normalizeAnalyticsInsight({ ...raw, age: '35-44', gender: 'female' }, { dataset: 'demographics', accountId: 'act_7', accountTimezone: 'Asia/Bangkok', apiVersion: 'v24.0' }).insight_key);

  const country = normalizeAnalyticsInsight({ ...raw, country: 'TH' }, { dataset: 'geo_country', accountId: 'act_7', accountTimezone: 'Asia/Bangkok', apiVersion: 'v24.0' });
  const region = normalizeAnalyticsInsight({ ...raw, region: 'Bangkok' }, { dataset: 'geo_region', accountId: 'act_7', accountTimezone: 'Asia/Bangkok', apiVersion: 'v24.0' });
  assert.equal(country.geo_breakdown, 'country');
  assert.equal(region.geo_breakdown, 'region');
  assert.notEqual(country.insight_key, region.insight_key);

  const placement = normalizeAnalyticsInsight({ ...raw, impression_device: 'iPhone' }, { dataset: 'placement', accountId: 'act_7', accountTimezone: 'Asia/Bangkok', apiVersion: 'v24.0' });
  assert.equal(placement.impression_device, 'iPhone');
  const engagement = normalizeAnalyticsInsight({ ...raw, quality_ranking: 'AVERAGE', video_p75_watched_actions: [{ action_type: 'video_view', value: '6' }] }, { dataset: 'engagement', accountId: 'act_7', accountTimezone: 'Asia/Bangkok', apiVersion: 'v24.0' });
  assert.equal(engagement.quality_ranking, 'AVERAGE');
  assert.deepEqual(engagement.raw_video_metrics.video_p75_watched_actions, [{ action_type: 'video_view', value: '6' }]);
  assert.match(fieldsForDataset('engagement').join(','), /video_p100_watched_actions/);

  const originalFetch = global.fetch;
  try {
    global.fetch = async () => new Response(JSON.stringify({ data: [] }), { status: 200 });
    const result = await syncDataset('geo_country', { accountId: 'act_7', accessToken: 'test', apiVersion: 'v24.0', since: '2026-09-01', until: '2026-09-01', dryRun: true }, 'Asia/Bangkok', false);
    assert.deepEqual(result, { dataset: 'geo_country', table: 'meta_ads_hourly_geo', breakdowns: [HOURLY_BREAKDOWN, 'country'], insightsRead: 0, rowsWritten: 0 });
  } finally {
    global.fetch = originalFetch;
  }
}

testCollectorTransport().then(testExpandedDatasets).then(() => console.log('meta-ads-sync-core.test.cjs passed')).catch((error) => { console.error(error); process.exitCode = 1; });
