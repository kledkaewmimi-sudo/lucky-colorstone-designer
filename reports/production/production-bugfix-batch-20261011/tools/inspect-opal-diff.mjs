import sharp from 'sharp';
const CAND = 'reports/production/full-uat-feature-migration-20261009/reconciled-candidate';
const REF = 'reports/production/full-uat-feature-migration-20261009/release/artifact/vercel';
const rel = process.argv[2] || 'assets/Opal.webp';
const cur = await sharp(`${CAND}/${rel}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const ref = await sharp(`${REF}/${rel}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
console.log('current  channels', cur.info.channels, cur.info.width + 'x' + cur.info.height, 'bytes', cur.data.length);
console.log('referenc channels', ref.info.channels, ref.info.width + 'x' + ref.info.height, 'bytes', ref.data.length);
let fullSum = 0, fullN = 0, edgeSum = 0, edgeN = 0, transparent = 0, lowAlpha = 0;
const hist = new Map();
for (let i = 0; i < cur.data.length; i += 4) {
  const alpha = cur.data[i + 3];
  hist.set(alpha, (hist.get(alpha) || 0) + 1);
  const diff = Math.max(Math.abs(cur.data[i] - ref.data[i]), Math.abs(cur.data[i + 1] - ref.data[i + 1]), Math.abs(cur.data[i + 2] - ref.data[i + 2]));
  if (alpha === 255) { fullSum += diff; fullN += 1; }
  else if (alpha === 0) { transparent += 1; }
  else { edgeSum += diff; edgeN += 1; if (alpha < 128) lowAlpha += 1; }
}
console.log(rel);
console.log('alpha=255 pixels', fullN, 'meanRGBdiff', (fullSum / fullN).toFixed(2));
console.log('edge pixels(1..254)', edgeN, 'meanRGBdiff', (edgeSum / edgeN).toFixed(2), 'of which alpha<128:', lowAlpha);
console.log('transparent pixels', transparent);
console.log('alpha histogram (top 10):', [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k}:${v}`).join(' '));
