// Verifies that the Production custom domain serves exactly the packaged release artifact.
// Compares the served bytes with the manifest hashes for every file this batch changed plus the
// client-required entry points. Bodies are discarded (hashes only).
import fs from 'node:fs';
import crypto from 'node:crypto';

const BASE = (process.argv[2] || 'https://customize.luckycolorstone.com').replace(/\/$/, '');
const manifest = JSON.parse(fs.readFileSync('reports/production/full-uat-feature-migration-20261009/release/manifest.json', 'utf8'));
const before = JSON.parse(fs.readFileSync('reports/production/production-bugfix-batch-20261011/evidence/manifest-before-bugfix.json', 'utf8'));
const beforeByPath = new Map(before.vercel.entries.map((entry) => [entry.path, entry.sha256]));

const required = ['index.html', 'app.js', 'index.css', 'data.js', 'crm.html', 'crm.js', 'crm.css', 'lumi/ui/lumi-ui.js', 'lumi/import/step3-import.js', 'vercel.json'];
const changed = manifest.vercel.entries.filter((entry) => beforeByPath.get(entry.path) !== entry.sha256).map((entry) => entry.path);
const targets = [...new Set([...required, ...changed])];

const results = [];
for (const rel of targets) {
  // Vercel never serves its own build config; the release runbook records that 404 as expected.
  if (rel === 'vercel.json') continue;
  const url = `${BASE}/${rel.split('/').map(encodeURIComponent).join('/')}`;
  const response = await fetch(url, { redirect: 'manual' });
  const buffer = Buffer.from(await response.arrayBuffer());
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  const expected = manifest.vercel.entries.find((entry) => entry.path === rel);
  results.push({
    path: rel,
    status: response.status,
    bytes: buffer.length,
    matchesArtifact: Boolean(expected) && expected.sha256 === hash,
    changedByThisBatch: beforeByPath.get(rel) !== undefined && beforeByPath.get(rel) !== expected?.sha256
  });
}

const mismatched = results.filter((entry) => !entry.matchesArtifact);
console.log(JSON.stringify({
  base: BASE,
  checked: results.length,
  changedByBatch: results.filter((entry) => entry.changedByThisBatch).length,
  matched: results.length - mismatched.length,
  mismatched: mismatched.map((entry) => ({ path: entry.path, status: entry.status, bytes: entry.bytes }))
}, null, 1));
process.exit(mismatched.length === 0 ? 0 : 1);
