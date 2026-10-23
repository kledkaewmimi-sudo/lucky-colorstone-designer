import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { resolveApplicationRoot, REPO_ROOT } from '../lib/app-root.mjs';
import { nowIso, writeEvidence } from '../lib/evidence.mjs';
import { readRegistry, validateRegistry } from '../lib/registry.mjs';

const require = createRequire(import.meta.url);
const ciMode = process.argv.includes('--ci');
const checks = [];
const warnings = [];
const check = (name, pass, details = {}) => checks.push({ name, pass: Boolean(pass), ...details });

const majorNodeVersion = Number(process.versions.node.split('.')[0]);
check('Node.js >= 20', majorNodeVersion >= 20, { version: process.versions.node });
check('package.json exists', fs.existsSync(path.join(REPO_ROOT, 'package.json')));
check('package-lock.json exists', fs.existsSync(path.join(REPO_ROOT, 'package-lock.json')));

const registry = readRegistry();
const registryIssues = validateRegistry(registry, { ciMode });
check('QA registry is valid', registryIssues.length === 0, { issues: registryIssues });
check('QA registry has active tools', registry.tools.some((tool) => tool.status === 'active'));

let playwright = null;
try {
  playwright = require('playwright');
  check('Playwright module is installed', Boolean(playwright.chromium));
  const executable = playwright.chromium.executablePath();
  check('Chromium executable is available', Boolean(executable) && fs.existsSync(executable), { executable });
} catch (error) {
  check('Playwright module is installed', false, { error: error.message });
}

try {
  const app = resolveApplicationRoot({ requireAdvanced: false });
  check('QA application root resolves', true, { root: app.root, source: app.source, advanced: app.advanced });
  if (!app.advanced) {
    const message = 'Advanced Phase 2.29/2.30 browser coverage requires QA_APP_ROOT or a local production candidate.';
    if (ciMode) warnings.push(message);
    else check('Advanced browser fixture source is available', false, { message });
  } else {
    check('Advanced browser fixture source is available', true, { root: app.root });
  }
} catch (error) {
  check('QA application root resolves', false, { error: error.message });
}

const scripts = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')).scripts || {};
for (const script of ['qa:doctor', 'qa:find', 'test:catalog', 'test:crm', 'test:layout', 'test:browser', 'test:checkout', 'test:security', 'qa:predeploy', 'qa:production']) {
  check(`package script ${script} exists`, Boolean(scripts[script]));
}

const isWindows = process.platform === 'win32';
const cliChecks = [
  { command: 'git', executable: isWindows ? 'git.exe' : 'git', args: ['--version'], required: true },
  { command: 'node', executable: process.execPath, args: ['--version'], required: true },
  {
    command: 'npm',
    executable: isWindows ? 'cmd.exe' : 'npm',
    args: isWindows ? ['/d', '/s', '/c', 'npm.cmd --version'] : ['--version'],
    required: true
  },
  {
    command: 'vercel',
    executable: isWindows ? 'where.exe' : 'which',
    args: [isWindows ? 'vercel.cmd' : 'vercel'],
    required: false
  },
  {
    command: 'powershell.exe',
    executable: isWindows ? 'powershell.exe' : 'bash',
    args: isWindows ? ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'] : ['--version'],
    required: false
  }
];
for (const item of cliChecks) {
  try {
    execFileSync(item.executable, item.args, {
      stdio: 'ignore',
      windowsHide: true
    });
    check(`CLI ${item.command} is available`, true);
  } catch (error) {
    if (item.required) check(`CLI ${item.command} is available`, false);
    else warnings.push(`${item.command} is unavailable; related optional tools will report their own failure.`);
  }
}

let supabaseModule = false;
try {
  require.resolve('@supabase/supabase-js');
  supabaseModule = true;
} catch {}
if (!supabaseModule) warnings.push('@supabase/supabase-js is not installed; dry-run migration scripts remain unavailable.');

const result = {
  completedAt: nowIso(),
  mode: ciMode ? 'ci' : 'local',
  checks,
  warnings,
  pass: checks.every((entry) => entry.pass)
};
const outputPath = writeEvidence('reports/qa/doctor/latest.json', result);
console.log(JSON.stringify({
  pass: result.pass,
  checks: checks.length,
  failed: checks.filter((entry) => !entry.pass).length,
  warnings,
  outputPath
}, null, 2));
if (!result.pass) process.exitCode = 1;
