import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';

const port = 8792;
const dataDir = await mkdtemp(join(tmpdir(), 'lcs-analytics-v2-'));
const server = spawn(process.execPath, ['server.js'], {
  cwd: process.cwd(),
  env: { ...process.env, DATA_DIR: dataDir, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe']
});

try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out starting analytics test server.')), 10000);
    server.stdout.on('data', (chunk) => {
      if (chunk.toString().includes(`localhost:${port}`)) {
        clearTimeout(timer);
        resolve();
      }
    });
    server.once('error', reject);
    server.stderr.on('data', (chunk) => reject(new Error(chunk.toString())));
  });

  await test('v2 canonical funnel events are server-deduplicated and retain first touch', async () => {
    const payload = {
      sessionId: 'session_analytics_v2_123456',
      visitorId: '11111111-1111-4111-8111-111111111111',
      eventName: 'step_3_view',
      step: 3,
      source: { utm_source: 'instagram', utm_medium: 'paid', utm_campaign: 'launch', platform_guess: 'instagram' },
      properties: {
        started_at: '2026-08-23T03:00:00.000Z',
        schema_version: 2,
        funnel_version: 2,
        funnel_stage: 'step_3_view',
        funnel_stage_key: 'v2:session_analytics_v2_123456:step_3_view',
        current_stage: 'step_3_view'
      }
    };
    const post = async () => fetch(`http://127.0.0.1:${port}/api/analytics/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    assert.equal((await post()).status, 202);
    assert.equal((await post()).status, 202);

    const events = JSON.parse(await readFile(join(dataDir, 'analytics_events.json'), 'utf8'));
    assert.equal(events.filter((event) => event.properties?.funnel_stage_key === payload.properties.funnel_stage_key).length, 1);
    const sessions = JSON.parse(await readFile(join(dataDir, 'analytics_sessions.json'), 'utf8'));
    assert.equal(sessions[0].visitor_id, payload.visitorId);
    assert.equal(sessions[0].first_source, 'instagram');
  });

  await test('legacy events remain append-only and untouched by v2 stage deduplication', async () => {
    const payload = {
      sessionId: 'legacy_analytics_123456',
      eventName: 'landing_view',
      properties: { started_at: '2026-08-23T03:00:00.000Z' }
    };
    const post = async () => fetch(`http://127.0.0.1:${port}/api/analytics/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    await post();
    await post();
    const events = JSON.parse(await readFile(join(dataDir, 'analytics_events.json'), 'utf8'));
    assert.equal(events.filter((event) => event.session_id === payload.sessionId).length, 2);
  });

  await test('paid funnel correlation remains in the existing authoritative webhook path', async () => {
    const source = await readFile(join(process.cwd(), 'server.js'), 'utf8');
    const webhookStart = source.indexOf('async function applyStripeCheckoutPaymentEvent');
    const webhookEnd = source.indexOf('function getWebsiteOrigin', webhookStart);
    const webhook = source.slice(webhookStart, webhookEnd);
    assert.ok(webhook.indexOf('await saveOrderForApi(paidOrder)') < webhook.indexOf('await linkAnalyticsOrderConversion(paidOrder)'));
    const linkStart = source.indexOf('async function linkAnalyticsOrderConversion');
    const linkEnd = source.indexOf('const ANALYTICS_RANGE_PRESETS', linkStart);
    const link = source.slice(linkStart, linkEnd);
    assert.match(link, /eventName: funnelVersion === ANALYTICS_FUNNEL_VERSION \? 'payment_success' : 'order_created'/);
    assert.match(link, /await upsertAnalyticsSession\(payload\)/);
  });

  await test('v2 CRM summary uses unique sessions, verified LINE connection, and one active latest stage', async () => {
    const sessionId = 'session_summary_v2_123456';
    const visitorId = '22222222-2222-4222-8222-222222222222';
    const now = new Date().toISOString();
    const postStage = async (eventName, properties = {}) => {
      const response = await fetch(`http://127.0.0.1:${port}/api/analytics/event`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId, visitorId, eventName, timestamp: now,
          source: { utm_source: 'instagram', utm_medium: 'paid', utm_campaign: 'launch', platform_guess: 'instagram' },
          properties: { started_at: now, schema_version: 2, funnel_version: 2, funnel_stage: eventName, funnel_stage_key: `v2:${sessionId}:${eventName}`, ...properties }
        })
      });
      assert.equal(response.status, 202);
    };
    for (const stage of ['landing_view', 'start_design', 'step_1_view', 'step_2_view', 'step_3_view', 'line_connected', 'step_4_view', 'checkout_started']) await postStage(stage);
    await postStage('step_3_view');

    const waitingSession = 'session_summary_line_pending_123456';
    const waitingResponse = await fetch(`http://127.0.0.1:${port}/api/analytics/event`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: waitingSession, visitorId: '33333333-3333-4333-8333-333333333333', eventName: 'oa_friend_required', timestamp: now,
        source: { utm_source: 'instagram', utm_medium: 'paid', platform_guess: 'instagram' },
        properties: { started_at: now, schema_version: 2, funnel_version: 2, reason: 'not_friend' }
      })
    });
    assert.equal(waitingResponse.status, 202);

    const summary = await fetch(`http://127.0.0.1:${port}/api/analytics/summary?range=all`).then((response) => response.json());
    assert.equal(summary.modelVersion, 2);
    assert.equal(summary.funnel.find((row) => row.key === 'line_connected').sessions, 1);
    assert.equal(summary.funnel.find((row) => row.key === 'step_3_view').sessions, 2);
    assert.equal(summary.funnel.find((row) => row.key === 'checkout_started').sessions, 1);
    assert.equal(summary.ownerChannels.find((row) => row.channel === 'Instagram').sessions >= 1, true);
    assert.equal(summary.stepDistribution.find((row) => row.step === 'checkout_started').sessions, 1);
    assert.equal(summary.stepDistribution.find((row) => row.step === 'line_oa').sessions, 1);
  });
} finally {
  server.kill();
  await rm(dataDir, { recursive: true, force: true });
}
