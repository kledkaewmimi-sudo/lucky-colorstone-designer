import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveApplicationRoot } from '../lib/app-root.mjs';
import { hashFile } from '../lib/file-hash.mjs';
import { nowIso, writeEvidence } from '../lib/evidence.mjs';

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || '' : '';
}

const deploymentUrl = String(argValue('--url') || process.env.QA_STAGE_URL || '').replace(/\/+$/, '');
if (!deploymentUrl) {
  console.error('Usage: node qa/tools/staged-artifact.mjs --url <protected-vercel-deployment-url>');
  process.exit(2);
}
let parsedUrl;
try {
  parsedUrl = new URL(deploymentUrl);
} catch {
  console.error('Invalid deployment URL.');
  process.exit(2);
}
if (parsedUrl.protocol !== 'https:' || !parsedUrl.hostname.endsWith('.vercel.app')) {
  console.error('Staged artifact verification requires an HTTPS *.vercel.app deployment URL.');
  process.exit(2);
}

const app = resolveApplicationRoot({ requireAdvanced: true });
const staticRoot = path.join(app.root, '.vercel', 'output', 'static');
const routes = [
  '/',
  '/crm.html',
  '/app.js',
  '/crm.js',
  '/crm.css',
  '/index.css',
  '/product-card-badges.js'
];
const localMap = new Map(routes.map((route) => [
  route,
  route === '/' ? 'index.html' : route.slice(1)
]));
const vercelCommand = process.env.VERCEL_CLI_PATH
  || (process.platform === 'win32' && process.env.APPDATA
    ? path.join(process.env.APPDATA, 'npm', 'vercel.cmd')
    : 'vercel');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcs-qa-stage-'));
const checks = [];

for (const route of routes) {
  const safeName = route === '/' ? 'index.html' : route.slice(1).replaceAll('/', '__');
  const bodyPath = path.join(tempDir, safeName);
  const result = spawnSync(vercelCommand, [
    'curl',
    `${deploymentUrl}${route}`,
    '--output',
    bodyPath
  ], {
    cwd: app.root,
    shell: true,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 45000
  });
  if (result.status !== 0 || !fs.existsSync(bodyPath)) {
    checks.push({
      route,
      pass: false,
      reason: (result.stderr || result.stdout || `exit ${result.status}`).slice(0, 300)
    });
    continue;
  }
  const remoteHash = hashFile(bodyPath);
  const localPath = path.join(staticRoot, localMap.get(route));
  const localHash = fs.existsSync(localPath) ? hashFile(localPath) : null;
  checks.push({
    route,
    pass: Boolean(localHash) && localHash === remoteHash,
    remoteHash,
    localHash
  });
}

const result = {
  completedAt: nowIso(),
  mode: 'remote-read',
  deploymentUrl,
  appRoot: app.root,
  appRootSource: app.source,
  checks,
  pass: checks.length === routes.length && checks.every((entry) => entry.pass)
};
const outputPath = writeEvidence('reports/qa/deployment/staged-artifact.json', result);
console.log(JSON.stringify({
  pass: result.pass,
  checks: checks.length,
  failed: checks.filter((entry) => !entry.pass).length,
  outputPath
}, null, 2));
if (!result.pass) process.exitCode = 1;
