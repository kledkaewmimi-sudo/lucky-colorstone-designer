import fs from 'node:fs';
import path from 'node:path';
import { resolveApplicationRoot } from '../lib/app-root.mjs';
import { hashFile, manifestFiles, sha256 } from '../lib/file-hash.mjs';
import { nowIso, writeEvidence } from '../lib/evidence.mjs';

const app = resolveApplicationRoot({ requireAdvanced: true });
const sourceRoot = app.root;
const staticRoot = path.join(sourceRoot, '.vercel', 'output', 'static');
const requiredFiles = [
  'index.html',
  'app.js',
  'data.js',
  'product-card-badges.js',
  'crm.html',
  'crm.js',
  'index.css',
  'crm.css',
  'data/settings.json',
  'assets/charms/heart-gold.webp',
  'assets/charms/star-gold.webp'
];
const checks = [];
const check = (name, pass, details = {}) => checks.push({ name, pass: Boolean(pass), ...details });

check('Build output exists', fs.existsSync(staticRoot), { staticRoot });
for (const relative of requiredFiles) {
  const sourcePath = path.join(sourceRoot, relative);
  const staticPath = path.join(staticRoot, relative);
  const sourceExists = fs.existsSync(sourcePath);
  const staticExists = fs.existsSync(staticPath);
  check(`Source contains ${relative}`, sourceExists);
  check(`Build contains ${relative}`, staticExists);
  if (sourceExists && staticExists) {
    const sourceHash = hashFile(sourcePath);
    const staticHash = hashFile(staticPath);
    check(`Built ${relative} matches source`, sourceHash === staticHash, { sourceHash, staticHash });
  }
}

const forbidden = ['server.js', 'server.ps1', '.env', '.env.local', 'package-lock.json'];
for (const relative of forbidden) {
  check(`Build excludes ${relative}`, !fs.existsSync(path.join(staticRoot, relative)));
}

const manifest = manifestFiles(staticRoot);
const aggregateSha256 = sha256(manifest.files.map((file) => `${file.path}\0${file.sha256}\n`).join(''));
const result = {
  completedAt: nowIso(),
  mode: 'artifact-integrity',
  appRoot: sourceRoot,
  appRootSource: app.source,
  staticRoot,
  fileCount: manifest.files.length,
  totalBytes: manifest.files.reduce((sum, file) => sum + file.bytes, 0),
  aggregateSha256,
  checks,
  pass: checks.every((entry) => entry.pass)
};
const outputPath = writeEvidence('reports/qa/deployment/artifact-integrity.json', result);
console.log(JSON.stringify({
  pass: result.pass,
  checks: checks.length,
  failed: checks.filter((entry) => !entry.pass).length,
  fileCount: result.fileCount,
  aggregateSha256,
  outputPath
}, null, 2));
if (!result.pass) process.exitCode = 1;
