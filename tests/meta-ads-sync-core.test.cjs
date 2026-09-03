'use strict';

const assert = require('node:assert/strict');
const { HOURLY_BREAKDOWN, parseHourStart, localHourToUtc, nullableNumber, normalizeInsight, makeSupabaseUpsertRequest, isRateLimitResponse } = require('../scripts/lib/meta-ads-sync-core.js');
const { getAllInsights, metaRequest } = require('../scripts/meta-ads-sync.js');

assert.equal(parseHourStart('09:00:00 - 09:59:59'), '09:00:00');
assert.equal(parseHourStart('24:00:00 - 24:59:59'), null);
assert.equal(parseHourStart(null), null);
assert.deepEqual(localHourToUtc('2026-09-01', '09:00:00', 'Asia/Bangkok'), { utc: '2026-09-01T02:00:00.000Z', status: 'exact' });
assert.equal(localHourToUtc('2026-11-01', '01:00:00', 'America/New_York').status, 'ambiguous');
assert.equal(nullableNumber('12.3400'), 12.34);
assert.equal(nullableNumber(''), null);
assert.equal(nullableNumber('not-a-number'), null);

const raw = { account_id: 'act_7', date_start: '2026-09-01', ad_id: 'ad-9', spend: '10.50', impressions: '120', clicks: '4', inline_link_clicks: null, ctr: '3.333', actions: [{ action_type: 'purchase', value: '2' }], action_values: [{ action_type: 'purchase', value: '100.5' }], [HOURLY_BREAKDOWN]: '09:00:00 - 09:59:59', publisher_platform: 'instagram', platform_position: 'stream', device_platform: 'mobile' };
const row = normalizeInsight(raw, { accountId: 'act_7', accountTimezone: 'Asia/Bangkok', apiVersion: 'v24.0', fetchedAt: '2026-09-01T03:00:00.000Z' });
assert.equal(row.spend, 10.5);
assert.equal(row.link_clicks, null);
assert.deepEqual(row.raw_actions, raw.actions);
assert.equal(row.insight_key, 'act_7|2026-09-01|09:00:00|ad-9|instagram|stream|mobile');
assert.deepEqual(normalizeInsight({ ...raw, publisher_platform: null, platform_position: null, device_platform: null }, { accountId: 'act_7', accountTimezone: 'Asia/Bangkok', apiVersion: 'v24.0' }).insight_key, 'act_7|2026-09-01|09:00:00|ad-9|unknown|unknown|unknown');
assert.throws(() => normalizeInsight({ ...raw, [HOURLY_BREAKDOWN]: null }, { accountId: 'act_7', accountTimezone: 'Asia/Bangkok', apiVersion: 'v24.0' }), /hourly breakdown/);

const request = makeSupabaseUpsertRequest('https://example.supabase.co/', 'secret', [row]);
assert.match(request.url, /on_conflict=insight_key/);
assert.equal(request.options.headers.Prefer, 'resolution=merge-duplicates,return=minimal');
assert.equal(isRateLimitResponse({ status: 429 }, {}), true);
assert.equal(isRateLimitResponse({ status: 400 }, { error: { code: 613 } }), true);
assert.equal(isRateLimitResponse({ status: 400 }, { error: { code: 100 } }), false);
assert.deepEqual(JSON.parse(request.options.body), [row]);

async function testCollectorTransport() {
  const originalFetch = global.fetch;
  try {
    const pages = [
      new Response(JSON.stringify({ data: [{ id: 'first' }], paging: { next: 'https://example.test/page-2' } }), { status: 200 }),
      new Response(JSON.stringify({ data: [{ id: 'second' }] }), { status: 200 })
    ];
    global.fetch = async () => pages.shift();
    assert.deepEqual(await getAllInsights('https://example.test/page-1', {}), [{ id: 'first' }, { id: 'second' }]);

    global.fetch = async () => new Response(JSON.stringify({ data: [] }), { status: 200 });
    assert.deepEqual(await getAllInsights('https://example.test/empty', {}), []);

    global.fetch = async () => new Response(JSON.stringify({ error: { code: 100, message: 'invalid field' } }), { status: 400 });
    await assert.rejects(() => metaRequest('https://example.test/failure', {}), /Meta API request failed \(400\): invalid field/);
  } finally {
    global.fetch = originalFetch;
  }
}

testCollectorTransport().then(() => console.log('meta-ads-sync-core.test.cjs passed')).catch((error) => { console.error(error); process.exitCode = 1; });
