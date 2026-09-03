'use strict';

const HOURLY_BREAKDOWN = 'hourly_stats_aggregated_by_advertiser_time_zone';
const PLACEMENT_BREAKDOWNS = ['publisher_platform', 'platform_position', 'device_platform'];
const INSIGHT_FIELDS = [
  'account_id', 'campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'ad_id', 'ad_name',
  'date_start', 'spend', 'impressions', 'reach', 'clicks', 'inline_link_clicks', 'ctr', 'cpc', 'cpm', 'frequency',
  'actions', 'action_values', HOURLY_BREAKDOWN, ...PLACEMENT_BREAKDOWNS
];

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

function makeSupabaseUpsertRequest(supabaseUrl, serviceRoleKey, rows) {
  const base = new URL(String(supabaseUrl).replace(/\/+$/, ''));
  const endpoint = new URL('/rest/v1/meta_ads_hourly_insights', base);
  endpoint.searchParams.set('on_conflict', 'insight_key');
  return {
    url: endpoint.toString(),
    options: { method: 'POST', headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) }
  };
}

function isRateLimitResponse(response, payload) {
  const code = Number(payload?.error?.code ?? payload?.code);
  return response?.status === 429 || [4, 17, 32, 613].includes(code);
}

module.exports = { HOURLY_BREAKDOWN, PLACEMENT_BREAKDOWNS, INSIGHT_FIELDS, parseHourStart, localHourToUtc, nullableNumber, normalizeInsight, insightKey, makeSupabaseUpsertRequest, isRateLimitResponse };
