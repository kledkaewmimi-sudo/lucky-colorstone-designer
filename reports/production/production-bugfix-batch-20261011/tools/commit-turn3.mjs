import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const CAND = 'reports/production/full-uat-feature-migration-20261009/reconciled-candidate';
const BATCH = 'reports/production/production-bugfix-batch-20261011';
const files = [
  `${CAND}/app.js`,
  `${CAND}/index.html`,
  `${CAND}/tests/production-bugfix-batch/undo-depth-and-geometry.spec.mjs`,
  'reports/production/full-uat-feature-migration-20261009/release/manifest.json',
  `${BATCH}/production-bugfix-batch-turn3-20261011-1330.md`,
  ...fs.readdirSync(`${BATCH}/tools`).filter((name) => name.endsWith('.mjs')).map((name) => `${BATCH}/tools/${name}`),
  ...fs.readdirSync(`${BATCH}/evidence`).filter((name) => name.endsWith('.json') && /coverage|live-turn3|live-undo-geometry/.test(name)).map((name) => `${BATCH}/evidence/${name}`)
].filter((file) => fs.existsSync(file));

const message = [
  'fix(production): full undo history, ghost-slot consumption, Undo label; verify Lucky coverage and formula',
  '',
  '- app.js: retained empty slots are consumed once a stone or talisman uses the freed capacity, so the rendered',
  '  ring circumference equals the physical bracelet (no ghost positions, no oversized canvas loop).',
  '- app.js: undo capture no longer pushes a stale pre-undo snapshot after the customer presses Undo and the',
  '  history keeps 40 states, so consecutive Undo clicks walk the whole editing history.',
  '- index.html: the Undo control is labelled exactly "Undo".',
  '- Lucky coverage: the reported six-goal WITH_TALISMAN failure was Lucky Clover being out of stock (the engine',
  '  requires cl01 for every luck-containing goal set). With cl01 restocked, the real engine plus the Step-3',
  '  acceptance validator succeed on 1,638/1,638 sampled combinations, with 0 pyrite.',
  '- Social-proof formula re-verified: 1329 = 1035 + 98*3, four real previews, no PII.',
  '- CRM talisman save and the CRM shipping-card move were not implemented (no proven root cause / separate scope).',
  '',
  'Artifact 4842bd2226db9ded775389a55571f4d477b2cd77d241238f167a9e25ba5c7890, Vercel production',
  'dpl_5n4C2ryvSXd7Ddx6J9vfK7XDfEt2, no backend change.'
].join('\n');

execFileSync('git', ['add', '--', ...files], { encoding: 'utf8', maxBuffer: 1 << 26 });
execFileSync('git', ['commit', '-m', message, '--', ...files], { encoding: 'utf8', maxBuffer: 1 << 26 });
console.log(execFileSync('git', ['log', '-1', '--pretty=format:%H%n%s'], { encoding: 'utf8' }));
console.log(execFileSync('git', ['show', '--stat', '--oneline', 'HEAD'], { encoding: 'utf8' }).split('\n').slice(-2).join('\n'));
