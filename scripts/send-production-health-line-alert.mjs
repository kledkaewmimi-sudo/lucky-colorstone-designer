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

function countItems(value, fallback = 0) {
  return Array.isArray(value) ? value.length : fallback;
}

function formatApiMetric(slowestApi) {
  if (!slowestApi?.url) return '-';
  try {
    const path = new URL(slowestApi.url).pathname;
    return `${path} — ${slowestApi.durationMs ?? '-'} ms`;
  } catch {
    return `- — ${slowestApi.durationMs ?? '-'} ms`;
  }
}

function getFailureMeasurement(report, metrics) {
  const navigationThreshold = report.thresholdsMs?.fail ?? 2000;
  if (Number(metrics.step23Ms) > navigationThreshold) {
    return { measured: `${metrics.step23Ms} ms`, threshold: `${navigationThreshold} ms` };
  }
  if (Number(metrics.step34Ms) > navigationThreshold) {
    return { measured: `${metrics.step34Ms} ms`, threshold: `${navigationThreshold} ms` };
  }
  const apiThreshold = report.thresholdsMs?.apiFail ?? 10000;
  if (Number(metrics.slowestApi?.durationMs) > apiThreshold) {
    return { measured: `${metrics.slowestApi.durationMs} ms`, threshold: `${apiThreshold} ms` };
  }
  return null;
}

export function buildHealthAlert(report = {}, runUrl = '') {
  const metrics = report.metrics || {};
  const status = report.status === 'PASS' ? 'PASS' : 'FAIL';
  const brokenImages = countItems(report.brokenAssets);
  const http5xx = countItems(report.http5xx, metrics.http5xxCount || 0);
  const jsErrors = Number(metrics.uncaughtPageErrorCount ?? countItems(report.pageErrors));
  const lines = status === 'PASS'
    ? [
        'Lucky Colorstone Health Check',
        '',
        'Status: PASS ✅',
        `Time: ${bangkokTime(report.timestamp)}`,
        `Step 2→3: ${metrics.step23Ms ?? '-'} ms`,
        `Step 3→4: ${metrics.step34Ms ?? '-'} ms`,
        `Broken images: ${brokenImages}`,
        `HTTP 5xx: ${http5xx}`,
        `JS errors: ${jsErrors}`,
        `Slowest API: ${formatApiMetric(metrics.slowestApi)}`
      ]
    : [
        'Lucky Colorstone Health Alert',
        '',
        'Status: FAIL 🚨',
        `Time: ${bangkokTime(report.timestamp)}`,
        `Failed check: ${compactFailure(report.failedCheck)}`
      ];
  if (status === 'FAIL') {
    const failureMeasurement = getFailureMeasurement(report, metrics);
    if (failureMeasurement) {
      lines.push(`Measured: ${failureMeasurement.measured}`, `Threshold: ${failureMeasurement.threshold}`);
    }
    lines.push(
      `Broken images: ${brokenImages}`,
      `HTTP 5xx: ${http5xx}`,
      `JS errors: ${jsErrors}`
    );
    if (runUrl) lines.push('', `GitHub run: ${runUrl}`);
  }
  return lines.join('\n').slice(0, 4900);
}

export async function sendHealthAlert({ report, env = process.env, fetchImpl = fetch } = {}) {
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
  if (dryRun) {
    console.log(buildHealthAlert(report, process.env.GITHUB_RUN_URL || ''));
    return;
  }
  await sendHealthAlert({ report });
  console.log('LINE health summary sent.');
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((error) => {
    console.error(`LINE health alert failed: ${error?.message || error}`);
    process.exitCode = 1;
  });
}
