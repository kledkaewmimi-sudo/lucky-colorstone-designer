'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflowPath = path.join(__dirname, '..', '.github', 'workflows', 'meta-ads-historical-backfill.yml');
const workflow = fs.readFileSync(workflowPath, 'utf8');

assert.match(workflow, /^on:\s*\n\s+workflow_dispatch:/m);
assert.doesNotMatch(workflow, /^\s+schedule:/m, 'historical backfill must not schedule itself');
assert.match(workflow, /^\s+since:\s*\n\s+description:.*\n\s+required: true\s*\n\s+default: '2026-08-01'/m);
assert.match(workflow, /^\s+until:\s*\n\s+description:.*\n\s+required: true\s*\n\s+default: '2026-08-31'/m);
assert.match(workflow, /uses: actions\/checkout@v4/);
assert.match(workflow, /uses: actions\/setup-node@v4/);
assert.match(workflow, /node-version: '20'/);
assert.match(workflow, /^\s+run: npm ci$/m);

[
  'META_AD_ACCOUNT_ID',
  'META_ACCESS_TOKEN',
  'META_API_VERSION',
  'META_ADS_SUPABASE_URL',
  'META_ADS_SUPABASE_SERVICE_ROLE_KEY'
].forEach((name) => assert.equal(workflow.includes(name + ': $' + '{{ secrets.' + name + ' }}'), true, `${name} must come from a GitHub Actions secret`));

assert.match(workflow, /node scripts\/meta-ads-sync\.js --since "\$day" --until "\$day"/);
assert.match(workflow, /node scripts\/meta-ads-analytics-sync\.js --since "\$day" --until "\$day" --datasets demographics --demographics-stage age_gender --granularity daily/);
assert.match(workflow, /for day in "\$\{dates\[@\]\}"; do/);
assert.match(workflow, /setUTCDate\(day\.getUTCDate\(\) \+ 1\)/, 'date iteration must be UTC-based');
assert.match(workflow, /Baseline collector failed for date=\$day/);
assert.match(workflow, /Demographics collector failed for date=\$day/);
assert.match(workflow, /rowsRead/);
assert.match(workflow, /rowsWritten/);
assert.equal(/(META_ACCESS_TOKEN|META_ADS_SUPABASE_SERVICE_ROLE_KEY):\s*['\"]?[A-Za-z0-9_-]{20,}/.test(workflow), false, 'workflow must not contain literal secrets');
assert.equal(workflow.includes('schedule:'), false, 'historical workflow must have no scheduled trigger');
assert.equal(workflow.includes('server.js'), false, 'workflow must not invoke the application server');
assert.equal(workflow.includes('render'), false, 'workflow must not invoke Render');

console.log('meta-ads-historical-backfill-workflow.test.cjs passed');
