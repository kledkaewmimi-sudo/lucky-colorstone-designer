import { spawn } from 'node:child_process';
import { REPO_ROOT } from '../lib/app-root.mjs';
import { nowIso, writeEvidence } from '../lib/evidence.mjs';

function runNode(relativePath, args = []) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [relativePath, ...args], {
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
    child.on('error', (error) => resolve({ exitCode: 1, durationMs: Date.now() - started, stdout, stderr: error.message }));
    child.on('exit', (code) => resolve({ exitCode: code ?? 1, durationMs: Date.now() - started, stdout, stderr }));
  });
}

const steps = [];
for (const [label, file, args] of [
  ['doctor', 'qa/runners/doctor.mjs', []],
  ['curated suites', 'qa/runners/run-suite.mjs', ['all']],
  ['artifact integrity', 'qa/tools/artifact-integrity.mjs', []]
]) {
  const result = await runNode(file, args);
  steps.push({ label, file, exitCode: result.exitCode, durationMs: result.durationMs, stderrTail: result.stderr.slice(-500) });
  if (result.exitCode !== 0) break;
}

const result = {
  completedAt: nowIso(),
  steps,
  pass: steps.length === 3 && steps.every((step) => step.exitCode === 0)
};
const outputPath = writeEvidence('reports/qa/deployment/predeploy-latest.json', result);
console.log(JSON.stringify({ ...result, outputPath }, null, 2));
if (!result.pass) process.exitCode = 1;
