import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const crmSource = fs.readFileSync(path.join(root, 'crm.js'), 'utf8');
const dataSource = fs.readFileSync(path.join(root, 'data.js'), 'utf8');

test('CRM data module instantiates without duplicate import bindings', () => {
  const imports = dataSource.match(/import \{ normalizeCrmOrderDetailResponse \} from '\.\/crm-order-details\.js';/g) || [];
  assert.equal(imports.length, 1);
  assert.doesNotThrow(() => execFileSync(process.execPath, ['--input-type=module', '-e', "import('./data.js')"], { cwd: root, stdio: 'pipe' }));
});

test('correct credential path stores session and reveals dashboard before loading CRM data', () => {
  assert.match(crmSource, /user === 'admin' && pass === 'lucky123'/);
  assert.match(crmSource, /localStorage\.setItem\('lucky_crm_session', 'true'\)/);
  assert.match(crmSource, /DOM\.loginPortal\.style\.display = 'none';[\s\S]*DOM\.dashboardContainer\.style\.display = 'flex';[\s\S]*loadDashboardData\(\);/);
});

test('invalid login, session restore, and logout preserve the established auth contract', () => {
  assert.match(crmSource, /DOM\.loginErrorMsg\.style\.display = 'block';/);
  assert.match(crmSource, /localStorage\.getItem\('lucky_crm_session'\) === 'true'/);
  assert.match(crmSource, /localStorage\.removeItem\('lucky_crm_session'\)/);
  assert.match(crmSource, /CRMState\.sessionActive = false;/);
});

test('dashboard bootstrap remains authenticated-only and has no auth redirect loop', () => {
  assert.match(crmSource, /if \(CRMState\.sessionActive\) \{\s*await loadDashboardData\(\);\s*\}/);
  assert.doesNotMatch(crmSource, /location\.(href|replace|assign)/);
});