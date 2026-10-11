// Builds before/after trees for the Step 3 interaction performance comparison:
//   before = the currently deployed app.js (git HEAD = dpl_9PEQomhLhh1jxeGrC3vT9b4MwKdE)
//   after  = the working candidate (coalesced composition render)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..', '..');
const CAND = path.join(REPO, 'reports/production/full-uat-feature-migration-20261009/reconciled-candidate');
const OUT = path.join(REPO, 'reports/production/production-bugfix-batch-20261011/evidence/perf-ab');
const SPEC = path.join(HERE, 'step3-perf.spec.mjs');
const heavyDirs = ['assets', 'data', 'lumi', 'api', 'node_modules'];

const headApp = execFileSync('git', ['show', 'HEAD:reports/production/full-uat-feature-migration-20261009/reconciled-candidate/app.js'], { maxBuffer: 1 << 28 });
// The deployed (non-faststart) designing video, so the video-load comparison is against the real
// previous bytes rather than against the re-muxed file.

for (const name of ['before', 'after']) {
  const dir = path.join(OUT, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true });
  for (const entry of fs.readdirSync(CAND, { withFileTypes: true })) {
    if (entry.isDirectory() || entry.isSymbolicLink()) continue;
    if (/\.(zip|rar|png|jpg|jpeg|webp)$/i.test(entry.name)) continue;
    fs.copyFileSync(path.join(CAND, entry.name), path.join(dir, entry.name));
  }
  for (const heavy of heavyDirs) {
    const target = path.join(CAND, heavy);
    if (fs.existsSync(target)) fs.symlinkSync(target, path.join(dir, heavy), 'junction');
  }
  if (name === 'before') fs.writeFileSync(path.join(dir, 'app.js'), headApp);
  fs.copyFileSync(SPEC, path.join(dir, 'tests', 'step3-perf.spec.mjs'));
  console.log(name, '->', dir);
}
