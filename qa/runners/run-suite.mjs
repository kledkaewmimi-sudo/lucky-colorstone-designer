import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { REPO_ROOT } from '../lib/app-root.mjs';
import { nowIso, writeEvidence } from '../lib/evidence.mjs';

const suite = String(process.argv[2] || '').trim().toLowerCase();
const ciMode = process.env.CI === 'true' || process.argv.includes('--ci');
if (!suite) {
  console.error('Usage: node qa/runners/run-suite.mjs <catalog|crm|layout|checkout|security|browser>');
  process.exit(2);
}

const registry = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'qa', 'registry.json'), 'utf8'));
const selected = (registry.tools || []).filter((tool) => (
  tool.status === 'active'
  && Array.isArray(tool.suites)
  && (suite === 'all' ? tool.suites.length > 0 : tool.suites.includes(suite))
  && (!ciMode || tool.ciEligible !== false)
  && fs.existsSync(path.join(REPO_ROOT, tool.canonicalPath))
));

if (selected.length === 0) {
  console.error(`No active registry tools found for suite: ${suite}`);
  process.exit(2);
}

function run(command, args) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(command, args, {
      cwd: REPO_ROOT,
      env: process.env,
      windowsHide: true,
      shell: false
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });
    child.on('error', (error) => resolve({
      exitCode: 1,
      durationMs: Date.now() - started,
      stdout,
      stderr: `${stderr}${error.message}`
    }));
    child.on('exit', (code) => resolve({
      exitCode: code ?? 1,
      durationMs: Date.now() - started,
      stdout,
      stderr
    }));
  });
}

const nodeTests = selected.filter((tool) => tool.runner === 'node-test');
const nodeScripts = selected.filter((tool) => tool.runner === 'node-script');
const executions = [];

if (nodeTests.length > 0) {
  const paths = [...new Set(nodeTests.map((tool) => tool.canonicalPath))];
  const result = await run(process.execPath, ['--test', ...paths]);
  executions.push({
    toolIds: nodeTests.map((tool) => tool.id),
    command: `${process.execPath} --test ${paths.join(' ')}`,
    ...result
  });
}

for (const tool of nodeScripts) {
  const result = await run(process.execPath, [tool.canonicalPath]);
  executions.push({
    toolIds: [tool.id],
    command: `${process.execPath} ${tool.canonicalPath}`,
    ...result
  });
}

const failed = executions.filter((execution) => execution.exitCode !== 0);
const result = {
  suite,
  ciMode,
  completedAt: nowIso(),
  tools: selected.map((tool) => ({
    id: tool.id,
    path: tool.canonicalPath,
    safety: tool.safety,
    evidence: tool.evidence
  })),
  executions,
  pass: failed.length === 0,
  failedToolIds: failed.flatMap((execution) => execution.toolIds)
};
const evidencePath = writeEvidence(`reports/qa/${suite}/latest.json`, result);
console.log(JSON.stringify({
  suite,
  pass: result.pass,
  tools: selected.length,
  executions: executions.length,
  failed: result.failedToolIds,
  evidencePath
}, null, 2));
if (!result.pass) process.exitCode = 1;
