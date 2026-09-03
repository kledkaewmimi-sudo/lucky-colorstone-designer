#!/usr/bin/env node
'use strict';

const { HOURLY_BREAKDOWN, BASELINE_INSIGHT_FIELDS, normalizeBaselineInsight, makeSupabaseUpsertRequest, isRateLimitResponse } = require('./lib/meta-ads-sync-core.js');

const GRAPH_HOST = 'https://graph.facebook.com';
const DEFAULT_API_VERSION = 'v24.0';
const MAX_RETRIES = 5;
const args = process.argv.slice(2);

function usage() {
  console.log(`Usage:
  node scripts/meta-ads-sync.js --date YYYY-MM-DD [--dry-run]
  node scripts/meta-ads-sync.js --since YYYY-MM-DD --until YYYY-MM-DD [--dry-run]

Required environment variables:
  META_AD_ACCOUNT_ID, META_ACCESS_TOKEN, META_API_VERSION (optional; defaults to ${DEFAULT_API_VERSION})
  META_ADS_SUPABASE_URL, META_ADS_SUPABASE_SERVICE_ROLE_KEY

The --dry-run option reads Meta but never writes to Supabase.`);
}

function option(name) { const index = args.indexOf(name); return index === -1 ? null : args[index + 1] || null; }
function isDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)); }
function fail(message) { throw new Error(message); }
function sleep(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }
function safeError(payload, fallback) { return String(payload?.error?.message || payload?.message || fallback || 'request failed').replace(/access_token=[^&\s]+/gi, 'access_token=[redacted]'); }

const DIAGNOSTIC_PARAMETER_NAMES = ['level', 'fields', 'breakdowns', 'action_breakdowns', 'action_report_time', 'time_range', 'time_increment', 'limit'];

function getSanitizedInsightsParameterMap(url) {
  const parameters = {};
  DIAGNOSTIC_PARAMETER_NAMES.forEach((name) => {
    const value = url.searchParams.get(name);
    if (name === 'action_breakdowns') {
      parameters[name] = value === null ? 'DEFAULT / OMITTED' : value === '[]' ? 'EXPLICIT EMPTY' : value.split(',');
    } else {
      parameters[name] = value === null ? '<absent>' : (name === 'fields' || name === 'breakdowns' ? value.split(',') : value);
    }
  });
  const explicitAdditionalParameters = {};
  url.searchParams.forEach((value, name) => {
    if (name !== 'access_token' && !DIAGNOSTIC_PARAMETER_NAMES.includes(name)) explicitAdditionalParameters[name] = value;
  });
  parameters.additional_parameters = explicitAdditionalParameters;
  return parameters;
}

function describeTransportError(error) {
  const code = String(error?.cause?.code || error?.code || '').toUpperCase();
  const name = String(error?.name || 'Error');
  if (name === 'AbortError' || code === 'ABORT_ERR') return 'aborted request';
  if (['ENOTFOUND', 'EAI_AGAIN'].includes(code)) return 'DNS/network failure';
  if (['ETIMEDOUT', 'ESOCKETTIMEDOUT'].includes(code)) return 'timeout';
  if (/CERT|TLS|SSL/.test(code) || /certificate|tls|ssl/i.test(String(error?.message || ''))) return 'TLS failure';
  return 'network failure';
}

function getBaselineRequestDiagnostics(config) {
  return getSanitizedInsightsParameterMap(buildBaselineInsightsUrl(config));
}

function buildBaselineInsightsUrl(config) {
  const insightsUrl = new URL(`${GRAPH_HOST}/${config.apiVersion}/${config.accountId}/insights`);
  insightsUrl.searchParams.set('level', 'ad');
  insightsUrl.searchParams.set('time_range', JSON.stringify({ since: config.since, until: config.until }));
  insightsUrl.searchParams.set('breakdowns', HOURLY_BREAKDOWN);
  insightsUrl.searchParams.set('fields', BASELINE_INSIGHT_FIELDS.join(','));
  insightsUrl.searchParams.set('limit', '500');
  insightsUrl.searchParams.set('access_token', config.accessToken);
  return insightsUrl;
}

