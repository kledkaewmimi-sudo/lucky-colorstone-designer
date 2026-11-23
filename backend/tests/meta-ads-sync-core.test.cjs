'use strict';

const assert = require('node:assert/strict');
const { HOURLY_BREAKDOWN, ACTION_ARRAY_FIELDS, BASELINE_INSIGHT_FIELDS, ANALYTICS_COMMON_FIELDS, parseHourStart, localHourToUtc, nullableNumber, normalizeInsight, normalizeBaselineInsight, normalizeAnalyticsInsight, normalizeDailyDemographicsInsight, makeSupabaseUpsertRequest, isRateLimitResponse } = require('../scripts/lib/meta-ads-sync-core.js');
const { buildBaselineInsightsUrl, describeTransportError, getAllInsights, getBaselineRequestDiagnostics, metaRequest } = require('../scripts/meta-ads-sync.js');
const { buildAnalyticsInsightsUrl, demographicsBreakdowns, fieldsForDataset, getAnalyticsRequestDiagnostics, granularityBreakdown, placementBreakdowns, syncDataset, targetTableForDataset } = require('../scripts/meta-ads-analytics-sync.js');

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
['publisher_platform', 'platform_position', 'device_platform', 'impression_device'].forEach((field) => assert.equal(Object.hasOwn(baseline, field), false, `baseline must omit ${field}`));
// Production Ads tables already exist; keep the runtime promotion free of
// migration files while retaining the baseline upsert schema contract.
const baselineTableColumns = new Set([
  'insight_key', 'account_id', 'report_date', 'hour_start', 'account_timezone',
  'hour_start_utc', 'utc_conversion_status', 'campaign_id', 'campaign_name',
  'adset_id', 'adset_name', 'ad_id', 'ad_name', 'spend', 'impressions', 'reach',
  'clicks', 'link_clicks', 'unique_clicks', 'ctr', 'unique_ctr', 'cpc', 'cpm',
  'frequency', 'raw_outbound_clicks', 'raw_outbound_clicks_ctr', 'raw_actions',
  'raw_action_values', 'raw_cost_per_action_type', 'raw_insight', 'api_version',
  'fetched_at', 'created_at', 'updated_at'
]);
Object.keys(baseline).forEach((field) => assert.equal(baselineTableColumns.has(field), true, `baseline payload key ${field} must exist in the baseline table contract`));
assert.equal(BASELINE_INSIGHT_FIELDS.includes('publisher_platform'), false);
assert.equal(BASELINE_INSIGHT_FIELDS.includes('unique_clicks'), true);
assert.equal(BASELINE_INSIGHT_FIELDS.includes(HOURLY_BREAKDOWN), false);
assert.equal(ANALYTICS_COMMON_FIELDS.includes(HOURLY_BREAKDOWN), false);
const diagnostics = getBaselineRequestDiagnostics({ accountId: 'act_7', apiVersion: 'v26.0', since: '2026-09-01', until: '2026-09-01', accessToken: 'do-not-print' });
assert.deepEqual(diagnostics.breakdowns, [HOURLY_BREAKDOWN]);
assert.equal(diagnostics.fields.includes(HOURLY_BREAKDOWN), false);
assert.equal(diagnostics.breakdowns.some((value) => ['publisher_platform', 'platform_position', 'device_platform'].includes(value)), false);
assert.equal(diagnostics.action_breakdowns, 'DEFAULT / OMITTED');
assert.equal(diagnostics.action_report_time, '<absent>');
assert.equal(diagnostics.time_increment, '<absent>');
assert.deepEqual(diagnostics.additional_parameters, {});
assert.equal(JSON.stringify(diagnostics).includes('do-not-print'), false);
const baselineUrl = buildBaselineInsightsUrl({ accountId: 'act_7', accessToken: 'do-not-print', apiVersion: 'v26.0', since: '2026-09-01', until: '2026-09-01' });
assert.equal(baselineUrl.searchParams.get('level'), 'ad');
assert.deepEqual(JSON.parse(baselineUrl.searchParams.get('time_range')), { since: '2026-09-01', until: '2026-09-01' });
assert.equal(baselineUrl.searchParams.get('breakdowns'), HOURLY_BREAKDOWN);
assert.equal(baselineUrl.searchParams.get('fields').includes(HOURLY_BREAKDOWN), false);
['placement', 'demographics', 'geo_country', 'geo_region'].forEach((dataset) => {
  const fields = fieldsForDataset(dataset);
  ACTION_ARRAY_FIELDS.forEach((field) => assert.equal(fields.includes(field), false, `${dataset} must exclude ${field}`));
});
assert.deepEqual(placementBreakdowns(), ['publisher_platform', 'platform_position', 'device_platform']);
assert.deepEqual(demographicsBreakdowns(), ['age', 'gender']);
assert.equal(granularityBreakdown(), HOURLY_BREAKDOWN);
const analyticsUrl = buildAnalyticsInsightsUrl({ fields: fieldsForDataset('placement'), breakdowns: [HOURLY_BREAKDOWN, 'publisher_platform'], config: { dataset: 'placement', accountId: 'act_7', apiVersion: 'v26.0', since: '2026-09-01', until: '2026-09-01', accessToken: 'do-not-print' } });
const analyticsDiagnostics = getAnalyticsRequestDiagnostics({ dataset: 'placement', url: analyticsUrl });
assert.equal(JSON.stringify(analyticsDiagnostics).includes('do-not-print'), false);
assert.equal(analyticsDiagnostics.breakdowns.includes('action_type'), false);
assert.equal(analyticsDiagnostics.action_breakdowns, 'EXPLICIT EMPTY');
assert.equal(analyticsDiagnostics.action_report_time, '<absent>');
assert.equal(analyticsDiagnostics.time_increment, '<absent>');
assert.deepEqual(analyticsDiagnostics.additional_parameters, {});
['demographics', 'geo_country', 'geo_region'].forEach((dataset) => {
  const url = buildAnalyticsInsightsUrl({ fields: fieldsForDataset(dataset), breakdowns: [HOURLY_BREAKDOWN], config: { dataset, accountId: 'act_7', apiVersion: 'v26.0', since: '2026-09-01', until: '2026-09-01', accessToken: 'do-not-print' } });
  assert.equal(url.searchParams.get('action_breakdowns'), '[]');
});
const engagementUrl = buildAnalyticsInsightsUrl({ fields: fieldsForDataset('engagement'), breakdowns: [HOURLY_BREAKDOWN], config: { dataset: 'engagement', accountId: 'act_7', apiVersion: 'v26.0', since: '2026-09-01', until: '2026-09-01', accessToken: 'do-not-print' } });
assert.equal(engagementUrl.searchParams.get('action_breakdowns'), null);
assert.equal(engagementUrl.searchParams.get('fields').includes('video_p100_watched_actions'), true);
assert.equal(targetTableForDataset('demographics', 'daily'), 'meta_ads_daily_demographics');
assert.equal(targetTableForDataset('demographics', 'hourly'), 'meta_ads_hourly_demographics');
assert.throws(() => targetTableForDataset('geo_country', 'daily'), /Only daily demographics/);
const daily = normalizeDailyDemographicsInsight({ ...raw, age: '25-34', gender: 'female', [HOURLY_BREAKDOWN]: undefined }, { accountId: 'act_7', accountTimezone: 'Asia/Bangkok', apiVersion: 'v26.0' });
assert.equal(Object.hasOwn(daily, 'hour_start'), false);
assert.equal(Object.hasOwn(daily, 'hour_start_utc'), false);
assert.equal(daily.insight_key.includes('|09:00:00|'), false);
assert.notEqual(daily.insight_key, 'act_7|2026-09-01|09:00:00|ad-9|demographics|25-34|female');
assert.deepEqual(daily.raw_insight.age, '25-34');
assert.throws(() => normalizeDailyDemographicsInsight({ ...raw, date_start: null }, { accountId: 'act_7', accountTimezone: 'Asia/Bangkok', apiVersion: 'v26.0' }), /missing date_start/);
assert.equal(describeTransportError({ cause: { code: 'ENOTFOUND' } }), 'DNS/network failure');
assert.equal(describeTransportError({ cause: { code: 'ETIMEDOUT' } }), 'timeout');
assert.equal(describeTransportError({ cause: { code: 'CERT_HAS_EXPIRED' } }), 'TLS failure');
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
    global.fetch = async () => { const error = new TypeError('fetch failed'); error.cause = { code: 'ENOTFOUND' }; throw error; };
    await assert.rejects(() => metaRequest('https://example.test/transport', {}), /Meta transport failure \(DNS\/network failure\): fetch failed/);
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
    assert.deepEqual(result, { dataset: 'geo_country', granularity: 'hourly', table: 'meta_ads_hourly_geo', breakdowns: [HOURLY_BREAKDOWN, 'country'], insightsRead: 0, rowsWritten: 0 });
  } finally {
    global.fetch = originalFetch;
  }
}

testCollectorTransport().then(testExpandedDatasets).then(() => console.log('meta-ads-sync-core.test.cjs passed')).catch((error) => { console.error(error); process.exitCode = 1; });
