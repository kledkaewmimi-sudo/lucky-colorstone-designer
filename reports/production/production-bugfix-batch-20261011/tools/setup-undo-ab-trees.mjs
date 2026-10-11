// TASK A1: builds isolated variant trees for the WebKit Undo A/B investigation.
//
//   node .../setup-undo-ab-trees.mjs
//
// Each tree is a static copy of the release candidate root (small root files) plus junctions to the
// heavy directories, with app.js / index.css replaced by the variant under test:
//   base     - committed turn-5 code (click-bound removal, old CSS) = the pre-Turn-6 baseline
//   cssonly  - turn-5 app.js + turn-6 CSS (touch/hover affordances only)
//   t6       - turn-6 app.js (pointerup removal) + turn-6 CSS
//   fix      - turn-6 app.js + the undo-capture correction + turn-6 CSS
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..', '..');
const CAND = path.join(REPO, 'reports/production/full-uat-feature-migration-20261009/reconciled-candidate');
const OUT = path.join(REPO, 'reports/production/production-bugfix-batch-20261011/evidence/undo-ab');
const SPEC = path.join(REPO, 'reports/production/production-bugfix-batch-20261011/tools/undo-ab.spec.mjs');

const committed = (file) => execFileSync('git', ['show', `66fefd6:reports/production/full-uat-feature-migration-20261009/reconciled-candidate/${file}`], { maxBuffer: 1 << 28 });
const variantApp = {
  base: committed('app.js'),
  cssonly: committed('app.js'),
  t6: fs.readFileSync(path.join(CAND, 'app.js')),
  fix: null // filled in by the caller after applying the capture fix
};
const variantCss = {
  base: committed('index.css'),
  cssonly: fs.readFileSync(path.join(CAND, 'index.css')),
  t6: fs.readFileSync(path.join(CAND, 'index.css')),
  fix: fs.readFileSync(path.join(CAND, 'index.css'))
};

const heavyDirs = ['assets', 'data', 'lumi', 'api', 'node_modules'];
const variants = process.argv.slice(2).filter((name) => name in variantApp);
const names = variants.length > 0 ? variants : ['base', 'cssonly', 't6', 'fix'];

for (const name of names) {
  const dir = path.join(OUT, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true });
  for (const entry of fs.readdirSync(CAND, { withFileTypes: true })) {
    // Directories and symlinked/junctioned directories are re-created below on purpose.
    if (entry.isDirectory() || entry.isSymbolicLink()) continue;
    if (/\.(zip|rar|png|jpg|jpeg|webp)$/i.test(entry.name)) continue;
    fs.copyFileSync(path.join(CAND, entry.name), path.join(dir, entry.name));
  }
  for (const heavy of heavyDirs) {
    const target = path.join(CAND, heavy);
    if (!fs.existsSync(target)) continue;
    fs.symlinkSync(target, path.join(dir, heavy), 'junction');
  }
  if (variantApp[name]) fs.writeFileSync(path.join(dir, 'app.js'), variantApp[name]);
  if (variantCss[name]) fs.writeFileSync(path.join(dir, 'index.css'), variantCss[name]);
  fs.copyFileSync(SPEC, path.join(dir, 'tests', 'undo-ab.spec.mjs'));
  console.log(name, '->', dir, 'app.js', variantApp[name] ? 'set' : 'from candidate');
}
