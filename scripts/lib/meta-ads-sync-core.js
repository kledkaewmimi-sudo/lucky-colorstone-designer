'use strict';

const HOURLY_BREAKDOWN = 'hourly_stats_aggregated_by_advertiser_time_zone';
const PLACEMENT_BREAKDOWNS = ['publisher_platform', 'platform_position', 'device_platform'];
const CORE_INSIGHT_FIELDS = [
  'account_id', 'campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'ad_id', 'ad_name',
  'date_start', 'spend', 'impressions', 'reach', 'clicks', 'inline_link_clicks', 'ctr', 'cpc', 'cpm', 'frequency',
  'actions', 'action_values'
];
const ACTION_ARRAY_FIELDS = ['actions', 'action_values', 'outbound_clicks', 'outbound_clicks_ctr', 'cost_per_action_type'];
const SCALAR_INSIGHT_FIELDS = CORE_INSIGHT_FIELDS.filter((field) => !['actions', 'action_values'].includes(field));
const INSIGHT_FIELDS = [...CORE_INSIGHT_FIELDS, HOURLY_BREAKDOWN, ...PLACEMENT_BREAKDOWNS];
const RICH_TRAFFIC_FIELDS = ['unique_clicks', 'unique_ctr', 'outbound_clicks', 'outbound_clicks_ctr', 'cost_per_action_type'];
const BASELINE_INSIGHT_FIELDS = [...CORE_INSIGHT_FIELDS, ...RICH_TRAFFIC_FIELDS];
const VALIDATION_SCALAR_FIELDS = [...SCALAR_INSIGHT_FIELDS, 'unique_clicks', 'unique_ctr'];
const VIDEO_FIELDS = ['video_play_actions', 'video_thruplay_watched_actions', 'video_p25_watched_actions', 'video_p50_watched_actions', 'video_p75_watched_actions', 'video_p95_watched_actions', 'video_p100_watched_actions'];
const RANKING_FIELDS = ['quality_ranking', 'engagement_rate_ranking', 'conversion_rate_ranking'];
const ANALYTICS_COMMON_FIELDS = VALIDATION_SCALAR_FIELDS;
const ANALYTICS_DATASETS = {
  placement: { table: 'meta_ads_hourly_placement_insights', breakdowns: [...PLACEMENT_BREAKDOWNS], dimensions: ['publisher_platform', 'platform_position', 'device_platform', 'impression_device'] },
  demographics: { table: 'meta_ads_hourly_demographics', breakdowns: ['age', 'gender'], dimensions: ['age', 'gender'] },
  geo_country: { table: 'meta_ads_hourly_geo', breakdowns: ['country'], dimensions: ['country'], geoBreakdown: 'country' },
  geo_region: { table: 'meta_ads_hourly_geo', breakdowns: ['region'], dimensions: ['region'], geoBreakdown: 'region' },
  engagement: { table: 'meta_ads_hourly_engagement', breakdowns: [], dimensions: [], fields: [...ACTION_ARRAY_FIELDS, ...VIDEO_FIELDS, ...RANKING_FIELDS] }
};

function nonEmpty(value, fallback = null) {
  const result = String(value ?? '').trim();
  return result || fallback;
}

function nullableNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nullableInteger(value) {
  const number = nullableNumber(value);
  return number !== null && Number.isInteger(number) ? number : null;
}

function parseHourStart(value) {
  const match = /^(\d{2}):(\d{2}):(\d{2})\s*-\s*\d{2}:\d{2}:\d{2}$/.exec(String(value || '').trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3]);
  if (hour > 23 || minute > 59 || second > 59) return null;
  return `${match[1]}:${match[2]}:${match[3]}`;
}

function timezoneParts(date, timezone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });
  const values = Object.fromEntries(formatter.formatToParts(date)
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, part.value]));
  return values;
}

