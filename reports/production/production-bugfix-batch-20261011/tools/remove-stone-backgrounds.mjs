// Issue 4: remove the background from the stone catalog images used on the Lucky result page (page 3)
// and Step 3, in place: same filenames, same paths, same image format (.webp stays .webp, .png stays
// .png), same canvas size and centring. No catalog id, name or reference changes.
//
//   node .../remove-stone-backgrounds.mjs [--apply]
//
// Method: the studio background is a connected, near-uniform region that touches the frame border, so
// the background is found by a border-seeded flood fill that only grows through pixels close to the
// seed colour AND close to the neighbour they grow from. Interior pixels (the stone, highlights,
// specular whites inside the bead) are not connected to the border and are preserved. The mask edge is
// feathered by 1px so the cut-out has no hard alias. Dry-run by default.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const CAND = 'reports/production/full-uat-feature-migration-20261009/reconciled-candidate';
const BACKUP = 'reports/production/production-bugfix-batch-20261011/evidence/asset-backup-before';
const apply = process.argv.includes('--apply');
const only = (process.argv.find((arg) => arg.startsWith('--only=')) || '').slice('--only='.length);
// Source of the pixels to cut out. It must be the file production actually serves; `--source-dir` lets
// a single drifted asset be rebuilt from the deployed artifact instead of a newer un-deployed variant.
const sourceDir = (process.argv.find((arg) => arg.startsWith('--source-dir=')) || '').slice('--source-dir='.length) || CAND;
const backupDir = `${BACKUP}${sourceDir === CAND ? '' : '-from-deployed'}`;

const stones = JSON.parse(fs.readFileSync(`${CAND}/data/stones.json`, 'utf8').replace(/^\uFEFF/, ''));
const targets = [...new Set(stones.map((stone) => String(stone.image || '').replace(/^\/+/, '')))]
  .filter((rel) => rel && /^assets\//i.test(rel))
  .filter((rel) => !only || rel.includes(only));

const SEED_TOLERANCE = 18;
const NEIGHBOUR_TOLERANCE = 18;

const distance = (data, index, color) => {
  const dr = data[index] - color[0];
  const dg = data[index + 1] - color[1];
  const db = data[index + 2] - color[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
};

function borderSeed(data, width, height) {
  const samples = [];
  const push = (x, y) => { const i = (y * width + x) * 4; samples.push([data[i], data[i + 1], data[i + 2]]); };
  for (let x = 0; x < width; x += 1) { push(x, 0); push(x, height - 1); }
  for (let y = 0; y < height; y += 1) { push(0, y); push(width - 1, y); }
  const median = (channel) => { const values = samples.map((sample) => sample[channel]).sort((a, b) => a - b); return values[Math.floor(values.length / 2)]; };
  return [median(0), median(1), median(2)];
}

function backgroundMask(data, width, height) {
  const seed = borderSeed(data, width, height);
  const mask = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const consider = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const pixel = y * width + x;
    if (mask[pixel]) return;
    const index = pixel * 4;
    if (distance(data, index, seed) > SEED_TOLERANCE) return;
    mask[pixel] = 1;
    queue[tail += 1] = pixel;
  };
  for (let x = 0; x < width; x += 1) { consider(x, 0); consider(x, height - 1); }
  for (let y = 0; y < height; y += 1) { consider(0, y); consider(width - 1, y); }
  while (head <= tail) {
    const pixel = queue[head += 1];
    if (pixel === undefined) break;
    const x = pixel % width;
    const y = (pixel - x) / width;
    const index = pixel * 4;
    const neighborOk = (nx, ny) => {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) return;
      const nPixel = ny * width + nx;
      if (mask[nPixel]) return;
      const nIndex = nPixel * 4;
      if (distance(data, nIndex, seed) > SEED_TOLERANCE) return;
      if (distance(data, nIndex, [data[index], data[index + 1], data[index + 2]]) > NEIGHBOUR_TOLERANCE) return;
      mask[nPixel] = 1;
      queue[tail += 1] = nPixel;
    };
    neighborOk(x - 1, y); neighborOk(x + 1, y); neighborOk(x, y - 1); neighborOk(x, y + 1);
  }
  return { mask, seed, visited: tail };
}

