import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';

const root = new URL('..', import.meta.url);
const html = await readFile(new URL('index.html', root), 'utf8');
const css = await readFile(new URL('step1-step2-redesign.css', root), 'utf8');
const app = await readFile(new URL('app.js', root), 'utf8');

assert.match(html, /href="\/step1-step2-redesign\.css"/,
  'The scoped Step 1/2 stylesheet must be loaded after index.css');
assert.match(html, /id="stepView1"/);
assert.match(html, /id="stepView2"/);
assert.match(html, /data-bead-size="10"/);
assert.match(html, /data-bead-size="6"/);
assert.match(html, /data-bead-size="4"/);
assert.match(html, /data-bead-size="mixed"/);
assert.equal((html.match(/class="bead-size-card/g) || []).length, 4,
  'Both redesigned steps must retain exactly the four bead-size cards');

assert.match(app, /document\.body\.dataset\.activeStep = String\(State\.currentStep\)/,
  'The visual layer must be scoped by the active step');
assert.match(css, /url\("\/assets\/hero\/slide-01\.webp"\)/,
  'Step 2 must use the requested hero background asset');
assert.match(css, /body\[data-active-step="2"\] \.app-container/);
assert.match(css, /body\[data-active-step="1"\] \.app-container/);
assert.match(css, /body\[data-active-step="2"\] #stepView2 \.bead-size-card\.active/);
assert.match(css, /body\[data-active-step="1"\] #stepView1 \.wrist-visual-card/);
assert.match(css, /body\[data-active-step="1"\] #stepView1 \.wrist-measuring-tape-image/);
assert.match(css, /body\[data-active-step="1"\] \.footer-btn\.btn-back/,
  'Step 1 must not display the Back control');
assert.match(css, /body\[data-active-step="2"\] \.footer-btn\.btn-back/,
  'Step 2 must retain the Back control');

console.log('step1-step2-redesign.test.mjs passed');
