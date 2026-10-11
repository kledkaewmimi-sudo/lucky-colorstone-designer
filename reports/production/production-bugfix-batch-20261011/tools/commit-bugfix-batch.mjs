// Creates the focused local commit for this batch: the four changed source files, the 35 rebuilt stone
// assets, the regenerated release manifest, the new batch tooling/evidence and the report. Assets that
// are large local backups/screenshots are excluded on purpose. Nothing is pushed.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const CAND = 'reports/production/full-uat-feature-migration-20261009/reconciled-candidate';
const RELEASE = 'reports/production/full-uat-feature-migration-20261009/release';
const BATCH = 'reports/production/production-bugfix-batch-20261011';

const changed = JSON.parse(fs.readFileSync(`${BATCH}/evidence/changed-files.json`, 'utf8')).changed;
const source = ['app.js', 'index.html', 'index.css', 'lumi/ui/lumi-ui.js'];

const files = [
  ...source.map((rel) => `${CAND}/${rel}`),
  ...changed.filter((rel) => /^assets\//i.test(rel)).map((rel) => `${CAND}/${rel}`),
  `${RELEASE}/manifest.json`,
  `${BATCH}/production-bugfix-batch-20261011-1024.md`,
  `${BATCH}/evidence/release-record-bugfix-batch.json`,
  ...fs.readdirSync(`${CAND}/tests/production-bugfix-batch`).filter((name) => name.endsWith('.spec.mjs')).map((name) => `${CAND}/tests/production-bugfix-batch/${name}`),
  ...fs.readdirSync(`${BATCH}/tools`).filter((name) => name.endsWith('.mjs')).map((name) => `${BATCH}/tools/${name}`),
  ...fs.readdirSync(`${BATCH}/evidence`).filter((name) => name.endsWith('.json')).map((name) => `${BATCH}/evidence/${name}`),
  ...[
    'live-landing-social-proof.png',
    'live-page3-stones-transparent.png',
    'live-after-lucky-accept.png',
    'live-replace-confirmation.png',
    'live-after-second-lucky.png',
    'live-lucky-page3-charm-love.png',
    'stone-cutout-contact-sheet.png'
  ].map((name) => `${BATCH}/evidence/${name}`).filter((rel) => fs.existsSync(rel))
];

const existing = files.filter((rel) => fs.existsSync(rel));
const missing = files.filter((rel) => !fs.existsSync(rel));
if (missing.length) { console.error('MISSING PATHS: ' + missing.join(', ')); process.exit(2); }

const run = (args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 26 });
run(['add', '--', ...existing]);
console.log(run(['status', '--short']));
const message = [
  'fix(production): Lucky stays on Step 3, replacement confirmation, Step 3 undo, transparent stone assets',
  '',
  'Production bugfix batch for the customer funnel (issue 3-6). Issue 1 stays count-only behind the',
  'publication-consent gate and issue 2 could not be reproduced; both are documented in the batch report.',
  '',
  '- lumi/ui/lumi-ui.js: clear the one-shot committing latch per Lucky session so the replacement',
  '  confirmation card appears again when a second Lucky design replaces the current bracelet.',
  '- app.js: applying a Lucky design no longer navigates to Step 4; the customer stays on Step 3 and',
  '  keeps editing until they press Next.',
  '- app.js/index.html/index.css: new Step 3 Undo control (bottom-left, mirroring Reset) backed by a',
  '  bounded immutable composition history with explicit reset, Lucky-replacement and Step-3-entry',
  '  boundaries; cancelled replacements never touch the editor or the history.',
  '- assets: backgrounds removed in place for the 35 stone images used by the designer and the Lucky',
  '  result page; filenames, paths, formats and 800x800 framing unchanged.',
  '',
  'Artifact: 291 files, 106,111,079 bytes, fingerprint ce84f95b48373412506653e8003aba9880840bfb50f161f49a5dd2abf3012fa3',
  'Deployed: Vercel production dpl_9dLNZfWVS63UcKjCkJ99htNgKXem (customize + crm aliases)',
  'Tests: production regression 250/250, asset QC 38/38, full-flow gate 2/2, undo suite 3/3, live 13/13'
].join('\n');

run(['commit', '-m', message, '--', ...existing]);
console.log(run(['log', '-1', '--stat', '--pretty=format:%H%n%s']));
