// Compares the deployed production stone assets with the candidate's pre-change originals.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const CAND = 'reports/production/full-uat-feature-migration-20261009/reconciled-candidate';
const REF = 'reports/production/full-uat-feature-migration-20261009/release/artifact/vercel';
const BACK = 'reports/production/production-bugfix-batch-20261011/evidence/asset-backup-before';
const hash = (file) => { try { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16); } catch { return 'MISSING'; } };

const stones = JSON.parse(fs.readFileSync(`${CAND}/data/stones.json`, 'utf8').replace(/^\uFEFF/, ''));
const targets = [...new Set(stones.map((stone) => String(stone.image || '').replace(/^\/+/, '')))].filter((rel) => /^assets\//i.test(rel));
let different = 0;
let noBackup = 0;
for (const rel of targets) {
  const deployed = hash(`${REF}/${rel}`);
  const original = hash(path.join(BACK, path.basename(rel)));
  if (original === 'MISSING') { noBackup += 1; console.log('NO-BACKUP      ', rel, 'deployed', deployed); continue; }
  if (deployed !== original) { different += 1; console.log('DIFFERS        ', rel, 'deployed', deployed, 'candidateOriginal', original); }
}
console.log(`checked ${targets.length}: deployed-vs-candidate-original differing ${different}, without backup ${noBackup}`);
