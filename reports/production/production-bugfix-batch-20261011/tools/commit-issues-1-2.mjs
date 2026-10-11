// Commits this turn's batch: the four changed production source files, the regenerated release
// manifest, the new/updated regression specs, the verification tooling and the report. Nothing is
// pushed (the Render release commit was already pushed separately from a dedicated worktree).
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const CAND = 'reports/production/full-uat-feature-migration-20261009/reconciled-candidate';
const RELEASE = 'reports/production/full-uat-feature-migration-20261009/release';
const MIGRATION_TOOLS = 'reports/production/full-uat-feature-migration-20261009/tools';
const BATCH = 'reports/production/production-bugfix-batch-20261011';

const source = [`${CAND}/app.js`, `${CAND}/index.html`, `${CAND}/lumi/ui/lumi-ui.js`, `${CAND}/server.js`];
const specs = fs.readdirSync(`${CAND}/tests/production-bugfix-batch`)
  .filter((name) => name.endsWith('.spec.mjs') || name.endsWith('.html'))
  .map((name) => `${CAND}/tests/production-bugfix-batch/${name}`);
const tools = fs.readdirSync(`${BATCH}/tools`).filter((name) => name.endsWith('.mjs')).map((name) => `${BATCH}/tools/${name}`);
const evidence = fs.readdirSync(`${BATCH}/evidence`)
  .filter((name) => name.endsWith('.json') || /^live-(issue1|preserved|charm)/.test(name))
  .map((name) => `${BATCH}/evidence/${name}`);
const reports = fs.readdirSync(BATCH).filter((name) => name.endsWith('.md')).map((name) => `${BATCH}/${name}`);
const videoFrames = fs.existsSync(`${BATCH}/evidence/video-frames/tail-contact-sheet.png`)
  ? [`${BATCH}/evidence/video-frames/tail-contact-sheet.png`, `${BATCH}/evidence/video-frames/crop-undefined-card.png`]
  : [];

const files = [
  ...source,
  `${RELEASE}/manifest.json`,
  `${MIGRATION_TOOLS}/social-proof-privacy-tests.mjs`,
  ...specs,
  ...tools,
  ...evidence,
  ...reports,
  ...videoFrames
].filter((rel) => fs.existsSync(rel));

const run = (args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 26 });
run(['add', '--', ...files]);
console.log(run(['status', '--short']).split('\n').filter((line) => line.includes('production-bugfix-batch') || line.includes('reconciled-candidate') || line.includes('full-uat-feature-migration-20261009/release') || line.includes('full-uat-feature-migration-20261009/tools')).join('\n'));

const message = [
  'feat(production): publish four real bracelet previews and fix the Lucky "undefined" fallback copy',
  '',
  'Issues 1 and 2 of the authorised Production bugfix batch (issues 3-6 already live).',
  '',
  '- server.js: GET /api/social-proof now returns { displayCount, successfulOrderCount, recentBracelets }',
  '  with at most four optimized 176px WebP thumbnails of the newest paid orders that carry a valid',
  '  stored preview. The preview read is a bounded, newest-first, paid-only projection that only runs',
  '  when the newest paid order changes; each stored render is re-encoded server-side so the public',
  '  payload stays small and all image metadata is dropped. No order id, customer detail, payment',
  '  field or order record is exposed, and the response is cacheable.',
  '- app.js/index.html: the landing social-proof strip renders the published previews in the four',
  '  restored slots, treats the payload as untrusted input (bounded inline images only) and degrades to',
  '  the designed fallback circles when the endpoint has no imagery.',
  '- lumi/ui/lumi-ui.js: the four Lucky fallback states shipped the literal string "undefined" as their',
  '  only call-to-action (the exact screen in the owner recording). Each state now carries its own Thai',
  '  copy and action: editor return for "no recommendation", explicit regeneration for the stale states,',
  '  and retry plus editor return for the error state.',
  '',
  'Render release commit (server.js only, on top of the deployed dde5b5c): fe282deaeebb644ccf1bd3fc5e8de70cdce7b44f',
  'Frontend deployment: dpl_6pZ1wqiM4JQokku1YwrqQJCmaE4B',
  'Tests: production regression 250/250, security harnesses 226/226, social-proof publication 9/9,',
  'privacy harness 21/21, landing strip 5/5, Lucky fallback copy 5/5, preserved suites 7/7, live 23/23'
].join('\n');

run(['commit', '-m', message, '--', ...files]);
console.log(run(['log', '-1', '--pretty=format:%H%n%s']));
console.log(run(['show', '--stat', '--oneline', 'HEAD']).split('\n').slice(-2).join('\n'));