// Meta identifies an hourly report by advertiser-local date/hour. The API does
// not provide an offset for that bucket, so repeated DST hours cannot be mapped
// to one UTC instant without inventing data. Preserve the local key regardless.
function localHourToUtc(reportDate, hourStart, timezone) {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(reportDate || ''));
  if (!matched || !/^\d{2}:\d{2}:\d{2}$/.test(String(hourStart || ''))) return { utc: null, status: 'unavailable' };
  const target = `${reportDate} ${hourStart}`;
  let targetMillis;
  try {
    targetMillis = Date.UTC(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3]), ...hourStart.split(':').map(Number));
    // Iteratively solve local-time(UTC instant) = requested wall time.
    let candidate = targetMillis;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const parts = timezoneParts(new Date(candidate), timezone);
      const renderedMillis = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
      candidate += targetMillis - renderedMillis;
    }
    const candidates = [candidate - 3600000, candidate, candidate + 3600000]
      .filter((millis, index, list) => list.indexOf(millis) === index)
      .filter((millis) => {
        const parts = timezoneParts(new Date(millis), timezone);
        return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}` === target;
      });
    if (candidates.length === 1) return { utc: new Date(candidates[0]).toISOString(), status: 'exact' };
    return { utc: null, status: candidates.length > 1 ? 'ambiguous' : 'unavailable' };
  } catch (error) {
    if (error instanceof RangeError) return { utc: null, status: 'invalid_timezone' };
    throw error;
  }
}

function normalizeDimension(value) {
  return nonEmpty(value, 'unknown');
}

function insightKey(row) {
  return [row.account_id, row.report_date, row.hour_start, row.ad_id || 'account-level', row.publisher_platform, row.platform_position, row.device_platform].join('|');
}

function normalizeInsight(insight, { accountId, accountTimezone, apiVersion, fetchedAt = new Date().toISOString() }) {
  const reportDate = nonEmpty(insight?.date_start);
  const hourStart = parseHourStart(insight?.[HOURLY_BREAKDOWN]);
  if (!reportDate || !hourStart) throw new Error('Meta insight is missing a valid date_start or advertiser-timezone hourly breakdown.');
  const utc = localHourToUtc(reportDate, hourStart, accountTimezone);
  const row = {
    account_id: nonEmpty(insight.account_id, accountId), report_date: reportDate, hour_start: hourStart, account_timezone: accountTimezone,
    hour_start_utc: utc.utc, utc_conversion_status: utc.status,
    campaign_id: nonEmpty(insight.campaign_id), campaign_name: nonEmpty(insight.campaign_name),
    adset_id: nonEmpty(insight.adset_id), adset_name: nonEmpty(insight.adset_name), ad_id: nonEmpty(insight.ad_id), ad_name: nonEmpty(insight.ad_name),
    spend: nullableNumber(insight.spend), impressions: nullableInteger(insight.impressions), reach: nullableInteger(insight.reach),
    clicks: nullableInteger(insight.clicks), link_clicks: nullableInteger(insight.inline_link_clicks), ctr: nullableNumber(insight.ctr),
    cpc: nullableNumber(insight.cpc), cpm: nullableNumber(insight.cpm), frequency: nullableNumber(insight.frequency),
    publisher_platform: normalizeDimension(insight.publisher_platform), platform_position: normalizeDimension(insight.platform_position), device_platform: normalizeDimension(insight.device_platform),
    raw_actions: Array.isArray(insight.actions) ? insight.actions : null, raw_action_values: Array.isArray(insight.action_values) ? insight.action_values : null,
    raw_insight: insight, api_version: apiVersion, fetched_at: fetchedAt, updated_at: fetchedAt
  };
  row.insight_key = insightKey(row);
  return row;
}

// The performance baseline intentionally has no placement dimensions.  Keep it
// separate from the original placement-grain table so a total ad/hour cannot
// collide with, or be mistaken for, a placement row.
function normalizeBaselineInsight(insight, options) {
  const { publisher_platform, platform_position, device_platform, impression_device, ...row } = normalizeInsight(insight, options);
  row.unique_clicks = nullableInteger(insight.unique_clicks);
  row.unique_ctr = nullableNumber(insight.unique_ctr);
  row.raw_outbound_clicks = rawArray(insight.outbound_clicks);
  row.raw_outbound_clicks_ctr = rawArray(insight.outbound_clicks_ctr);
  row.raw_cost_per_action_type = rawArray(insight.cost_per_action_type);
  row.insight_key = [row.account_id, row.report_date, row.hour_start, row.ad_id || 'account-level'].join('|');
  return row;
}

function makeSupabaseUpsertRequest(supabaseUrl, serviceRoleKey, rows, table = 'meta_ads_hourly_insights') {
  const base = new URL(String(supabaseUrl).replace(/\/+$/, ''));
  if (!/^[a-z0-9_]+$/i.test(table)) throw new Error('Invalid Supabase table name.');
  const endpoint = new URL(`/rest/v1/${table}`, base);
  endpoint.searchParams.set('on_conflict', 'insight_key');
  return {
    url: endpoint.toString(),
    options: { method: 'POST', headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) }
  };
}

function rawArray(value) {
  return Array.isArray(value) ? value : null;
}

function normalizeAnalyticsInsight(insight, { dataset, accountId, accountTimezone, apiVersion, fetchedAt = new Date().toISOString() }) {
  const definition = ANALYTICS_DATASETS[dataset];
  if (!definition) throw new Error(`Unknown Meta analytics dataset '${dataset}'.`);
  const baseline = normalizeInsight(insight, { accountId, accountTimezone, apiVersion, fetchedAt });
  const row = {
    ...baseline,
    unique_clicks: nullableInteger(insight.unique_clicks), unique_ctr: nullableNumber(insight.unique_ctr),
    raw_outbound_clicks: rawArray(insight.outbound_clicks), raw_outbound_clicks_ctr: rawArray(insight.outbound_clicks_ctr),
    raw_cost_per_action_type: rawArray(insight.cost_per_action_type)
  };
  if (dataset === 'placement') {
    row.impression_device = normalizeDimension(insight.impression_device);
  } else if (dataset === 'demographics') {
    row.age = normalizeDimension(insight.age);
    row.gender = normalizeDimension(insight.gender);
  } else if (dataset === 'geo_country' || dataset === 'geo_region') {
    row.geo_breakdown = definition.geoBreakdown;
    row.country = normalizeDimension(insight.country);
    row.region = normalizeDimension(insight.region);
  } else if (dataset === 'engagement') {
    row.quality_ranking = nonEmpty(insight.quality_ranking);
    row.engagement_rate_ranking = nonEmpty(insight.engagement_rate_ranking);
    row.conversion_rate_ranking = nonEmpty(insight.conversion_rate_ranking);
    row.raw_video_metrics = Object.fromEntries(VIDEO_FIELDS.filter((field) => Object.hasOwn(insight, field)).map((field) => [field, insight[field]]));
  }
  const dimensions = definition.dimensions.map((field) => row[field] || 'unknown');
  row.insight_key = [row.account_id, row.report_date, row.hour_start, row.ad_id || 'account-level', dataset, ...dimensions].join('|');
  return row;
}

function normalizeDailyDemographicsInsight(insight, { accountId, accountTimezone, apiVersion, fetchedAt = new Date().toISOString() }) {
  const reportDate = nonEmpty(insight?.date_start);
  if (!reportDate) throw new Error('Meta daily insight is missing date_start.');
  const row = {
    account_id: nonEmpty(insight.account_id, accountId), report_date: reportDate, account_timezone: accountTimezone,
    campaign_id: nonEmpty(insight.campaign_id), campaign_name: nonEmpty(insight.campaign_name),
    adset_id: nonEmpty(insight.adset_id), adset_name: nonEmpty(insight.adset_name), ad_id: nonEmpty(insight.ad_id), ad_name: nonEmpty(insight.ad_name),
    age: normalizeDimension(insight.age), gender: normalizeDimension(insight.gender),
    spend: nullableNumber(insight.spend), impressions: nullableInteger(insight.impressions), reach: nullableInteger(insight.reach),
    clicks: nullableInteger(insight.clicks), link_clicks: nullableInteger(insight.inline_link_clicks), unique_clicks: nullableInteger(insight.unique_clicks),
    ctr: nullableNumber(insight.ctr), unique_ctr: nullableNumber(insight.unique_ctr), cpc: nullableNumber(insight.cpc), cpm: nullableNumber(insight.cpm), frequency: nullableNumber(insight.frequency),
    raw_insight: insight, api_version: apiVersion, fetched_at: fetchedAt, updated_at: fetchedAt
  };
  row.insight_key = [row.account_id, row.report_date, row.ad_id || 'account-level', 'demographics_daily', row.age, row.gender].join('|');
  return row;
}

function isRateLimitResponse(response, payload) {
  const code = Number(payload?.error?.code ?? payload?.code);
  return response?.status === 429 || [4, 17, 32, 613].includes(code);
}

module.exports = { HOURLY_BREAKDOWN, PLACEMENT_BREAKDOWNS, CORE_INSIGHT_FIELDS, SCALAR_INSIGHT_FIELDS, ACTION_ARRAY_FIELDS, INSIGHT_FIELDS, BASELINE_INSIGHT_FIELDS, RICH_TRAFFIC_FIELDS, VALIDATION_SCALAR_FIELDS, VIDEO_FIELDS, RANKING_FIELDS, ANALYTICS_COMMON_FIELDS, ANALYTICS_DATASETS, parseHourStart, localHourToUtc, nullableNumber, normalizeInsight, normalizeBaselineInsight, normalizeAnalyticsInsight, normalizeDailyDemographicsInsight, insightKey, makeSupabaseUpsertRequest, isRateLimitResponse };

