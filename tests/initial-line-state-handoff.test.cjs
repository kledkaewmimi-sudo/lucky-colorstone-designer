const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { normalizeHandoffPayload } = require('../line-auth-handoff.js');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const schema = fs.readFileSync(path.join(root, 'supabase/uat/2026-11-08-line-login-analytics.sql'), 'utf8');
const now = 1_760_000_000_000;

const initial = normalizeHandoffPayload({
  targetStep: 2,
  journeyId: 'journey-test-123',
  ttlMs: 10 * 60 * 1000,
  designSnapshot: {
    version: 1,
    savedAt: now,
    expiresAt: now + 10 * 60 * 1000,
    step: 1,
    design: {
      wristSize: 16.5,
      beadSize: null,
      mixedPlacingSize: 6,
      selectedCharmIds: [],
      components: []
    }
  }
}, now);

assert.ok(initial, 'initial Step 1 handoff must allow an empty design with a wrist size');
assert.equal(initial.journeyId, 'journey-test-123');
assert.equal(initial.designSnapshot.design.wristSize, 16.5);
assert.equal(initial.designSnapshot.design.beadSize, null);
assert.equal(initial.targetStep, 2);
assert.equal(initial.expiresAt, now + 10 * 60 * 1000);

const invalid = normalizeHandoffPayload({
  targetStep: 2,
  designSnapshot: {
    version: 1,
    savedAt: now,
    expiresAt: now + 10 * 60 * 1000,
    step: 1,
    design: {
      wristSize: 16.5,
      beadSize: null,
      mixedPlacingSize: 6,
      selectedCharmIds: [],
      components: [{ type: 'stone', id: 'not-valid-without-bead-size' }]
    }
  }
}, now);
assert.equal(invalid, null, 'a non-empty component list requires a bead size');

const invalidTarget = normalizeHandoffPayload({
  targetStep: 9,
  designSnapshot: { version: 1, savedAt: now, expiresAt: now + 1, step: 1, design: { wristSize: 16, beadSize: null, mixedPlacingSize: 6, selectedCharmIds: [], components: [] } }
}, now);
assert.equal(invalidTarget, null);

assert.match(app, /getInitialHandoffToken/);
assert.match(app, /handoffToken: initialHandoff\?\.token/);
assert.match(app, /applyInitialHandoffSnapshot\(restored\.snapshot\)/);
assert.match(server, /INITIAL_HANDOFF_TTL_MS/);
assert.match(server, /journeyId: payload\.journeyId/);
assert.match(schema, /uat_analytics_journeys/);
assert.match(schema, /uat_analytics_events/);

console.log('initial-line-state-handoff.test.cjs passed');
