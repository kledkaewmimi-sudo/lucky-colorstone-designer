#!/usr/bin/env node
'use strict';

const { HOURLY_BREAKDOWN, ANALYTICS_COMMON_FIELDS, ANALYTICS_DATASETS, normalizeAnalyticsInsight, normalizeDailyDemographicsInsight } = require('./lib/meta-ads-sync-core.js');
const { getAllInsights, getSanitizedInsightsParameterMap, metaRequest, parseConfig, upsertRows } = require('./meta-ads-sync.js');

const GRAPH_HOST = 'https://graph.facebook.com';
const DATASET_NAMES = Object.keys(ANALYTICS_DATASETS);
const DIMENSION_DATASETS = new Set(['placement', 'demographics', 'geo_country', 'geo_region']);
const PLACEMENT_STAGES = {
  publisher: ['publisher_platform'],
  position: ['publisher_platform', 'platform_position'],
  device: ['publisher_platform', 'platform_position', 'device_platform']
};
const DEMOGRAPHICS_STAGES = { age: ['age'], gender: ['gender'], age_gender: ['age', 'gender'] };
const args = process.argv.slice(2);

function option(name) { const index = args.indexOf(name); return index === -1 ? null : args[index + 1] || null; }
function usage() {
  console.log(`Usage:
  node scripts/meta-ads-analytics-sync.js --date YYYY-MM-DD [--datasets placement,demographics,geo_country,geo_region,engagement] [--include-impression-device] [--dry-run]
  node scripts/meta-ads-analytics-sync.js --since YYYY-MM-DD --until YYYY-MM-DD [--datasets placement,demographics,geo_country,geo_region,engagement] [--granularity hourly|daily] [--placement-stage publisher|position|device] [--demographics-stage age|gender|age_gender] [--include-impression-device] [--dry-run]

This is an isolated multi-pass collector. It never starts a scheduler or changes application APIs.
--include-impression-device is opt-in because its live compatibility with the placement/hourly combination must be validated for the target account.`);
}

function selectedDatasets() {
  const value = option('--datasets');
  if (!value) return DATASET_NAMES;
  const selected = value.split(',').map((entry) => entry.trim()).filter(Boolean);
  const unknown = selected.filter((entry) => !DATASET_NAMES.includes(entry));
  if (unknown.length > 0 || selected.length === 0) throw new Error(`Unknown or empty dataset selection: ${unknown.join(',') || value}`);
  return [...new Set(selected)];
}

function fieldsForDataset(name) {
  const definition = ANALYTICS_DATASETS[name];
  return [...new Set([...ANALYTICS_COMMON_FIELDS, ...(definition.fields || [])])];
}

function placementBreakdowns() {
  const stage = option('--placement-stage') || 'device';
  if (!PLACEMENT_STAGES[stage]) throw new Error(`Unknown placement stage '${stage}'. Use publisher, position, or device.`);
  return PLACEMENT_STAGES[stage];
}

function demographicsBreakdowns() {
  const stage = option('--demographics-stage') || 'age_gender';
  if (!DEMOGRAPHICS_STAGES[stage]) throw new Error(`Unknown demographics stage '${stage}'. Use age, gender, or age_gender.`);
  return DEMOGRAPHICS_STAGES[stage];
}

function granularityBreakdown() {
  const granularity = option('--granularity') || 'hourly';
  if (granularity === 'hourly') return HOURLY_BREAKDOWN;
  if (granularity === 'daily') return null;
  throw new Error(`Unknown granularity '${granularity}'. Use hourly or daily.`);
}

function targetTableForDataset(dataset, granularity) {
  if (granularity === 'hourly') return ANALYTICS_DATASETS[dataset].table;
  if (dataset === 'demographics') return 'meta_ads_daily_demographics';
  throw new Error(`Daily ${dataset} is not implemented. Only daily demographics is currently supported.`);
}