function parseConfig(env = process.env) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const date = option('--date'), since = option('--since'), until = option('--until');
  if ((date && (since || until)) || (!date && !(since && until)) || !isDate(date || since) || !isDate(date || until)) fail('Specify either --date YYYY-MM-DD or --since YYYY-MM-DD --until YYYY-MM-DD.');
  if (since && since > until) fail('--since must not be after --until.');
  const accountId = String(env.META_AD_ACCOUNT_ID || '').trim();
  const accessToken = String(env.META_ACCESS_TOKEN || '').trim();
  const apiVersion = String(env.META_API_VERSION || DEFAULT_API_VERSION).trim();
  if (!/^v\d+\.\d+$/.test(apiVersion)) fail('META_API_VERSION must be formatted like v24.0.');
  if (!accountId || !accessToken) fail('META_AD_ACCOUNT_ID and META_ACCESS_TOKEN are required.');
  const supabaseUrl = String(env.META_ADS_SUPABASE_URL || '').trim();
  const supabaseKey = String(env.META_ADS_SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!args.includes('--dry-run') && (!supabaseUrl || !supabaseKey)) fail('META_ADS_SUPABASE_URL and META_ADS_SUPABASE_SERVICE_ROLE_KEY are required unless --dry-run is used.');
  return { accountId: accountId.startsWith('act_') ? accountId : `act_${accountId}`, accessToken, apiVersion, since: date || since, until: date || until, dryRun: args.includes('--dry-run'), supabaseUrl, supabaseKey };
}

async function metaRequest(url, config) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    let response;
    try {
      response = await fetch(url);
    } catch (error) {
      fail(`Meta transport failure (${describeTransportError(error)}): ${String(error?.message || 'fetch failed').replace(/access_token=[^&\s]+/gi, 'access_token=[redacted]')}`);
    }
    const text = await response.text();
    let payload;
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
    if (response.ok) return payload;
    if (isRateLimitResponse(response, payload) && attempt < MAX_RETRIES) {
      const retryAfter = Number(response.headers.get('retry-after'));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : Math.min(60000, 1000 * 2 ** attempt));
      continue;
    }
    fail(`Meta API request failed (${response.status}): ${safeError(payload, text)}`);
  }
}

async function getAllInsights(firstUrl, config) {
  const results = [];
  let url = firstUrl;
  while (url) {
    const page = await metaRequest(url, config);
    if (!Array.isArray(page.data)) fail('Meta Insights response did not contain a data array.');
    results.push(...page.data);
    url = page.paging?.next || null;
  }
  return results;
}

async function upsertRows(rows, config, table = 'meta_ads_hourly_performance_insights') {
  for (let start = 0; start < rows.length; start += 250) {
    const batch = rows.slice(start, start + 250);
    const request = makeSupabaseUpsertRequest(config.supabaseUrl, config.supabaseKey, batch, table);
    const response = await fetch(request.url, request.options);
    if (!response.ok) fail(`Supabase upsert failed (${response.status}): ${safeError(await response.json().catch(() => null), 'request failed')}`);
  }
}

async function main() {
  const config = parseConfig();
  if (config.help) return usage();
  if (config.dryRun) console.log(`Meta request: ${JSON.stringify(getBaselineRequestDiagnostics(config))}`);
  const accountUrl = new URL(`${GRAPH_HOST}/${config.apiVersion}/${config.accountId}`);
  accountUrl.searchParams.set('fields', 'id,timezone_name,timezone_offset_hours_utc');
  accountUrl.searchParams.set('access_token', config.accessToken);
  const account = await metaRequest(accountUrl, config);
  const accountTimezone = String(account.timezone_name || '').trim();
  if (!accountTimezone) fail('Meta account response omitted timezone_name; refusing to write hourly data without explicit timezone metadata.');
  const insightsUrl = buildBaselineInsightsUrl(config);
  const fetchedAt = new Date().toISOString();
  const insights = await getAllInsights(insightsUrl, config);
  const rows = insights.map((insight) => normalizeBaselineInsight(insight, { accountId: config.accountId, accountTimezone, apiVersion: config.apiVersion, fetchedAt }));
  if (!config.dryRun && rows.length > 0) await upsertRows(rows, config);
  console.log(JSON.stringify({ accountId: config.accountId, accountTimezone, since: config.since, until: config.until, insightsRead: insights.length, rowsWritten: config.dryRun ? 0 : rows.length, dryRun: config.dryRun }));
}

if (require.main === module) {
  main().catch((error) => { console.error(`meta-ads-sync failed: ${String(error.message || error).replace(/access_token=[^&\s]+/gi, 'access_token=[redacted]')}`); process.exitCode = 1; });
}

module.exports = { buildBaselineInsightsUrl, describeTransportError, getAllInsights, getBaselineRequestDiagnostics, getSanitizedInsightsParameterMap, metaRequest, parseConfig, upsertRows };