// 3x3 box blur on the binary mask -> 1px feathered alpha edge, no hard alias.
function feather(mask, width, height) {
  const alpha = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          sum += mask[ny * width + nx] ? 1 : 0;
          count += 1;
        }
      }
      alpha[y * width + x] = 1 - sum / count;
    }
  }
  return alpha;
}

const report = [];
for (const rel of targets) {
  const file = path.join(sourceDir, rel);
  if (!fs.existsSync(file)) { report.push({ rel, status: 'MISSING' }); continue; }
  // Read through a Buffer: on Windows a sharp instance can keep an input file handle cached, which
  // blocks the in-place rewrite below.
  const inputBuffer = fs.readFileSync(file);
  const meta = await sharp(inputBuffer).metadata();
  const { data, info } = await sharp(inputBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  if (meta.hasAlpha) { report.push({ rel, status: 'SKIPPED (already has alpha)', format: meta.format, width, height }); continue; }

  const { mask, seed, visited } = backgroundMask(data, width, height);
  const alpha = feather(mask, width, height);
  const out = Buffer.from(data);
  let transparent = 0;
  let centerMasked = false;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const index = pixel * 4;
      const a = Math.max(0, Math.min(1, alpha[pixel]));
      out[index + 3] = Math.round(out[index + 3] * a);
      if (out[index + 3] === 0) transparent += 1;
    }
  }
  centerMasked = mask[Math.floor(height / 2) * width + Math.floor(width / 2)] === 1;

  const coverage = transparent / (width * height);
  const entry = {
    rel,
    format: meta.format,
    width,
    height,
    seed,
    filledPixels: visited,
    transparentFraction: Number(coverage.toFixed(4)),
    centreWasBackground: centerMasked,
    bytesBefore: fs.statSync(file).size
  };

  if (apply) {
    fs.mkdirSync(backupDir, { recursive: true });
    fs.copyFileSync(file, path.join(backupDir, path.basename(file)));
    const pipeline = sharp(out, { raw: { width, height, channels: 4 } });
    const encoded = meta.format === 'png'
      ? await pipeline.png({ compressionLevel: 9 }).toBuffer()
      : await pipeline.webp({ quality: 82 }).toBuffer();
    let written = false;
    const destination = path.join(CAND, rel);
    for (let attempt = 0; attempt < 5 && !written; attempt += 1) {
      try { fs.writeFileSync(destination, encoded); written = true; } catch (error) {
        if (attempt === 4) throw error;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    entry.bytesAfter = fs.statSync(destination).size;
    entry.applied = true;
  }
  report.push(entry);
}

const summary = {
  mode: apply ? 'APPLY' : 'DRY-RUN',
  targets: targets.length,
  applied: report.filter((entry) => entry.applied).length,
  skipped: report.filter((entry) => String(entry.status || '').startsWith('SKIPPED')).length,
  missing: report.filter((entry) => entry.status === 'MISSING').map((entry) => entry.rel),
  suspicious: report.filter((entry) => entry.centreWasBackground || (entry.transparentFraction !== undefined && (entry.transparentFraction < 0.2 || entry.transparentFraction > 0.95))).map((entry) => entry.rel)
};
fs.mkdirSync('reports/production/production-bugfix-batch-20261011/evidence', { recursive: true });
fs.writeFileSync(`reports/production/production-bugfix-batch-20261011/evidence/stone-background-removal-${apply ? 'apply' : 'dryrun'}.json`, JSON.stringify({ summary, report }, null, 1) + '\n', 'utf8');
console.log(JSON.stringify({ summary, report: report.map(({ rel, status, format, transparentFraction, centreWasBackground, bytesBefore, bytesAfter }) => ({ rel, status, format, transparentFraction, centreWasBackground, bytesBefore, bytesAfter })) }, null, 1));
