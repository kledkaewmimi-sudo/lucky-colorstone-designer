import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const appSource = await readFile(new URL('app.js', root), 'utf8');
const htmlSource = await readFile(new URL('index.html', root), 'utf8');
const cssSource = await readFile(new URL('index.css', root), 'utf8');

test('Step 2 retains the owner-approved visual order and single warm Mixed recommendation', () => {
  assert.match(cssSource, /#stepView2 \.bead-size-card\[data-bead-size="mixed"\]\s*\{\s*order:\s*1;/);
  assert.match(cssSource, /#stepView2 \.bead-size-card\[data-bead-size="10"\]\s*\{\s*order:\s*2;/);
  assert.match(cssSource, /#stepView2 \.bead-size-card\[data-bead-size="6"\]\s*\{\s*order:\s*3;/);
  assert.match(cssSource, /#stepView2 \.bead-size-card\[data-bead-size="4"\]\s*\{\s*order:\s*4;/);
  assert.match(htmlSource, /data-bead-size="mixed"[\s\S]*?bead-size-mixed-recommendation[\s\S]*?★ แนะนำ/);
  assert.doesNotMatch(htmlSource, /data-bead-size="10"[^>]*bead-size-card-recommended/);
});

test('Step 3 uses the approved native sticky preview lifecycle without UAT diagnostics', () => {
  assert.match(cssSource, /#stepView3 \.canvas-card\s*\{\s*position:\s*sticky;\s*top:\s*0;\s*z-index:\s*20;/);
  assert.match(cssSource, /#stepView3\.step-view\.active\s*\{\s*height:\s*auto;\s*min-height:\s*100%;/);
  assert.match(appSource, /function setupStep3StickyLayer\(\)/);
  assert.match(appSource, /function syncStep3StickyLayer\(\)/);
  assert.match(appSource, /DOM\.appContainer\.classList\.toggle\('step3-preview-covered', previewTop <= scrollportTop \+ 1\)/);
  assert.match(appSource, /setupDesignerEvents\(\)[\s\S]*?setupStep3StickyLayer\(\)/);
  assert.match(appSource, /configureFooterNavigation\(\);\s*syncStep3StickyLayer\(\);/);
  assert.match(appSource, /const STICKY_DEBUG_ENABLED = false;/);
  assert.match(appSource, /function setupStep3StickyDebugOverlay\(\)\s*\{\s*if \(!STICKY_DEBUG_ENABLED \|\| step3StickyDebugOverlay\) return;/);
});
