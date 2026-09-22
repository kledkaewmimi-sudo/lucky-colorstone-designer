#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');
const MAX_RANGE_DAYS = 31;
const REQUIRED = ['META_AD_ACCOUNT_ID', 'META_ACCESS_TOKEN', 'META_API_VERSION', 'META_ADS_SUPABASE_URL', 'META_ADS_SUPABASE_SERVICE_ROLE_KEY'];
const MODES = new Set(['both', 'hourly', 'demographics']);

function redact(value) { return String(value ?? '').replace(/access_token=([^&\s]+)/gi, 'access_token=[redacted]').replace(/(authorization\s*[:=]\s*(?:bearer\s+)?)\S+/gi, '$1[redacted]').replace(/(apikey\s*[:=]\s*)\S+/gi, '$1[redacted]'); }
function option(argv, name) { const index = argv.indexOf(name); return index < 0 ? null : argv[index + 1] || null; }
function isCalendarDate(value) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '')); if (!m) return false; const d = new Date(`${value}T00:00:00.000Z`); return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() + 1 === Number(m[2]) && d.getUTCDate() === Number(m[3]); }
function daysInclusive(fromDate, toDate) { return Math.floor((Date.parse(`${toDate}T00:00:00.000Z`) - Date.parse(`${fromDate}T00:00:00.000Z`)) / 86400000) + 1; }
function dateAt(fromDate, index) { const date = new Date(`${fromDate}T00:00:00.000Z`); date.setUTCDate(date.getUTCDate() + index); return date.toISOString().slice(0, 10); }
function sanitizeAccountId(value) { const id = String(value || '').replace(/^act_/, ''); return id ? `act_***${id.slice(-4)}` : 'act_[missing]'; }
function parseManualConfig(argv = process.argv.slice(2), env = process.env) {
  const fromDate = option(argv, '--from-date'), toDate = option(argv, '--to-date'), mode = option(argv, '--mode') || 'both', dryRun = argv.includes('--dry-run');
  if (!isCalendarDate(fromDate) || !isCalendarDate(toDate)) throw new Error('--from-date and --to-date must be real YYYY-MM-DD dates.');
  if (fromDate > toDate) throw new Error('--from-date must not be after --to-date.');
  if (daysInclusive(fromDate, toDate) > MAX_RANGE_DAYS) throw new Error(`Requested range exceeds the ${MAX_RANGE_DAYS}-day manual safety limit.`);
  if (!MODES.has(mode)) throw new Error('--mode must be both, hourly, or demographics.');
  const missing = (dryRun ? REQUIRED.slice(0, 3) : REQUIRED).filter((name) => !String(env[name] || '').trim());
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  const apiVersion = String(env.META_API_VERSION).trim(); if (!/^v\d+\.\d+$/.test(apiVersion)) throw new Error('META_API_VERSION must be formatted like v26.0.');
  const id = String(env.META_AD_ACCOUNT_ID).trim(); return { fromDate, toDate, mode, dryRun, apiVersion, accountId: id.startsWith('act_') ? id : `act_${id}` };
}
async function metaAuthCheck(config, env = process.env, fetchImpl = fetch) {
  const url = new URL(`https://graph.facebook.com/${config.apiVersion}/${config.accountId}`); url.searchParams.set('fields', 'id,timezone_name,timezone_offset_hours_utc'); url.searchParams.set('access_token', env.META_ACCESS_TOKEN);
  let response; try { response = await fetchImpl(url); } catch (error) { return { ok: false, classification: 'TRANSPORT', httpStatus: null, errorType: null, errorCode: null, errorSubcode: null, message: redact(error?.message || 'network failure') }; }
  const text = await response.text(); let body = {}; try { body = text ? JSON.parse(text) : {}; } catch { body = {}; } const error = body.error || body;
  if (!response.ok) return { ok: false, classification: Number(error?.code) === 190 ? 'AUTH/TOKEN' : 'META_API', httpStatus: response.status, errorType: error?.type || null, errorCode: error?.code ?? null, errorSubcode: error?.error_subcode ?? null, message: redact(error?.message || 'Meta account check failed') };
  const timezone = String(body.timezone_name || '').trim(); return timezone ? { ok: true, httpStatus: response.status, timezone } : { ok: false, classification: 'META_API', httpStatus: response.status, errorType: null, errorCode: null, errorSubcode: null, message: 'Meta account check omitted timezone_name.' };
}
function commandFor(dataset, date, dryRun) { const args = dataset === 'hourly' ? [path.join(__dirname, 'meta-ads-sync.js'), '--since', date, '--until', date] : [path.join(__dirname, 'meta-ads-analytics-sync.js'), '--since', date, '--until', date, '--datasets', 'demographics', '--demographics-stage', 'age_gender', '--granularity', 'daily']; if (dryRun) args.push('--dry-run'); return { executable: process.execPath, args }; }
function run(command, env) { return new Promise((resolve) => { const child = spawn(command.executable, command.args, { env, stdio: ['ignore', 'pipe', 'pipe'] }); let output = ''; child.stdout.on('data', (part) => { output += part; }); child.stderr.on('data', (part) => { output += part; }); child.on('error', (error) => resolve({ ok: false, code: null, output: redact(error.message) })); child.on('exit', (code) => resolve({ ok: code === 0, code, output: redact(output) })); }); }
async function databaseSummary(dataset, date, env = process.env, fetchImpl = fetch) {
  const table = dataset === 'hourly' ? 'meta_ads_hourly_performance_insights' : 'meta_ads_daily_demographics';
  const url = new URL(`/rest/v1/${table}`, String(env.META_ADS_SUPABASE_URL).replace(/\/+$/, '') + '/');
  url.searchParams.set('select', 'insight_key'); url.searchParams.set('report_date', `eq.${date}`); url.searchParams.set('limit', '1000');
  try { const response = await fetchImpl(url, { headers: { apikey: env.META_ADS_SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.META_ADS_SUPABASE_SERVICE_ROLE_KEY}` } }); const rows = await response.json(); if (!response.ok || !Array.isArray(rows)) return { ok: false, count: null, duplicates: null, status: response.status }; const unique = new Set(rows.map((row) => row.insight_key)); return { ok: unique.size === rows.length, count: rows.length, duplicates: rows.length - unique.size, status: response.status }; } catch { return { ok: false, count: null, duplicates: null, status: 'transport' }; }
}
function summarize(dataset, date, result) { if (!result.ok) return { dataset, date, ok: false, received: 0, upserted: 0, status: `FAIL (exit ${result.code ?? 'start'})`, error: result.output.slice(-500) }; const line = result.output.split(/\r?\n/).reverse().find((value) => { try { JSON.parse(value); return true; } catch { return false; } }); let payload; try { payload = JSON.parse(line); } catch { return { dataset, date, ok: false, received: 0, upserted: 0, status: 'FAIL (missing result)', error: 'Collector did not return a JSON summary.' }; } const summary = dataset === 'hourly' ? payload : payload.results?.[0]; return summary ? { dataset, date, ok: true, received: Number(summary.insightsRead || 0), upserted: Number(summary.rowsWritten || 0), status: 'OK', error: null } : { dataset, date, ok: false, received: 0, upserted: 0, status: 'FAIL (invalid result)', error: 'Collector summary omitted requested dataset.' }; }
async function main(argv = process.argv.slice(2), env = process.env) {
  const config = parseManualConfig(argv, env); console.log(`Account: ${sanitizeAccountId(config.accountId)}`); console.log(`Requested range: ${config.fromDate} -> ${config.toDate}`); console.log(`Mode: ${config.mode}`); console.log(`Meta API version: ${config.apiVersion}`); console.log('Date semantics: Meta ad-account timezone; no UTC date conversion is applied.');
  const auth = await metaAuthCheck(config, env); if (!auth.ok) { console.log('META AUTH: FAIL'); console.log(`Meta auth detail: http_status=${auth.httpStatus ?? 'none'} type=${auth.errorType ?? 'none'} code=${auth.errorCode ?? 'none'} subcode=${auth.errorSubcode ?? 'none'} classification=${auth.classification} message=${auth.message}`); console.log('MANUAL META PULL: FAIL'); process.exitCode = 1; return; }
  console.log(`META AUTH: PASS (http_status=${auth.httpStatus}, account_timezone=${auth.timezone})`); const datasets = config.mode === 'both' ? ['hourly', 'demographics'] : [config.mode], results = [];
  for (let offset = 0; offset < daysInclusive(config.fromDate, config.toDate); offset += 1) { const date = dateAt(config.fromDate, offset); for (const dataset of datasets) { const before = config.dryRun ? null : await databaseSummary(dataset, date, env); const result = summarize(dataset, date, await run(commandFor(dataset, date, config.dryRun), env)); const after = config.dryRun ? null : await databaseSummary(dataset, date, env); if ((before && !before.ok) || (after && !after.ok)) { result.ok = false; result.status = 'FAIL (Supabase readback)'; result.error = 'Supabase count/duplicate readback failed.'; } results.push(result); console.log(`${dataset === 'hourly' ? 'Hourly' : 'Demographics'}: date=${date} rows_received=${result.received} rows_upserted=${result.upserted} before_rows=${before?.count ?? 'dry-run'} after_rows=${after?.count ?? 'dry-run'} duplicate_keys=${after?.duplicates ?? 'dry-run'} api_result_status=${result.status}`); if (!result.ok) console.log(`Meta error date=${date} dataset=${dataset}: ${result.error}`); } }
  const failures = results.filter((result) => !result.ok); console.log(`MANUAL META PULL: ${failures.length ? (failures.length === results.length ? 'FAIL' : 'PARTIAL') : 'PASS'}`); if (failures.length) process.exitCode = 1;
}
if (require.main === module) main().catch((error) => { console.error(`manual-meta-pull failed: ${redact(error.message || error)}`); process.exitCode = 1; });
module.exports = { MAX_RANGE_DAYS, databaseSummary, daysInclusive, isCalendarDate, metaAuthCheck, parseManualConfig, redact, sanitizeAccountId, summarize };
