// Runs the hardened security harnesses against the current production candidate (they take the tree
// under test from LCS_BASELINE_DIR), so the public landing change is proven not to weaken any control.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CAND = path.resolve('reports/production/full-uat-feature-migration-20261009/reconciled-candidate');
const OUT = 'reports/production/production-bugfix-batch-20261011/evidence';
const suites = [
  '_hf-security-tests.mjs',
  '_hf-write-security-tests.mjs',
  '_hf-supabase-mode-tests.mjs',
  '_hf-payment-tests.mjs',
  '_hf-predeploy-topology-tests.mjs',
  '_hf-legacy-order-link-tests.mjs',
  '_hf-webhook-compat-tests.mjs',
  '_hf-rollback-safety-tests.mjs',
  '_hf-static-exposure-tests.mjs'
];

const results = [];
for (const suite of suites) {
  const result = spawnSync(process.execPath, [path.resolve('reports/production', suite)], {
    encoding: 'utf8',
    maxBuffer: 1 << 26,
    env: { ...process.env, LCS_BASELINE_DIR: CAND }
  });
  const stdout = String(result.stdout || '');
  const summaryLine = stdout.trim().split('\n').filter((line) => /"passed"|"total"|\bpass\b/.test(line)).slice(-3).join(' ');
  let summary = null;
  try { summary = JSON.parse(stdout.slice(stdout.indexOf('{'))); } catch { summary = null; }
  results.push({
    suite,
    exitCode: result.status,
    passed: summary?.passed ?? null,
    total: summary?.total ?? null,
    failed: summary?.failed?.length ?? null,
    summaryLine: summaryLine.slice(0, 200),
    stderrTail: String(result.stderr || '').trim().slice(-200)
  });
  console.log(`${suite} exit=${result.status} ${summary ? `${summary.passed}/${summary.total}` : summaryLine.slice(0, 120)}`);
}

const failedSuites = results.filter((entry) => entry.exitCode !== 0);
const report = {
  ranAt: new Date().toISOString(),
  candidate: CAND,
  suites: results,
  totalPassed: results.reduce((sum, entry) => sum + (entry.passed || 0), 0),
  totalAssertions: results.reduce((sum, entry) => sum + (entry.total || 0), 0),
  failedSuites: failedSuites.map((entry) => entry.suite)
};
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'security-suites-verification.json'), JSON.stringify(report, null, 1) + '\n', 'utf8');
console.log(JSON.stringify({ totalPassed: report.totalPassed, totalAssertions: report.totalAssertions, failedSuites: report.failedSuites }, null, 1));
process.exit(failedSuites.length === 0 ? 0 : 1);
