import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const CAND = 'reports/production/full-uat-feature-migration-20261009/reconciled-candidate';
const BATCH = 'reports/production/production-bugfix-batch-20261011';
const files = [
  `${CAND}/app.js`,
  `${CAND}/data.js`,
  `${CAND}/crm.js`,
  `${CAND}/crm.html`,
  `${CAND}/crm.css`,
  `${CAND}/crm-order-read-model.js`,
  `${CAND}/server.js`,
  `${CAND}/lumi/contracts/catalog-snapshot.js`,
  `${CAND}/lumi/scoring/eligibility.js`,
  `${CAND}/lumi/import/step3-import.js`,
  `${CAND}/tests/production-crm-talisman-save.test.mjs`,
  `${CAND}/tests/production-crm-order-card-shipping.test.mjs`,
  `${CAND}/tests/production-lucky-design-eligibility.test.mjs`,
  `${CAND}/tests/crm-order-detail-browser-acceptance.mjs`,
  `${CAND}/tests/production-bugfix-batch/crm-talisman-save-and-order-shipping.spec.mjs`,
  `${CAND}/tests/production-bugfix-batch/lucky-zero-stock-runtime.spec.mjs`,
  'reports/production/full-uat-feature-migration-20261009/release/manifest.json',
  'reports/production/full-uat-feature-migration-20261009/release/release-record.json',
  `${BATCH}/production-bugfix-batch-turn4-20261011-1520.md`,
  ...fs.readdirSync(`${BATCH}/tools`).filter((name) => name.endsWith('.mjs')).map((name) => `${BATCH}/tools/${name}`),
  ...fs.readdirSync(`${BATCH}/evidence`).filter((name) => /\.json$/.test(name)).map((name) => `${BATCH}/evidence/${name}`)
].filter((file) => fs.existsSync(file));

const message = [
  'fix(production): CRM talisman save correctness, order-card shipping, Lucky design eligibility',
  '',
  '- data.js/crm.js: the CRM decides POST vs PUT from the operator intent and the server response instead of',
  '  a non-authoritative client catalog, retries a duplicate-id POST as an update of the same record with the',
  '  stored render tuning preserved, refuses to overwrite a record it cannot read, and reports every failure.',
  '- crm.js/crm.html/crm.css/crm-order-read-model.js/server.js: the order card carries the complete shipping',
  '  presentation (recipient, full address, postal code, phone, copy button) between Pricing and Cost, with a',
  '  bounded detail-endpoint fallback while the backend projection awaits the Render deployment.',
  '- lumi contracts/scoring/import + app.js: active, replenishable materials stay eligible for DESIGN while',
  '  stock is zero; Pyrite, inactive, deleted and unknown materials stay excluded; checkout stock validation',
  '  and the protected UX fixes (Undo history, ghost-slot geometry, replacement confirmation) are untouched.',
  '',
  'Artifact 66b42b5ebc561c40cec84d39f44236897fc9344ccd33829f81d09d74973a1e03, Vercel production',
  'dpl_3FJJ5LkvPAVKbX8HC1dVWohQqE2r, Render commit 606da9aff796a60aa6c6749cfaff3be8e5f616ec pushed for owner deploy.'
].join('\n');

execFileSync('git', ['add', '--', ...files], { encoding: 'utf8', maxBuffer: 1 << 27 });
execFileSync('git', ['commit', '-m', message, '--', ...files], { encoding: 'utf8', maxBuffer: 1 << 27 });
console.log(execFileSync('git', ['log', '-1', '--pretty=format:%H%n%s'], { encoding: 'utf8' }));
console.log(execFileSync('git', ['show', '--stat', '--oneline', 'HEAD'], { encoding: 'utf8' }).split('\n').slice(-2).join('\n'));
