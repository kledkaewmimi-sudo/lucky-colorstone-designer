// Fetches the published landing-page previews and decodes them to PNG files for visual review (the
// publication check the owner must be able to repeat at any time). Also reports per-image facts.
//
//   node reports/production/production-bugfix-batch-20261011/tools/inspect-live-social-proof-previews.mjs [baseUrl]
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const BASE = (process.argv[2] || 'https://customize.luckycolorstone.com').replace(/\/$/, '');
const OUT = 'reports/production/production-bugfix-batch-20261011/evidence/live-previews';
fs.mkdirSync(OUT, { recursive: true });

const response = await fetch(BASE + '/api/social-proof');
const text = await response.text();
let payload = null;
try { payload = JSON.parse(text); } catch (error) { payload = null; }
const published = Array.isArray(payload?.recentBracelets) ? payload.recentBracelets : [];

const findings = {
  base: BASE,
  status: response.status,
  cacheControl: response.headers.get('cache-control'),
  displayCount: payload?.displayCount ?? null,
  successfulOrderCount: payload?.successfulOrderCount ?? null,
  publishedPreviews: published.length,
  responseBytes: Buffer.byteLength(text, 'utf8'),
  forbiddenTokensPresent: ['customerName', 'shippingInfo', 'phoneNumber', 'addressLine', 'lineUserId', 'stripe', 'email', 'orderId']
    .filter((token) => new RegExp(token, 'i').test(text.replace(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/gi, ''))),
  images: []
};

for (const [index, dataUrl] of published.entries()) {
  const matches = /^data:image\/([a-z]+);base64,([A-Za-z0-9+/=]+)$/i.exec(String(dataUrl));
  if (!matches) { findings.images.push({ index, error: 'not an inline image' }); continue; }
  const buffer = Buffer.from(matches[2], 'base64');
  const meta = await sharp(buffer).metadata();
  const file = path.join(OUT, `preview-${index + 1}.png`);
  // Composed over a mid-grey surface so a leftover rectangular background would be obvious.
  await sharp(buffer).flatten({ background: { r: 200, g: 200, b: 205 } }).png().toFile(file);
  findings.images.push({
    index,
    format: meta.format,
    size: `${meta.width}x${meta.height}`,
    hasAlpha: Boolean(meta.hasAlpha),
    bytes: buffer.length,
    file
  });
}

fs.writeFileSync(path.join(OUT, 'preview-inspection.json'), JSON.stringify(findings, null, 1) + '\n', 'utf8');
console.log(JSON.stringify(findings, null, 1));
