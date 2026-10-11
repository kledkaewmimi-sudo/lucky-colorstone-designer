// TASK A1 evidence: how long the Lucky designing clip needs to become playable on a throttled
// connection, before (deployed MP4 with `moov` at the end) vs after (faststart re-mux), plus a WebKit
// playback smoke test of the shipped file. Read-only: no writes, no orders.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, webkit } from '@playwright/test';

// The "before" bytes are the deployed Production clip (moov at the end); the "after" bytes are the
// re-muxed faststart file in the release candidate. Both are read, never written.
const VARIANTS = {
  before: path.join(process.env.TEMP, 'lcs-live-before-video.mp4'),
  after: path.resolve('reports/production/full-uat-feature-migration-20261009/reconciled-candidate/assets/lucky/videos/lucky-bracelet-designing.mp4')
};
const OUT = 'reports/production/production-bugfix-batch-20261011/evidence';
const VIDEO_PATH = '/assets/lucky/videos/lucky-bracelet-designing.mp4';
const THROTTLE_BYTES_PER_SECOND = 600 * 1024; // ~4.8 Mbit/s: a realistic mobile connection

const atomOrder = (file) => {
  const fd = fs.openSync(file, 'r');
  const size = fs.statSync(file).size;
  let offset = 0;
  const atoms = [];
  while (offset < size - 8) {
    const buffer = Buffer.alloc(8);
    fs.readSync(fd, buffer, 0, 8, offset);
    const length = buffer.readUInt32BE(0);
    atoms.push({ type: buffer.toString('latin1', 4, 8), offset });
    if (length < 8) break;
    offset += length;
  }
  fs.closeSync(fd);
  const moov = atoms.find((atom) => atom.type === 'moov');
  const mdat = atoms.find((atom) => atom.type === 'mdat');
  return { size, atoms: atoms.slice(0, 5), moovOffset: moov?.offset ?? null, mdatOffset: mdat?.offset ?? null, faststart: Boolean(moov && mdat && moov.offset < mdat.offset) };
};

// `paced` streams the body at THROTTLE_BYTES_PER_SECOND so the same engine can be measured on a slow
// connection without CDP (which only exists in Chromium).
const serve = async (file, { paced = false } = {}) => {
  const server = http.createServer((req, res) => {
    const size = fs.statSync(file).size;
    // Plain full-body 200: the media element only needs a length, which keeps the byte accounting
    // identical for both variants (no range-request shortcuts on either side).
    res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': String(size), 'cache-control': 'no-store' });
    if (paced) {
      const chunkSize = 64 * 1024;
      const chunkDelayMs = Math.round((chunkSize / THROTTLE_BYTES_PER_SECOND) * 1000);
      const stream = fs.createReadStream(file, { highWaterMark: chunkSize });
      stream.on('data', (chunk) => { res.write(chunk); stream.pause(); setTimeout(() => stream.resume(), chunkDelayMs); });
      stream.on('end', () => res.end());
      return;
    }
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
};

const measure = async (browserType, baseUrl, { throttle }) => {
  const browser = await browserType.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const page = await context.newPage();
    let throttled = false;
    if (throttle && browserType === chromium) {
      const session = await context.newCDPSession(page);
      await session.send('Network.enable');
      await session.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 60,
        downloadThroughput: THROTTLE_BYTES_PER_SECOND / 8,
        uploadThroughput: 128 * 1024 / 8
      });
      throttled = true;
    }
    // about:blank keeps the probe independent of the app page: only the video bytes are measured.
    await page.goto('about:blank');
    const result = await page.evaluate(async (videoPath) => {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      video.preload = 'auto';
      video.style.cssText = 'position:fixed;left:-9999px;width:2px;height:2px';
      document.body.appendChild(video);
      const started = performance.now();
      const marks = {};
      const mark = (name, on) => video.addEventListener(name, () => { if (!(name in marks)) marks[name] = Math.round((performance.now() - started) * 10) / 10; }, { once: true, capture: on });
      ['loadstart', 'loadedmetadata', 'canplay', 'playing', 'stalled', 'error'].forEach((name) => mark(name));
      video.src = videoPath;
      video.load();
      const attempt = video.play();
      if (attempt && typeof attempt.catch === 'function') attempt.catch(() => {});
      await new Promise((resolve) => {
        const deadline = performance.now() + 25000;
        const tick = () => {
          if (video.readyState >= 3 || performance.now() > deadline) resolve();
          else setTimeout(tick, 100);
        };
        tick();
      });
      return { marks, readyState: video.readyState, duration: Number.isFinite(video.duration) ? Math.round(video.duration * 10) / 10 : null, currentTime: Math.round(video.currentTime * 100) / 100 };
    }, `${baseUrl}${VIDEO_PATH}`);
    await context.close();
    return { throttled, ...result };
  } finally {
    await browser.close();
  }
};

const report = { ranAt: new Date().toISOString(), throttleBytesPerSecond: THROTTLE_BYTES_PER_SECOND, variants: {} };
for (const [name, file] of Object.entries(VARIANTS)) {
  report.variants[name] = {
    file,
    ...atomOrder(file),
    chromiumThrottled: await (async () => { const { server, baseUrl } = await serve(file); try { return await measure(chromium, baseUrl, { throttle: true }); } finally { server.close(); } })(),
    webkitLocal: await (async () => { const { server, baseUrl } = await serve(file); try { return await measure(webkit, baseUrl, { throttle: false }); } finally { server.close(); } })(),
    webkitPaced: await (async () => { const { server, baseUrl } = await serve(file, { paced: true }); try { return await measure(webkit, baseUrl, { throttle: false }); } finally { server.close(); } })()
  };
}
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'video-load-probe.json'), JSON.stringify(report, null, 1) + '\n', 'utf8');
console.log(JSON.stringify(report, null, 1));
