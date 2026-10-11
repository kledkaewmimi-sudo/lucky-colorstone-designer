// Pre-deploy gate for the packaged release artifact: routing guards, the batch fixes being present,
// the changed-file list versus the previously deployed release, and the Render commit identity.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const RELEASE = 'reports/production/full-uat-feature-migration-20261009/release';
const ART = `${RELEASE}/artifact/vercel`;
const BENCH = 'reports/production/production-bugfix-batch-20261011/evidence';
const manifest = JSON.parse(fs.readFileSync(`${RELEASE}/manifest.json`, 'utf8'));
const beforeTurn1 = JSON.parse(fs.readFileSync(`${BENCH}/manifest-before-bugfix.json`, 'utf8'));      // before the 4-issue batch
const beforeThis = JSON.parse(fs.readFileSync(`${BENCH}/manifest-before-issue1-2.json`, 'utf8'));     // before this turn
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

const checks = [];
const check = (id, pass, detail = '') => checks.push({ id, pass: Boolean(pass), detail: String(detail).slice(0, 240) });

const vercelConfig = JSON.parse(fs.readFileSync(`${ART}/vercel.json`, 'utf8'));
const apiRoute = (vercelConfig.routes || []).find((route) => String(route.src).includes('/api/'));
check('routing still targets the Production Render service', apiRoute?.dest === 'https://lucky-colorstone-designer.onrender.com/api/$1', apiRoute?.dest || 'missing');
check('routing never targets UAT', Boolean(apiRoute) && !/uat/i.test(apiRoute.dest), apiRoute?.dest || '');
const hosts = (vercelConfig.routes || []).filter((route) => route.has).map((route) => route.has[0].value);
check('both production host rules are intact', hosts.includes('customize.luckycolorstone.com') && hosts.includes('crm.luckycolorstone.com'), hosts.join(', '));

const indexHtml = fs.readFileSync(`${ART}/index.html`, 'utf8');
const appJs = fs.readFileSync(`${ART}/app.js`, 'utf8');
const lumiUi = fs.readFileSync(`${ART}/lumi/ui/lumi-ui.js`, 'utf8');
check('four social-proof thumbnail slots are declared', (indexHtml.match(/class="sp-thumb"/g) || []).length === 4, String((indexHtml.match(/class="sp-thumb"/g) || []).length));
check('the landing client renders the published previews', appJs.includes('renderThumbs') && appJs.includes("fetch('/api/social-proof'"));
check('undo control, no auto Step 4 and the Lucky copy fix are all present',
  appJs.includes('undoLastBraceletAction')
  && appJs.includes("if (action === 'use') trackAnalyticsEvent")
  && !/messageScreen\([^)]*'undefined'/.test(lumiUi)
  && lumiUi.includes('กลับไปออกแบบเอง'));

const changedSinceTurn1 = manifest.vercel.entries.filter((entry) => beforeTurn1.vercel.entries.find((old) => old.path === entry.path)?.sha256 !== entry.sha256).map((entry) => entry.path);
const changedThisTurn = manifest.vercel.entries.filter((entry) => beforeThis.vercel.entries.find((old) => old.path === entry.path)?.sha256 !== entry.sha256).map((entry) => entry.path);
check('this turn changed only the landing client files', changedThisTurn.sort().join(',') === ['app.js', 'index.html', 'lumi/ui/lumi-ui.js'].join(','), changedThisTurn.join(', '));
check('the asset set from the previous batch is untouched', changedSinceTurn1.filter((rel) => /^assets\//.test(rel)).length === 35, changedSinceTurn1.filter((rel) => /^assets\//.test(rel)).length + ' asset files differ from the pre-batch release');

const renderServer = `${RELEASE}/artifact/render/server.js`;
check('the packaged Render artifact carries the approved backend', sha(renderServer) === sha('reports/production/full-uat-feature-migration-20261009/reconciled-candidate/server.js'), sha(renderServer).slice(0, 16));

const summary = {
  artifactFingerprint: manifest.vercel.fingerprint,
  renderFingerprint: manifest.render.fingerprint,
  changedThisTurn,
  passed: checks.filter((entry) => entry.pass).length,
  failed: checks.filter((entry) => !entry.pass).map((entry) => entry.id),
  checks
};
fs.mkdirSync(BENCH, { recursive: true });
fs.writeFileSync(path.join(BENCH, 'release-artifact-verification.json'), JSON.stringify(summary, null, 1) + '\n', 'utf8');
console.log(JSON.stringify(summary, null, 1));
process.exit(summary.failed.length === 0 ? 0 : 1);