function buildAnalyticsInsightsUrl({ config, fields, breakdowns }) {
  const url = new URL(`${GRAPH_HOST}/${config.apiVersion}/${config.accountId}/insights`);
  url.searchParams.set('level', 'ad');
  url.searchParams.set('time_range', JSON.stringify({ since: config.since, until: config.until }));
  if (breakdowns.length > 0) url.searchParams.set('breakdowns', breakdowns.join(','));
  url.searchParams.set('fields', fields.join(','));
  // Meta v26 treats omitted action_breakdowns as its default action_type.
  // A dimension-only pass must send an explicit empty list, not a blank value.
  if (DIMENSION_DATASETS.has(config.dataset)) url.searchParams.set('action_breakdowns', '[]');
  url.searchParams.set('limit', '500');
  url.searchParams.set('access_token', config.accessToken);
  return url;
}

function getAnalyticsRequestDiagnostics({ dataset, url }) {
  return { dataset, granularity: url.searchParams.get('breakdowns')?.includes(HOURLY_BREAKDOWN) ? 'hourly' : 'daily', target_table: url.__targetTable, ...getSanitizedInsightsParameterMap(url) };
}

async function syncDataset(name, config, accountTimezone, includeImpressionDevice) {
  const definition = ANALYTICS_DATASETS[name];
  const datasetBreakdowns = name === 'placement' ? placementBreakdowns() : name === 'demographics' ? demographicsBreakdowns() : definition.breakdowns;
  const hourlyBreakdown = granularityBreakdown();
  const granularity = hourlyBreakdown ? 'hourly' : 'daily';
  const table = targetTableForDataset(name, granularity);
  const breakdowns = [...(hourlyBreakdown ? [hourlyBreakdown] : []), ...datasetBreakdowns];
  if (name === 'placement' && includeImpressionDevice) breakdowns.push('impression_device');
  const fields = fieldsForDataset(name);
  const url = buildAnalyticsInsightsUrl({ config: { ...config, dataset: name }, fields, breakdowns });
  url.__targetTable = table;
  if (config.dryRun) console.log(`Meta request: ${JSON.stringify(getAnalyticsRequestDiagnostics({ dataset: name, url }))}`);
  const fetchedAt = new Date().toISOString();
  const insights = await getAllInsights(url, config);
  const rows = insights.map((insight) => granularity === 'daily'
    ? normalizeDailyDemographicsInsight(insight, { accountId: config.accountId, accountTimezone, apiVersion: config.apiVersion, fetchedAt })
    : normalizeAnalyticsInsight(insight, { dataset: name, accountId: config.accountId, accountTimezone, apiVersion: config.apiVersion, fetchedAt }));
  if (!config.dryRun && rows.length > 0) await upsertRows(rows, config, table);
  return { dataset: name, granularity, table, breakdowns, insightsRead: insights.length, rowsWritten: config.dryRun ? 0 : rows.length };
}

async function main() {
  if (args.includes('--help') || args.includes('-h')) return usage();
  const config = parseConfig();
  const accountUrl = new URL(`${GRAPH_HOST}/${config.apiVersion}/${config.accountId}`);
  accountUrl.searchParams.set('fields', 'id,timezone_name,timezone_offset_hours_utc');
  accountUrl.searchParams.set('access_token', config.accessToken);
  const account = await metaRequest(accountUrl, config);
  const accountTimezone = String(account.timezone_name || '').trim();
  if (!accountTimezone) throw new Error('Meta account response omitted timezone_name; refusing to write hourly data without explicit timezone metadata.');
  const results = [];
  for (const dataset of selectedDatasets()) results.push(await syncDataset(dataset, config, accountTimezone, args.includes('--include-impression-device')));
  console.log(JSON.stringify({ accountId: config.accountId, accountTimezone, since: config.since, until: config.until, dryRun: config.dryRun, results }));
}

if (require.main === module) {
  main().catch((error) => { console.error(`meta-ads-analytics-sync failed: ${String(error.message || error).replace(/access_token=[^&\s]+/gi, 'access_token=[redacted]')}`); process.exitCode = 1; });
}

module.exports = { buildAnalyticsInsightsUrl, demographicsBreakdowns, DIMENSION_DATASETS, fieldsForDataset, getAnalyticsRequestDiagnostics, granularityBreakdown, placementBreakdowns, selectedDatasets, syncDataset, targetTableForDataset };
