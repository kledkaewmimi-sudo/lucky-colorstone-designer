// Restores the stone catalog images from the pre-change backup taken by remove-stone-backgrounds.mjs.
import fs from 'node:fs';
import path from 'node:path';

const CAND = 'reports/production/full-uat-feature-migration-20261009/reconciled-candidate';
const BACKUP = 'reports/production/production-bugfix-batch-20261011/evidence/asset-backup-before';
if (!fs.existsSync(BACKUP)) { console.log('no backup directory'); process.exit(0); }
let restored = 0;
for (const name of fs.readdirSync(BACKUP)) {
  const source = path.join(BACKUP, name);
  if (fs.statSync(source).isDirectory()) continue;
  const target = path.join(CAND, 'assets', name);
  fs.copyFileSync(source, target);
  restored += 1;
  console.log('restored', name, fs.statSync(source).size);
}
console.log('restored files:', restored);
