#!/usr/bin/env node
'use strict';

const { HOURLY_BREAKDOWN, ANALYTICS_COMMON_FIELDS, ANALYTICS_DATASETS, normalizeAnalyticsInsight } = require('./lib/meta-ads-sync-core.js');
const { getAllInsights, metaRequest, parseConfig, upsertRows } = require('./meta-ads-sync.js');

const GRAPH_HOST = 'https://graph.facebook.com';
const DATASET_NAMES = Object.keys(ANALYTICS_DATASETS);
const args = process.argv.slice(2);

function option(name) { const index = args.indexOf(name); return index === -1 ? null : args[index + 1] || null; }
function usage() {
  console.log(`Usage:
  node scripts/meta-ads-analytics-sync.js --date YYYY-MM-DD [--datasets placement,demographics,geo_country,geo_region,engagement] [--include-impression-device] [--dry-run]
  node scripts/meta-ads-analytics-sync.js --since YYYY-MM-DD --until YYYY-MM-DD [--datasets placement,demographics,geo_country,geo_region,engagement] [--include-impression-device] [--dry-run]

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

async function syncDataset(name, config, accountTimezone, includeImpressionDevice) {
  const definition = ANALYTICS_DATASETS[name];
  const breakdowns = [HOURLY_BREAKDOWN, ...definition.breakdowns];
  if (name === 'placement' && includeImpressionDevice) breakdowns.push('impression_device');
  const url = new URL(`${GRAPH_HOST}/${config.apiVersion}/${config.accountId}/insights`);
  url.searchParams.set('level', 'ad');
  url.searchParams.set('time_range', JSON.stringify({ since: config.since, until: config.until }));
  url.searchParams.set('breakdowns', breakdowns.join(','));
  url.searchParams.set('fields', fieldsForDataset(name).join(','));
  url.searchParams.set('limit', '500');
  url.searchParams.set('access_token', config.accessToken);
  const fetchedAt = new Date().toISOString();
  const insights = await getAllInsights(url, config);
  const rows = insights.map((insight) => normalizeAnalyticsInsight(insight, { dataset: name, accountId: config.accountId, accountTimezone, apiVersion: config.apiVersion, fetchedAt }));
  if (!config.dryRun && rows.length > 0) await upsertRows(rows, config, definition.table);
  return { dataset: name, table: definition.table, breakdowns, insightsRead: insights.length, rowsWritten: config.dryRun ? 0 : rows.length };
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

module.exports = { fieldsForDataset, selectedDatasets, syncDataset };
