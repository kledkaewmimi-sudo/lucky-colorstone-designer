// Pre-deploy gate: list every file where the current production candidate differs from the last
// deployed release artifact (manifest.json), so unexplained drift cannot be shipped silently.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const RELEASE_ROOT = 'reports/production/full-uat-feature-migration-20261009';
const SRC = `${RELEASE_ROOT}/reconciled-candidate`;
const RELEASE = `${RELEASE_ROOT}/release`;
const manifest = JSON.parse(fs.readFileSync(`${RELEASE}/manifest.json`, 'utf8'));
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

const changed = [];
const missing = [];
const added = [];
const deployedPaths = new Set(manifest.vercel.entries.map((entry) => entry.path));

for (const entry of manifest.vercel.entries) {
  const file = path.join(SRC, entry.path);
  if (!fs.existsSync(file)) { missing.push(entry.path); continue; }
  const current = sha(file);
  if (current !== entry.sha256) changed.push({ path: entry.path, deployedBytes: entry.bytes, currentBytes: fs.statSync(file).size });
}

// Anything the candidate would now publish that the deployed manifest does not contain.
const walk = (dir, rel = '') => {
  const out = [];
  for (const item of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const next = rel ? `${rel}/${item.name}` : item.name;
    if (item.isDirectory()) { out.push(...walk(dir, next)); continue; }
    out.push(next);
  }
  return out;
};
for (const rel of walk(SRC)) {
  if (deployedPaths.has(rel)) continue;
  if (/^(server\.js|server\.ps1|tests\/|reports\/|supabase\/|scripts\/|\.github\/|node_modules\/|\.vercel\/|\.serena\/|\.worktrees\/|\.migration-staging\/|\.playwright-cli\/|assets_backup\/|test-results|.*\.md$|.*\.zip$|.*\.rar$|\.env|_probe-|kyanite-modal|.*\.log$|package(-lock)?\.json|.*\.tmp-bgfix$)/.test(rel)) continue;
  added.push(rel);
}

console.log('deployed manifest files:', manifest.vercel.entries.length);
console.log('CHANGED since deployment:', changed.length);
for (const entry of changed) console.log('  ~', entry.path, entry.deployedBytes, '->', entry.currentBytes);
console.log('MISSING now:', missing.length, missing.join(', '));
console.log('NOT IN THE OLD MANIFEST (candidate-only, review):', added.length);
for (const rel of added) console.log('  +', rel);
