// Extracts frames from a local video so a screen recording can be inspected without ffmpeg.
// Chromium (already available through Playwright) decodes the file, seeks to the requested timestamps
// and draws each frame onto a canvas; every frame is then saved as a PNG.
//
//   node .../video-frame-extract.mjs <videoPath> <outDir> [times-ms-csv|count]
import { chromium } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const videoPath = path.resolve(process.argv[2]);
const outDir = path.resolve(process.argv[3] || 'reports/production/production-bugfix-batch-20261011/evidence/video-frames');
const arg = process.argv[4] || '24';
fs.mkdirSync(outDir, { recursive: true });
if (!fs.existsSync(videoPath)) { console.error('video not found: ' + videoPath); process.exit(2); }

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><html><body style="margin:0;background:#111"><video id="v" src="/video" preload="auto" muted playsinline></video><canvas id="c"></canvas></body></html>');
    return;
  }
  if (url.pathname === '/video') {
    const stat = fs.statSync(videoPath);
    const range = req.headers.range;
    if (range) {
      const [startText, endText] = range.replace(/bytes=/, '').split('-');
      const start = Number(startText);
      const end = endText ? Number(endText) : stat.size - 1;
      res.writeHead(206, {
        'content-type': 'video/mp4',
        'accept-ranges': 'bytes',
        'content-range': `bytes ${start}-${end}/${stat.size}`,
        'content-length': end - start + 1
      });
      fs.createReadStream(videoPath, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': stat.size });
    fs.createReadStream(videoPath).pipe(res);
    return;
  }
  res.writeHead(404); res.end();
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 520, height: 1000 } });
await page.goto(base + '/');
const meta = await page.evaluate(() => new Promise((resolve, reject) => {
  const video = document.getElementById('v');
  const done = () => resolve({ duration: video.duration, width: video.videoWidth, height: video.videoHeight });
  if (video.readyState >= 1) return done();
  video.addEventListener('loadedmetadata', done, { once: true });
  video.addEventListener('error', () => reject(new Error('video decode error: ' + (video.error && video.error.message))), { once: true });
  setTimeout(() => reject(new Error('metadata timeout')), 15000);
}));
console.log('META ' + JSON.stringify(meta));

let times;
if (/^[0-9]+$/.test(arg)) {
  const count = Number(arg);
  times = Array.from({ length: count }, (_, index) => Math.round((meta.duration * 1000 * (index + 0.5)) / count));
} else {
  times = arg.split(',').map((value) => Number(value.trim())).filter((value) => Number.isFinite(value));
}

const frames = [];
for (const time of times) {
  const dataUrl = await page.evaluate(async (target) => {
    const video = document.getElementById('v');
    const canvas = document.getElementById('c');
    await new Promise((resolve, reject) => {
      const onSeeked = () => { video.removeEventListener('seeked', onSeeked); resolve(); };
      video.addEventListener('seeked', onSeeked, { once: true });
      video.addEventListener('error', () => reject(new Error('seek error')), { once: true });
      video.currentTime = Math.max(0, target / 1000);
      setTimeout(resolve, 2500);
    });
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  }, time);
  const name = `frame-${String(time).padStart(6, '0')}ms.png`;
  fs.writeFileSync(path.join(outDir, name), Buffer.from(dataUrl.split(',')[1], 'base64'));
  frames.push(name);
}
await browser.close();
server.close();
console.log(JSON.stringify({ video: videoPath, meta, frames }, null, 1));
