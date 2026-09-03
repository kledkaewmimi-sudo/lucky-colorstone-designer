'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { BANGKOK_TIME_ZONE, REQUIRED_ENVIRONMENT_NAMES, acquireLocalLock, addCalendarDays, bangkokToday, buildJobPlan, lockPathFor, runCommand, safeEvent, validateRequiredEnvironment } = require('../scripts/meta-ads-scheduled-worker.js');

const now = new Date('2026-09-03T19:30:00.000Z'); // 02:30 on 2026-09-04 in Bangkok
assert.equal(BANGKOK_TIME_ZONE, 'Asia/Bangkok');
assert.equal(bangkokToday(now), '2026-09-04');
assert.equal(addCalendarDays('2026-09-01', -3), '2026-08-29');
assert.equal(addCalendarDays('2026-03-01', -1), '2026-02-28');

const hourly = buildJobPlan('hourly-performance', now);
assert.deepEqual({ since: hourly.since, until: hourly.until }, { since: '2026-09-03', until: '2026-09-04' });
assert.equal(hourly.commands.length, 1);
assert.deepEqual(hourly.commands[0].args.slice(-4), ['--since', '2026-09-03', '--until', '2026-09-04']);

const daily = buildJobPlan('daily-demographics', now);
assert.deepEqual({ since: daily.since, until: daily.until }, { since: '2026-09-03', until: '2026-09-03' });
assert.equal(daily.commands.length, 1);
assert.equal(daily.commands[0].args.includes('--granularity'), true);
assert.equal(daily.commands[0].args.includes('daily'), true);
assert.equal(daily.commands[0].args.includes('age_gender'), true);

const reconciliation = buildJobPlan('reconcile', now);
assert.deepEqual({ since: reconciliation.since, until: reconciliation.until }, { since: '2026-09-01', until: '2026-09-03' });
assert.equal(reconciliation.commands.length, 2);
assert.equal(reconciliation.commands[0].args[0].endsWith('meta-ads-sync.js'), true);
assert.equal(reconciliation.commands[1].args[0].endsWith('meta-ads-analytics-sync.js'), true);
const scheduledAtTwo = buildJobPlan('scheduled', new Date('2026-09-03T19:05:00.000Z'));
assert.equal(scheduledAtTwo.commands.length, 2, '02:05 Bangkok runs baseline plus daily demographics');
const scheduledAtThree = buildJobPlan('scheduled', new Date('2026-09-03T20:05:00.000Z'));
assert.equal(scheduledAtThree.commands.length, 3, '03:05 Bangkok runs baseline plus both reconciliation passes');
const scheduledAtNoon = buildJobPlan('scheduled', new Date('2026-09-03T05:05:00.000Z'));
assert.equal(scheduledAtNoon.commands.length, 1, 'ordinary hourly run is baseline only');
assert.throws(() => buildJobPlan('placement', now), /Unknown job/);

const completeEnvironment = Object.fromEntries(REQUIRED_ENVIRONMENT_NAMES.map((name) => [name, 'configured']));
assert.doesNotThrow(() => validateRequiredEnvironment(completeEnvironment));
assert.throws(() => validateRequiredEnvironment({ META_AD_ACCOUNT_ID: 'only-this' }), /META_ACCESS_TOKEN/);
assert.equal(safeEvent({ token: 'not-a-token', message: 'https://example.test/?access_token=secret-value&x=1' }).includes('secret-value'), false);

const lockPath = lockPathFor('test-worker-lock');
try { fs.unlinkSync(lockPath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const release = acquireLocalLock('test-worker-lock');
assert.equal(fs.existsSync(lockPath), true);
assert.throws(() => acquireLocalLock('test-worker-lock'), /Overlap guard/);
release();
assert.equal(fs.existsSync(lockPath), false);

async function testWorkerFailureIsolation() {
  await assert.rejects(
    () => runCommand({ executable: process.execPath, args: ['-e', 'process.exit(17)'] }),
    /collector exited unsuccessfully \(code=17/
  );
}

testWorkerFailureIsolation()
  .then(() => console.log('meta-ads-scheduled-worker.test.cjs passed'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
