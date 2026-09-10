import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';

export function resolveAdminTarget(env = process.env) {
  const groupId = String(env.ADMIN_LINE_GROUP_ID || '').trim();
  if (groupId) return groupId;
  return String(env.ADMIN_LINE_USER_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .find(Boolean) || '';
}

function bangkokTime(value) {
  const date = new Date(value || Date.now());
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    dateStyle: 'medium',
    timeStyle: 'medium',
    hour12: false
  }).format(Number.isNaN(date.valueOf()) ? new Date() : date);
}

function compactFailure(value) {
  return String(value || 'Production customer flow failed')
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/[\x00-\x1f\x7f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 180);
}

export function buildHealthAlert(report = {}, runUrl = '') {
  const metrics = report.metrics || {};
  const slowestApi = metrics.slowestApi;
  const lines = [
    'Lucky Colorstone Health Alert',
    '',
    `Status: ${report.status || 'FAIL'}`,
    `Time: ${bangkokTime(report.timestamp)}`,
    `Check: ${compactFailure(report.failedCheck)}`,
    `Step 2→3: ${metrics.step23Ms ?? '-'} ms`,
    `Step 3→4: ${metrics.step34Ms ?? '-'} ms`,
    `Navigation fail threshold: ${report.thresholdsMs?.fail ?? 2000} ms`,
    `Broken assets: ${Array.isArray(report.brokenAssets) ? report.brokenAssets.length : 0}`,
    `HTTP 5xx: ${Array.isArray(report.http5xx) ? report.http5xx.length : 0}`
  ];
  if (slowestApi?.url) lines.push(`Slowest API: ${slowestApi.durationMs ?? '-'} ms`);
  if (runUrl) lines.push('', `GitHub run: ${runUrl}`);
  return lines.join('\n').slice(0, 4900);
}

export async function sendHealthAlert({ report, env = process.env, fetchImpl = fetch } = {}) {
  if (report?.status !== 'FAIL') return { sent: false, skipped: 'health-pass' };
  const token = String(env.LINE_CHANNEL_ACCESS_TOKEN || '').trim();
  const target = resolveAdminTarget(env);
  if (!token) throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not configured.');
  if (!target) throw new Error('ADMIN_LINE_GROUP_ID or ADMIN_LINE_USER_IDS is not configured.');

  const text = buildHealthAlert(report, env.GITHUB_RUN_URL || '');
  const response = await fetchImpl(LINE_PUSH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ to: target, messages: [{ type: 'text', text }] })
  });
  if (!response.ok) throw new Error(`LINE push API returned HTTP ${response.status}.`);
  return { sent: true };
}

async function readReport(reportPath) {
  try {
    return JSON.parse(await fs.readFile(reportPath, 'utf8'));
  } catch {
    return {
      timestamp: new Date().toISOString(),
      status: 'FAIL',
      failedCheck: 'Health report unavailable; inspect GitHub Actions artifacts.',
      metrics: {},
      brokenAssets: [],
      http5xx: []
    };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const reportPath = args.find((value) => value !== '--dry-run') || 'artifacts/production-health-report.json';
  const report = await readReport(reportPath);
  if (report.status !== 'FAIL') {
    console.log('LINE health alert skipped: health status is not FAIL.');
    return;
  }
  if (dryRun) {
    console.log(buildHealthAlert(report, process.env.GITHUB_RUN_URL || ''));
    return;
  }
  await sendHealthAlert({ report });
  console.log('LINE health alert sent.');
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((error) => {
    console.error(`LINE health alert failed: ${error?.message || error}`);
    process.exitCode = 1;
  });
}
