import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildHealthAlert,
  resolveAdminTarget,
  sendHealthAlert
} from '../scripts/send-production-health-line-alert.mjs';

const workflow = fs.readFileSync('.github/workflows/production-health-monitor.yml', 'utf8');
const monitor = fs.readFileSync('tests/production-health-monitor.spec.mjs', 'utf8');

test('workflow runs every three hours and supports manual dispatch', () => {
  assert.match(workflow, /cron: '0 \*\/3 \* \* \*'/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /timeout-minutes: 15/);
});

test('workflow cannot deploy and preserves the original health failure', () => {
  assert.doesNotMatch(workflow, /\b(vercel|render)\b.*\b(deploy|promote)\b/i);
  assert.match(workflow, /id: health[\s\S]*continue-on-error: true/);
  assert.match(workflow, /steps\.health\.outcome == 'failure'/);
  assert.match(workflow, /Preserve original health failure/);
});

test('failure artifacts include report, screenshot-capable results, and traces', () => {
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /artifacts\/production-health-report\.json/);
  assert.match(workflow, /test-results\//);
  assert.match(monitor, /trace: 'retain-on-failure'/);
  assert.match(monitor, /screenshot: 'only-on-failure'/);
});

test('monitor blocks all browser writes and never enters Stripe checkout', () => {
  assert.match(monitor, /!\['GET', 'HEAD'\]\.includes\(request\.method\(\)\)/);
  assert.match(monitor, /productionMutationRequestsForwarded: 0/);
  assert.doesNotMatch(monitor, /api\/stripe\/checkout-session/);
  const payReadyIndex = monitor.indexOf("classList.contains('btn-order')");
  assert.ok(payReadyIndex > 0);
  assert.doesNotMatch(monitor.slice(payReadyIndex), /\.click\(/);
});

test('monitor covers Steps 1-4, duplicate navigation, and performance thresholds', () => {
  for (const selector of ['#stepView1', '#stepView2', '#stepView3', '#stepView4']) {
    assert.ok(monitor.includes(selector));
  }
  assert.match(monitor, /FAILURE_THRESHOLD_MS = 2000/);
  assert.match(monitor, /API_FAILURE_THRESHOLD_MS = 10_000/);
  assert.match(monitor, /step23Ms/);
  assert.match(monitor, /step34Ms/);
  assert.match(monitor, /button\.click\(\);\s*button\.click\(\);\s*button\.click\(\);/);
});

test('monitor detects catalog image, HTTP 5xx, request, and page failures', () => {
  assert.match(monitor, /naturalWidth === 0/);
  assert.match(monitor, /response\.status\(\) >= 500/);
  assert.match(monitor, /page\.on\('requestfailed'/);
  assert.match(monitor, /page\.on\('pageerror'/);
  assert.match(monitor, /data-catalog-section/);
});

test('PASS health status sends one concise LINE success summary', async () => {
  const requests = [];
  const result = await sendHealthAlert({
    report: {
      timestamp: '2026-09-10T12:00:00.000Z',
      status: 'PASS',
      metrics: {
        step23Ms: 120,
        step34Ms: 180,
        http5xxCount: 0,
        uncaughtPageErrorCount: 0,
        slowestApi: { url: 'https://customize.luckycolorstone.com/api/stones', durationMs: 420 }
      },
      brokenAssets: [],
      http5xx: [],
      pageErrors: []
    },
    env: { LINE_CHANNEL_ACCESS_TOKEN: 'test-token', ADMIN_LINE_GROUP_ID: 'test-group' },
    fetchImpl: async (url, options) => { requests.push({ url, options }); return { ok: true, status: 200 }; }
  });
  assert.deepEqual(result, { sent: true });
  assert.equal(requests.length, 1);
  const text = JSON.parse(requests[0].options.body).messages[0].text;
  assert.match(text, /Lucky Colorstone Health Check/);
  assert.match(text, /Status: PASS/);
  assert.match(text, /Step 2→3: 120 ms/);
  assert.match(text, /Slowest API: \/api\/stones — 420 ms/);
  assert.doesNotMatch(text, /test-token|test-group/);
});

test('FAIL health status sends one concise redacted LINE alert', async () => {
  const requests = [];
  const report = {
    timestamp: '2026-09-10T12:00:00.000Z',
    status: 'FAIL',
    failedCheck: 'Step 2 to Step 3 performance',
    thresholdsMs: { fail: 2000, apiFail: 10000 },
    metrics: {
      step23Ms: 3214,
      step34Ms: 80,
      slowestApi: { url: 'https://customize.luckycolorstone.com/api/stones', durationMs: 900 }
    },
    brokenAssets: [],
    http5xx: []
  };
  const env = {
    LINE_CHANNEL_ACCESS_TOKEN: 'test-token-not-for-production',
    ADMIN_LINE_GROUP_ID: 'test-group',
    GITHUB_RUN_URL: 'https://github.com/example/repo/actions/runs/1'
  };
  const result = await sendHealthAlert({
    report,
    env,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, status: 200 };
    }
  });
  assert.deepEqual(result, { sent: true });
  assert.equal(requests.length, 1);
  const payload = JSON.parse(requests[0].options.body);
  assert.equal(payload.messages.length, 1);
  assert.match(payload.messages[0].text, /Status: FAIL/);
  assert.match(payload.messages[0].text, /Failed check: Step 2 to Step 3 performance/);
  assert.match(payload.messages[0].text, /Measured: 3214 ms/);
  assert.match(payload.messages[0].text, /Threshold: 2000 ms/);
  assert.doesNotMatch(payload.messages[0].text, /test-token|test-group/);
});

test('LINE targeting reuses existing admin environment names and selects one target', () => {
  assert.equal(resolveAdminTarget({ ADMIN_LINE_GROUP_ID: 'group', ADMIN_LINE_USER_IDS: 'user1,user2' }), 'group');
  assert.equal(resolveAdminTarget({ ADMIN_LINE_USER_IDS: 'user1,user2' }), 'user1');
  assert.match(workflow, /secrets\.LINE_CHANNEL_ACCESS_TOKEN/);
  assert.match(workflow, /secrets\.ADMIN_LINE_GROUP_ID/);
  assert.match(workflow, /secrets\.ADMIN_LINE_USER_IDS/);
  assert.doesNotMatch(workflow, /LINE_CHANNEL_SECRET/);
});

test('workflow invokes exactly one LINE notification step for every health result', () => {
  const notificationStep = workflow.match(/- name: Send one LINE health summary[\s\S]*?(?=\n\s+- name:)/)?.[0] || '';
  assert.match(notificationStep, /if: always\(\)/);
  assert.equal((workflow.match(/send-production-health-line-alert\.mjs/g) || []).length, 1);
  assert.doesNotMatch(notificationStep, /steps\.health\.outcome/);
});

test('LINE delivery failure stays explicit without replacing the health result', async () => {
  let calls = 0;
  await assert.rejects(
    sendHealthAlert({
      report: { status: 'PASS', metrics: {}, brokenAssets: [], http5xx: [], pageErrors: [] },
      env: { LINE_CHANNEL_ACCESS_TOKEN: 'test-token', ADMIN_LINE_GROUP_ID: 'test-group' },
      fetchImpl: async () => { calls += 1; return { ok: false, status: 503 }; }
    }),
    /LINE push API returned HTTP 503/
  );
  assert.equal(calls, 1);
  assert.match(workflow, /Send one LINE health summary[\s\S]*continue-on-error: true/);
  assert.match(workflow, /Preserve original health failure/);
  assert.match(fs.readFileSync('scripts/send-production-health-line-alert.mjs', 'utf8'), /LINE health alert failed:/);
});

test('alert text excludes PII and secret material', () => {
  const text = buildHealthAlert({ status: 'FAIL', failedCheck: 'catalog failed', metrics: {}, brokenAssets: [], http5xx: [] });
  assert.doesNotMatch(text, /customer|phone|address|service.role|access.token/i);
  assert.ok(text.length < 4900);
});
