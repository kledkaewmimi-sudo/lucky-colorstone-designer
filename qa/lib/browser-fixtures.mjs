import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const playwright = require('playwright');

export async function createFixtureBrowserContext(browser, {
  origin,
  width,
  settings,
  stones,
  charms,
  spacers
}) {
  const context = await browser.newContext({
    viewport: { width, height: width <= 600 ? 844 : 1000 },
    serviceWorkers: 'block'
  });
  await context.addInitScript(() => {
    localStorage.setItem('lucky_step3_onboarding_v1', 'completed');
    localStorage.setItem('lucky_crm_session', 'true');
    window.liff = {
      init: async () => {},
      isLoggedIn: () => true,
      isInClient: () => true,
      getProfile: async () => ({ userId: 'U_QA_FIXTURE', displayName: 'QA Fixture' }),
      getFriendship: async () => ({ friendFlag: true }),
      getContext: () => ({ viewType: 'full' })
    };
  });
  await context.route('**/*', async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    if (requestUrl.origin !== origin) {
      if (/google|facebook|tiktok|line-scdn|stripe/i.test(requestUrl.hostname)) {
        await route.fulfill({ status: 204, body: '' });
      } else {
        await route.abort();
      }
      return;
    }
    if (!requestUrl.pathname.startsWith('/api/')) {
      await route.continue();
      return;
    }
    const json = (payload, status = 200) => route.fulfill({
      status,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(payload)
    });

    if (requestUrl.pathname === '/api/admin/session') return json({ authenticated: true });
    if (requestUrl.pathname === '/api/admin/login') return json({ authenticated: true });
    if (requestUrl.pathname === '/api/settings' && request.method() === 'GET') return json(settings);
    if (requestUrl.pathname === '/api/settings/save' && request.method() === 'POST') {
      const body = JSON.parse(request.postData() || '{}');
      Object.keys(settings).forEach((key) => delete settings[key]);
      Object.assign(settings, body);
      return json(settings);
    }
    if (requestUrl.pathname === '/api/charms') return json(charms);
    if (requestUrl.pathname === '/api/stones') return json(stones);
    if (requestUrl.pathname === '/api/spacers') return json(spacers);
    if (requestUrl.pathname.startsWith('/api/charms/') && request.method() === 'PUT') {
      const charmId = decodeURIComponent(requestUrl.pathname.slice('/api/charms/'.length));
      const body = JSON.parse(request.postData() || '{}');
      const index = charms.findIndex((entry) => entry.id === charmId);
      if (index < 0) return json({ error: 'Charm not found' }, 404);
      charms[index] = { ...charms[index], ...body };
      return json(charms[index]);
    }
    if (requestUrl.pathname === '/api/purchases') return json([]);
    if (requestUrl.pathname === '/api/purchase-costs') return json({ stones: [], charms: [], spacers: [] });
    if (requestUrl.pathname === '/api/crm/overview') {
      return json({ paidOrderCount: 0, revenue: 0, recentOrders: [] });
    }
    if (requestUrl.pathname === '/api/crm/orders') {
      return json({ orders: [], page: 1, limit: 20, total: 0, totalPages: 0, previewTransport: 'url' });
    }
    if (requestUrl.pathname === '/api/liff-config') return json({});
    if (requestUrl.pathname === '/api/tracking/config') return json({ enabled: false });
    if (requestUrl.pathname === '/api/social-proof') return json({ recentBracelets: [] });
    if (requestUrl.pathname.startsWith('/api/analytics/')) return route.fulfill({ status: 204, body: '' });
    return json({});
  });
  return context;
}

export function browserType() {
  return playwright;
}
