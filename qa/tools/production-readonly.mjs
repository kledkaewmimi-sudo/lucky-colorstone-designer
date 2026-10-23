import { nowIso, writeEvidence } from '../lib/evidence.mjs';

const CUSTOMER = 'https://customize.luckycolorstone.com';
const CRM = 'https://crm.luckycolorstone.com';
const checks = [];
const check = (name, pass, details = {}) => checks.push({ name, pass: Boolean(pass), ...details });

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    cache: 'no-store',
    signal: AbortSignal.timeout(20000)
  });
  const body = await response.text();
  return { status: response.status, headers: Object.fromEntries(response.headers), body };
}

const publicEndpoints = [
  [`${CUSTOMER}/`, 200],
  [`${CUSTOMER}/app.js`, 200],
  [`${CUSTOMER}/product-card-badges.js`, 200],
  [`${CUSTOMER}/api/settings`, 200],
  [`${CUSTOMER}/api/stones`, 200],
  [`${CUSTOMER}/api/charms`, 200],
  [`${CUSTOMER}/api/spacers`, 200],
  [`${CRM}/`, 200],
  [`${CRM}/crm.html`, 200],
  [`${CRM}/crm.js`, 200],
  [`${CRM}/api/settings`, 200]
];

const settingsResponse = await request(`${CRM}/api/settings`);
let settings = null;
try {
  settings = JSON.parse(settingsResponse.body);
} catch {
  settings = null;
}

for (const [url, expectedStatus] of publicEndpoints) {
  try {
    const response = await request(url);
    check(`${url} returns HTTP ${expectedStatus}`, response.status === expectedStatus, {
      status: response.status
    });
  } catch (error) {
    check(`${url} is reachable`, false, { error: error.message });
  }
}

for (const [url, expectedStatuses] of [
  [`${CRM}/api/crm/orders`, [401, 403]],
  [`${CRM}/api/crm/overview`, [401, 403]],
  [`${CUSTOMER}/api/orders`, [401, 403]]
]) {
  try {
    const response = await request(url);
    check(`${url} blocks anonymous access`, expectedStatuses.includes(response.status), {
      status: response.status
    });
  } catch (error) {
    check(`${url} is reachable`, false, { error: error.message });
  }
}

check('Production settings are valid JSON', Boolean(settings));
check('Production settings expose global discount configuration',
  settings && Number.isFinite(Number(settings.globalDiscountPercent))
);
check('Production settings expose catalog layout order',
  settings?.catalogLayoutOrder &&
    Array.isArray(settings.catalogLayoutOrder.stones) &&
    Array.isArray(settings.catalogLayoutOrder.charms) &&
    Array.isArray(settings.catalogLayoutOrder.spacers)
);
for (const category of ['stones', 'charms', 'spacers']) {
  const ids = settings?.catalogLayoutOrder?.[category] || [];
  check(`Production ${category} layout order has no duplicates`,
    new Set(ids).size === ids.length,
    { count: ids.length }
  );
}

for (const asset of ['assets/charms/heart-gold.webp', 'assets/charms/star-gold.webp']) {
  try {
    const response = await request(`${CUSTOMER}/${asset}`);
    check(`Production required asset ${asset} returns HTTP 200`, response.status === 200, {
      status: response.status,
      contentType: response.headers['content-type'] || null
    });
  } catch (error) {
    check(`Production required asset ${asset} is reachable`, false, { error: error.message });
  }
}

const result = {
  completedAt: nowIso(),
  mode: 'remote-read',
  writesPerformed: false,
  customerOrigin: CUSTOMER,
  crmOrigin: CRM,
  checks,
  pass: checks.every((entry) => entry.pass)
};
const outputPath = writeEvidence('reports/qa/production/latest.json', result);
console.log(JSON.stringify({
  pass: result.pass,
  checks: checks.length,
  failed: checks.filter((entry) => !entry.pass).length,
  outputPath
}, null, 2));
if (!result.pass) process.exitCode = 1;
