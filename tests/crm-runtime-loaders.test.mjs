import assert from 'node:assert/strict';
import test from 'node:test';
import { createCrmSettingsLoader, isValidCrmOverview, loadCrmOverviewWithFallback } from '../crm-runtime-loaders.mjs';

test('CRM settings loader shares one in-flight request and caches the successful value', async () => {
  let calls = 0;
  let release;
  const load = createCrmSettingsLoader(() => {
    calls += 1;
    return new Promise((resolve) => { release = resolve; });
  });
  const first = load();
  const second = load();
  assert.strictEqual(first, second);
  await Promise.resolve();
  release({ globalDiscountPercent: 10 });
  assert.deepEqual(await first, { globalDiscountPercent: 10 });
  assert.deepEqual(await second, { globalDiscountPercent: 10 });
  assert.deepEqual(await load(), { globalDiscountPercent: 10 });
  assert.equal(calls, 1);
});

test('CRM settings loader clears its in-flight guard after failure and retries', async () => {
  let calls = 0;
  const load = createCrmSettingsLoader(() => {
    calls += 1;
    if (calls === 1) throw new Error('temporary settings failure');
    return { globalDiscountPercent: 20 };
  });
  await assert.rejects(load(), /temporary settings failure/);
  assert.deepEqual(await load(), { globalDiscountPercent: 20 });
  assert.equal(calls, 2);
});

test('CRM overview validator requires both KPIs and recent orders', () => {
  assert.equal(isValidCrmOverview({ paidOrderCount: 1, revenue: 100, recentOrders: [] }), true);
  assert.equal(isValidCrmOverview({ paidOrderCount: 1, revenue: 100 }), false);
  assert.equal(isValidCrmOverview({ paidOrderCount: 'invalid', revenue: 100, recentOrders: [] }), false);
});

test('healthy CRM overview renders without invoking legacy fallback', async () => {
  let fallbackCalls = 0;
  let rendered;
  const result = await loadCrmOverviewWithFallback({
    requestOverview: async () => ({ paidOrderCount: 2, revenue: 300, recentOrders: [] }),
    renderOverview: (overview) => { rendered = overview; },
    fallback: async () => { fallbackCalls += 1; }
  });
  assert.equal(result.source, 'compact');
  assert.equal(fallbackCalls, 0);
  assert.deepEqual(rendered, { paidOrderCount: 2, revenue: 300, recentOrders: [] });
});

test('failed or invalid CRM overview invokes legacy fallback exactly once', async () => {
  for (const requestOverview of [
    async () => { throw new Error('overview failed'); },
    async () => ({ paidOrderCount: 2, revenue: 300 })
  ]) {
    let fallbackCalls = 0;
    const result = await loadCrmOverviewWithFallback({
      requestOverview,
      renderOverview: () => assert.fail('invalid overview must not render compact data'),
      fallback: async () => { fallbackCalls += 1; }
    });
    assert.equal(result.source, 'legacy');
    assert.equal(fallbackCalls, 1);
  }
});
