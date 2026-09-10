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

test('PASS health status skips LINE without reading a target', async () => {
  let calls = 0;
  const result = await sendHealthAlert({
    report: { status: 'PASS' },
    env: {},
    fetchImpl: async () => { calls += 1; return { ok: true }; }
  });
  assert.deepEqual(result, { sent: false, skipped: 'health-pass' });
  assert.equal(calls, 0);
});

test('FAIL health status sends one concise redacted LINE alert', async () => {
  const requests = [];
  const report = {
    timestamp: '2026-09-10T12:00:00.000Z',
    status: 'FAIL',
    failedCheck: 'Step 2 to Step 3 performance',
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
  assert.match(payload.messages[0].text, /Step 2→3: 3214 ms/);
  assert.match(payload.messages[0].text, /Navigation fail threshold: 2000 ms/);
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

test('alert text excludes PII and secret material', () => {
  const text = buildHealthAlert({ status: 'FAIL', failedCheck: 'catalog failed', metrics: {}, brokenAssets: [], http5xx: [] });
  assert.doesNotMatch(text, /customer|phone|address|service.role|access.token/i);
  assert.ok(text.length < 4900);
});
