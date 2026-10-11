// Functional verification of the public landing social-proof endpoint (issue 1), offline and
// read-only against synthetic data: the newest four eligible bracelet previews, newest first, the
// aggregate count, no customer/order data anywhere in the payload, image optimization and caching.
//
//   node .../verify-social-proof-backend.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import sharp from 'sharp';

const CAND = 'reports/production/full-uat-feature-migration-20261009/reconciled-candidate';
const OUT = 'reports/production/production-bugfix-batch-20261011/evidence';
const FIXTURE = path.join(OUT, 'social-proof-fixture-data');
fs.mkdirSync(FIXTURE, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const solidPngDataUrl = async (rgb, size = 96) => {
  const buffer = await sharp({ create: { width: size, height: size, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } }).png().toBuffer();
  return 'data:image/png;base64,' + buffer.toString('base64');
};

const COLORS = {
  o1: [255, 0, 0],
  o2: [0, 200, 0],
  o4: [0, 0, 255],
  o6: [255, 255, 0],
  o7: [0, 255, 255],
  unpaid: [255, 0, 255],
  oversized: [128, 128, 128]
};
const previews = Object.fromEntries(await Promise.all(Object.entries(COLORS).map(async ([key, rgb]) => [key, await solidPngDataUrl(rgb)])));

const pii = {
  customerName: 'TEST-OWNER-NAME',
  phoneNumber: '0812345678',
  email: 'test@example.com',
  lineUserId: 'U1234567890abcdef',
  addressLine: 'TEST-STREET-99'
};

const order = (id, createdAt, status, preview, extra = {}) => ({
  id,
  date: createdAt.slice(0, 10),
  created_at: createdAt,
  stripePaymentStatus: status,
  paymentStatus: status,
  braceletPreviewImage: preview,
  checkoutSummary: { braceletPreviewImage: preview },
  ...pii,
  ...extra
});

const orders = [
  order('TEST-ORDER-0001', '2026-10-05T10:00:00.000Z', 'paid', previews.o1),
  order('TEST-ORDER-0002', '2026-10-06T10:00:00.000Z', 'paid', previews.o2),
  order('TEST-ORDER-0003', '2026-10-07T10:00:00.000Z', 'paid', null),                 // no preview -> skipped
  order('TEST-ORDER-0004', '2026-10-08T10:00:00.000Z', 'paid', previews.o4),
  order('TEST-ORDER-0005', '2026-10-09T10:00:00.000Z', 'pending', previews.unpaid),    // not paid -> excluded
  order('TEST-ORDER-0006', '2026-10-10T10:00:00.000Z', 'paid', previews.o6),
  order('TEST-ORDER-0007', '2026-10-11T10:00:00.000Z', 'paid', previews.o7),
  order('TEST-ORDER-0009', '2026-10-04T10:00:00.000Z', 'paid', 'data:image/png;base64,' + 'A'.repeat(700), /* truncated/corrupt -> skipped */ ),
  order('TEST-ORDER-0010', '2026-10-03T10:00:00.000Z', 'paid', 'data:text/plain;base64,' + Buffer.from('not an image').toString('base64')), // wrong mime -> skipped
  order('TEST-ORDER-0011', '2026-10-02T10:00:00.000Z', 'paid', 'https://example.com/remote.png')  // remote URL -> skipped
];
const paidCount = orders.filter((entry) => entry.stripePaymentStatus === 'paid').length;
fs.writeFileSync(path.join(FIXTURE, 'orders.json'), JSON.stringify(orders, null, 1), 'utf8');
fs.writeFileSync(path.join(FIXTURE, 'stones.json'), '[]', 'utf8');
fs.writeFileSync(path.join(FIXTURE, 'charms.json'), '[]', 'utf8');
fs.writeFileSync(path.join(FIXTURE, 'settings.json'), '{}', 'utf8');

const freePort = () => new Promise((resolve) => {
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
});

const port = await freePort();
const server = spawn(process.execPath, [path.resolve(CAND, 'server.js')], {
  cwd: CAND,
  env: { ...process.env, PORT: String(port), DATA_DIR: path.resolve(FIXTURE), SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true
});
let serverLog = '';
server.stdout.on('data', (chunk) => { serverLog += chunk.toString(); });
server.stderr.on('data', (chunk) => { serverLog += chunk.toString(); });

const waitForServer = async () => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { const response = await fetch(`http://127.0.0.1:${port}/api/settings`); if (response.ok) return true; } catch (error) { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
};

const checks = [];
const check = (id, pass, detail = '') => checks.push({ id, pass: Boolean(pass), detail: String(detail).slice(0, 240) });
const LUMI = 'reports/production/full-uat-feature-migration-20261009/reconciled-candidate/lumi/ui/lumi-ui.js';

try {
  if (!await waitForServer()) throw new Error('server did not start: ' + serverLog.slice(0, 300));

  const first = await fetch(`http://127.0.0.1:${port}/api/social-proof`);
  const firstText = await first.text();
  const cacheControl = first.headers.get('cache-control') || '';
  const payload = JSON.parse(firstText);

  check('endpoint answers 200 with a cacheable public response', first.status === 200 && /public/.test(cacheControl) && /max-age=/.test(cacheControl), `${first.status} ${cacheControl}`);
  check('aggregate count uses only paid orders', payload.successfulOrderCount === paidCount && payload.displayCount === 1035 + paidCount * 3, JSON.stringify({ orders: paidCount, displayCount: payload.displayCount, successfulOrderCount: payload.successfulOrderCount }));
  check('exactly four previews are published', Array.isArray(payload.recentBracelets) && payload.recentBracelets.length === 4, `count=${Array.isArray(payload.recentBracelets) ? payload.recentBracelets.length : 'n/a'}`);
  check('response exposes only the imagery and the aggregate count', Object.keys(payload).sort().join(',') === 'displayCount,recentBracelets,successfulOrderCount', Object.keys(payload).join(','));

  const forbidden = [
    ...Object.values(pii),
    ...orders.map((entry) => entry.id),
    'braceletPreviewSnapshot', 'phoneNumber', 'addressLine', 'lineUserId', 'customerName', 'email'
  ];
  const leaked = forbidden.filter((token) => token && firstText.includes(token));
  check('no order identifiers, customer details or payment fields in the payload', leaked.length === 0, leaked.join(', '));

  const thumbInfo = [];
  for (const dataUrl of payload.recentBracelets) {
    const matches = /^data:image\/webp;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl));
    if (!matches) { thumbInfo.push({ error: 'not an inline webp data url' }); continue; }
    const buffer = Buffer.from(matches[1], 'base64');
    const meta = await sharp(buffer).metadata();
    const { data } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const centre = Math.floor(meta.height / 2) * meta.width * 4 + Math.floor(meta.width / 2) * 4;
    thumbInfo.push({
      px: `${meta.width}x${meta.height}`,
      bytes: buffer.length,
      hasAlpha: Boolean(meta.hasAlpha),
      centre: [data[centre], data[centre + 1], data[centre + 2]],
      chars: String(dataUrl).length
    });
  }
  check('every preview is an optimized 176px webp thumbnail', thumbInfo.every((entry) => entry.px === '176x176' && entry.bytes > 50 && entry.bytes < 20000), JSON.stringify(thumbInfo.map((entry) => [entry.px, entry.bytes])));
  const expectedColours = [COLORS.o7, COLORS.o6, COLORS.o4, COLORS.o2];
  const orderMatches = thumbInfo.length === 4 && thumbInfo.every((entry, index) => entry.centre && entry.centre.every((channel, channelIndex) => Math.abs(channel - expectedColours[index][channelIndex]) <= 6));
  check('the four previews are the newest eligible orders, newest first', orderMatches, JSON.stringify(thumbInfo.map((entry) => entry.centre)) + ' expected ' + JSON.stringify(expectedColours));

  const second = await fetch(`http://127.0.0.1:${port}/api/social-proof`);
  const secondText = await second.text();
  check('repeat requests are served from the in-process cache (identical payload)', secondText === firstText, `first=${firstText.length}b second=${secondText.length}b`);
  check('personalized content never enters the public payload', !/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(firstText.replace(/data:image\/webp;base64,[A-Za-z0-9+/=]+/g, '')), 'stripped-image text scanned');
} catch (error) {
  check('backend verification completed without an unhandled error', false, String(error?.message || error));
} finally {
  server.kill();
  await new Promise((resolve) => setTimeout(resolve, 400));
}

const summary = {
  ranAt: new Date().toISOString(),
  passed: checks.filter((entry) => entry.pass).length,
  failed: checks.filter((entry) => !entry.pass).length,
  checks,
  serverLog: serverLog.slice(0, 600)
};
fs.writeFileSync(path.join(OUT, 'social-proof-backend-verification.json'), JSON.stringify(summary, null, 1) + '\n', 'utf8');
console.log(JSON.stringify(summary, null, 1));
process.exit(summary.failed === 0 ? 0 : 1);
