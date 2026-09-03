#!/usr/bin/env node
'use strict';

// Isolated entry point for an external cron platform. It never starts the
// customer server and invokes only the two already-verified Meta collectors.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const BANGKOK_TIME_ZONE = 'Asia/Bangkok';
const REQUIRED_ENVIRONMENT_NAMES = [
  'META_AD_ACCOUNT_ID',
  'META_ACCESS_TOKEN',
  'META_API_VERSION',
  'META_ADS_SUPABASE_URL',
  'META_ADS_SUPABASE_SERVICE_ROLE_KEY'
];
const JOB_NAMES = new Set(['hourly-performance', 'daily-demographics', 'reconcile', 'scheduled']);

function usage() {
  console.log(`Usage: node scripts/meta-ads-scheduled-worker.js --job scheduled|hourly-performance|daily-demographics|reconcile

This isolated worker uses ${BANGKOK_TIME_ZONE} for date selection. It requires:
${REQUIRED_ENVIRONMENT_NAMES.map((name) => `  ${name}`).join('\n')}`);
}

function option(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? null : argv[index + 1] || null;
}

function bangkokDateParts(now = new Date()) {
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: BANGKOK_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const values = Object.fromEntries(formatted.map((part) => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day) };
}

function formatDateUtc(date) {
  return date.toISOString().slice(0, 10);
}

function addCalendarDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateUtc(date);
}

function bangkokToday(now = new Date()) {
  const parts = bangkokDateParts(now);
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function bangkokHour(now = new Date()) {
  const formatted = new Intl.DateTimeFormat('en-GB', { timeZone: BANGKOK_TIME_ZONE, hour: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  return Number(formatted.find((part) => part.type === 'hour')?.value);
}

function command(script, args) {
  return { executable: process.execPath, args: [path.join(__dirname, script), ...args] };
}

function buildJobPlan(job, now = new Date()) {
  if (!JOB_NAMES.has(job)) throw new Error(`Unknown job '${job}'. Use scheduled, hourly-performance, daily-demographics, or reconcile.`);
  const today = bangkokToday(now);
  const localHour = bangkokHour(now);
  const yesterday = addCalendarDays(today, -1);
  const threeCompletedDaysAgo = addCalendarDays(today, -3);
  const baseline = (since, until) => command('meta-ads-sync.js', ['--since', since, '--until', until]);
  const demographics = (since, until) => command('meta-ads-analytics-sync.js', [
    '--since', since,
    '--until', until,
    '--datasets', 'demographics',
    '--demographics-stage', 'age_gender',
    '--granularity', 'daily'
  ]);

  if (job === 'hourly-performance') {
    // The collector has a date-level request interface. Refreshing yesterday
    // and today reconciles delayed/partial Meta hours by deterministic upsert.
    return { job, timezone: BANGKOK_TIME_ZONE, since: yesterday, until: today, commands: [baseline(yesterday, today)] };
  }
  if (job === 'daily-demographics') {
    return { job, timezone: BANGKOK_TIME_ZONE, since: yesterday, until: yesterday, commands: [demographics(yesterday, yesterday)] };
  }
  if (job === 'reconcile') return {
    job,
    timezone: BANGKOK_TIME_ZONE,
    since: threeCompletedDaysAgo,
    until: yesterday,
    commands: [baseline(threeCompletedDaysAgo, yesterday), demographics(threeCompletedDaysAgo, yesterday)]
  };
  const commands = [baseline(yesterday, today)];
  if (localHour === 2) commands.push(demographics(yesterday, yesterday));
  if (localHour === 3) commands.push(baseline(threeCompletedDaysAgo, yesterday), demographics(threeCompletedDaysAgo, yesterday));
  return { job, timezone: BANGKOK_TIME_ZONE, since: yesterday, until: today, commands };
}

function validateRequiredEnvironment(env = process.env) {
  const missing = REQUIRED_ENVIRONMENT_NAMES.filter((name) => !String(env[name] || '').trim());
  if (missing.length > 0) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

function lockPathFor(job) {
  return path.join(os.tmpdir(), `lucky-colorstone-meta-ads-${job}.lock`);
}

function acquireLocalLock(job) {
  const lockPath = lockPathFor(job);
  let descriptor;
  try {
    descriptor = fs.openSync(lockPath, 'wx');
    fs.writeFileSync(descriptor, JSON.stringify({ pid: process.pid, started_at: new Date().toISOString(), job }));
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error(`Overlap guard: '${job}' is already running in this runtime.`);
    throw error;
  }
  return () => {
    try { fs.closeSync(descriptor); } catch { /* no action: unlink remains safe */ }
    try { fs.unlinkSync(lockPath); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  };
}

function safeEvent(event) {
  return JSON.stringify(event).replace(/access_token=[^&\s]+/gi, 'access_token=[redacted]');
}

function runCommand(item) {
  return new Promise((resolve, reject) => {
    const child = spawn(item.executable, item.args, { stdio: 'inherit', env: process.env });
    child.on('error', (error) => reject(new Error(`Worker child-process failure: ${String(error.message || error)}`)));
    child.on('exit', (code, signal) => {
      if (code === 0) return resolve();
      return reject(new Error(`Worker collector exited unsuccessfully (code=${code ?? 'null'}, signal=${signal || 'none'}).`));
    });
  });
}

async function runJob(job, now = new Date()) {
  validateRequiredEnvironment();
  const plan = buildJobPlan(job, now);
  const releaseLock = acquireLocalLock(job);
  const startedAt = new Date().toISOString();
  console.log(safeEvent({ event: 'meta_ads_worker_started', job: plan.job, started_at: startedAt, timezone: plan.timezone, since: plan.since, until: plan.until, command_count: plan.commands.length }));
  try {
    for (const item of plan.commands) await runCommand(item);
    console.log(safeEvent({ event: 'meta_ads_worker_completed', job: plan.job, started_at: startedAt, completed_at: new Date().toISOString(), since: plan.since, until: plan.until, command_count: plan.commands.length }));
  } finally {
    releaseLock();
  }
}

async function main(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv.includes('-h')) return usage();
  const job = option(argv, '--job');
  if (!job) throw new Error('--job is required.');
  await runJob(job);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`meta-ads-scheduled-worker failed: ${String(error.message || error).replace(/access_token=[^&\s]+/gi, 'access_token=[redacted]')}`);
    process.exitCode = 1;
  });
}

module.exports = { BANGKOK_TIME_ZONE, REQUIRED_ENVIRONMENT_NAMES, acquireLocalLock, addCalendarDays, bangkokDateParts, bangkokHour, bangkokToday, buildJobPlan, lockPathFor, runCommand, runJob, safeEvent, validateRequiredEnvironment };

