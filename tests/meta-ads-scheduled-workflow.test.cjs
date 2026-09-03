'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflowPath = path.join(__dirname, '..', '.github', 'workflows', 'meta-ads-scheduled-ingestion.yml');
const workflow = fs.readFileSync(workflowPath, 'utf8');

assert.match(workflow, /^on:\s*$/m);
assert.match(workflow, /^\s+schedule:\s*$/m);
assert.match(workflow, /cron: '5 \* \* \* \*'/);
assert.match(workflow, /^\s+workflow_dispatch:\s*$/m);
assert.match(workflow, /^permissions:\s*\n\s+contents: read$/m);
assert.match(workflow, /^concurrency:\s*\n\s+group: meta-ads-scheduled-ingestion\s*\n\s+cancel-in-progress: false$/m);
assert.match(workflow, /uses: actions\/checkout@v4/);
assert.match(workflow, /uses: actions\/setup-node@v4/);
assert.match(workflow, /node-version: '20'/);
assert.match(workflow, /^\s+run: npm ci$/m);
assert.match(workflow, /^\s+run: node scripts\/meta-ads-scheduled-worker\.js --job scheduled$/m);
[
  'META_AD_ACCOUNT_ID',
  'META_ACCESS_TOKEN',
  'META_API_VERSION',
  'META_ADS_SUPABASE_URL',
  'META_ADS_SUPABASE_SERVICE_ROLE_KEY'
].forEach((name) => assert.equal(workflow.includes(name + ': $' + '{{ secrets.' + name + ' }}'), true, `${name} must come from a GitHub Actions secret`));
assert.equal(/(META_ACCESS_TOKEN|META_ADS_SUPABASE_SERVICE_ROLE_KEY):\s*['\"]?[A-Za-z0-9_-]{20,}/.test(workflow), false, 'workflow must not contain literal secrets');
assert.equal(workflow.includes('server.js'), false, 'workflow must not invoke the application server');
assert.equal(workflow.includes('render'), false, 'workflow must not invoke Render');

console.log('meta-ads-scheduled-workflow.test.cjs passed');

