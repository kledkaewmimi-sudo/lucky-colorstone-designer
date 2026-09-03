import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  captureMetaAttribution,
  deriveFbcFromFbclid,
  updateMetaAttribution
} from '../meta-attribution.js';

const NOW = Date.UTC(2026, 8, 1, 10, 0, 0);
const FBP = 'fb.1.1725184800000.123456789';
const FBC = 'fb.1.1725184800000.ExistingClickId';

function capture(href, extras = {}) {
  return captureMetaAttribution({ href, now: NOW, ...extras });
}

test('captures a direct Facebook paid landing and derives fbc only from its fbclid', () => {
  const direct = capture('https://customize.luckycolorstone.com/?utm_source=facebook&utm_medium=paid&fbclid=MetaClick', {
    cookieString: `_fbp=${FBP}`
  });
  assert.equal(direct.utm.source, 'facebook');
  assert.equal(direct.utm.medium, 'paid');
  assert.equal(direct.meta.fbclid, 'MetaClick');
  assert.equal(direct.meta.fbp, FBP);
  assert.equal(direct.meta.fbc, deriveFbcFromFbclid('MetaClick', NOW));
});

test('captures direct Instagram paid and Linktree landings without inventing identifiers', () => {
  const instagram = capture('https://customize.luckycolorstone.com/?utm_source=instagram&utm_medium=paid');
  const linktree = capture('https://customize.luckycolorstone.com/?utm_source=instagram&utm_medium=linktree&utm_campaign=launch_2026');
  assert.equal(instagram.utm.medium, 'paid');
  assert.equal(instagram.meta.fbc, null);
  assert.equal(linktree.utm.medium, 'linktree');
  assert.equal(linktree.utm.campaign, 'launch_2026');
  assert.equal(linktree.meta.fbclid, null);
  assert.equal(linktree.meta.fbc, null);
});

test('preserves a Linktree fbclid and an existing valid Meta cookie value', () => {
  const landing = capture('https://customize.luckycolorstone.com/?utm_source=instagram&utm_medium=linktree&fbclid=Preserved', {
    cookieString: `_fbc=${FBC}; _fbp=${FBP}`
  });
  assert.equal(landing.meta.fbclid, 'Preserved');
  assert.equal(landing.meta.fbc, FBC);
  assert.equal(landing.meta.fbp, FBP);
});

test('keeps first touch immutable and updates only last touch for a later external landing', () => {
  const first = capture('https://customize.luckycolorstone.com/?utm_source=instagram&utm_medium=paid&fbclid=First');
  const later = capture('https://customize.luckycolorstone.com/?utm_source=instagram&utm_medium=linktree&utm_campaign=hub');
  const state = updateMetaAttribution({}, first);
  const updated = updateMetaAttribution(state, later);
  assert.equal(updated.firstTouch.utm.medium, 'paid');
  assert.equal(updated.firstTouch.meta.fbclid, 'First');
  assert.equal(updated.lastTouch.utm.medium, 'linktree');
  assert.equal(updated.lastTouch.utm.campaign, 'hub');
});

test('does not replace attribution during internal navigation but can hydrate a later real fbp', () => {
  const first = capture('https://customize.luckycolorstone.com/?utm_source=facebook&utm_medium=paid&fbclid=First');
  const state = updateMetaAttribution({}, first);
  const internal = capture('https://customize.luckycolorstone.com/designer', {
    referrer: 'https://customize.luckycolorstone.com/',
    cookieString: `_fbp=${FBP}`
  });
  const updated = updateMetaAttribution(state, internal);
  assert.equal(updated.firstTouch.utm.medium, 'paid');
  assert.equal(updated.firstTouch.meta.fbp, FBP);
  assert.equal(updated.lastTouch.utm.medium, 'paid');
});

test('keeps missing UTM values null and rejects invalid pre-existing Meta cookie values', () => {
  const landing = capture('https://customize.luckycolorstone.com/', {
    cookieString: '_fbp=not-real; _fbc=also-not-real'
  });
  assert.equal(landing.utm.source, null);
  assert.equal(landing.utm.campaign, null);
  assert.equal(landing.meta.fbp, null);
  assert.equal(landing.meta.fbc, null);
});

test('app wiring carries the attribution object through the existing order payload helper without Stripe metadata changes', async () => {
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(app, /import \{ captureMetaAttribution, normalizeMetaAttribution, updateMetaAttribution \} from '\.\/meta-attribution\.js';/);
  assert.match(app, /metaAttribution: normalizeMetaAttribution\(/);
  assert.match(app, /\.\.\.getAnalyticsOrderFields\(\)/);
  assert.doesNotMatch(app, /console\.(log|warn|error)\([^\n]*(fbclid|_fbp|_fbc)/i);
});
