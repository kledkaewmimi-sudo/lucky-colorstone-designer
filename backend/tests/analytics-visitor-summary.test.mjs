import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const port = 8791;
const dataDir = await mkdtemp(join(tmpdir(), 'lcs-analytics-visitor-'));
const server = spawn(process.execPath, ['server.js'], {
  cwd: process.cwd(),
  env: { ...process.env, DATA_DIR: dataDir, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe']
});

try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out starting test server.')), 10000);
    server.stdout.on('data', (chunk) => {
      if (chunk.toString().includes(`localhost:${port}`)) {
        clearTimeout(timer);
        resolve();
      }
    });
    server.once('error', reject);
    server.stderr.on('data', (chunk) => reject(new Error(chunk.toString())));
  });

  const visitorA = '11111111-1111-4111-8111-111111111111';
  const visitorB = '22222222-2222-4222-8222-222222222222';
  const visitorTest = '33333333-3333-4333-8333-333333333333';
  const postEvent = async ({ sessionId, visitorId = '', source = 'instagram', campaign = '' }) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/analytics/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        visitorId,
        eventName: 'landing_view',
        timestamp: '2026-08-12T03:00:00.000Z',
        source: { utm_source: source, utm_campaign: campaign, platform_guess: source },
        properties: {
          started_at: '2026-08-12T03:00:00.000Z',
          schema_version: 2,
          funnel_version: 2,
          funnel_stage: 'landing_view',
          funnel_stage_key: `v2:${sessionId}:landing_view`
        }
      })
    });
    assert.equal(response.status, 202);
  };

  // Test A and E: one visitor, three distinct sessions across Instagram and LINE.
  await postEvent({ sessionId: 'session-a-1', visitorId: visitorA, source: 'instagram' });
  await postEvent({ sessionId: 'session-a-2', visitorId: visitorA, source: 'line' });
  await postEvent({ sessionId: 'session-a-3', visitorId: visitorA, source: 'instagram' });
  // Test B: a second visitor with a separate session.
  await postEvent({ sessionId: 'session-b-1', visitorId: visitorB, source: 'line' });
  // Test C/D: legacy and malformed visitor values remain sessions but are not visitors.
  await postEvent({ sessionId: 'legacy-null-1', source: 'manual' });
  await postEvent({ sessionId: 'legacy-malformed-1', visitorId: 'not-a-visitor-id', source: 'manual' });
  // Test exclusion: a tracked prelaunch session must not affect the default report.
  await postEvent({ sessionId: 'test-excluded-1', visitorId: visitorTest, source: 'instagram', campaign: 'prelaunch_test' });

  const summary = await fetch(`http://127.0.0.1:${port}/api/analytics/summary?range=all`).then((response) => response.json());
  assert.equal(summary.totals.sessions, 6);
  assert.equal(summary.totals.uniqueVisitors, 2);
  assert.equal(summary.totals.visitorTrackedSessions, 4);
  assert.equal(summary.totals.legacySessionsWithoutVisitorId, 2);
  assert.equal(summary.ownerChannels.find((row) => row.channel === 'Instagram').uniqueVisitors, 1);
  assert.equal(summary.ownerChannels.find((row) => row.channel === 'Instagram').sessions, 2);
  assert.equal(summary.ownerChannels.find((row) => row.channel === 'LINE').uniqueVisitors, 2);
  assert.equal(summary.ownerChannels.find((row) => row.channel === 'LINE').sessions, 2);

  const withTests = await fetch(`http://127.0.0.1:${port}/api/analytics/summary?range=all&include_test=1`).then((response) => response.json());
  assert.equal(withTests.totals.sessions, 7);
  assert.equal(withTests.totals.uniqueVisitors, 3);

  console.log('analytics visitor summary tests passed');
} finally {
  server.kill();
  await rm(dataDir, { recursive: true, force: true });
}
