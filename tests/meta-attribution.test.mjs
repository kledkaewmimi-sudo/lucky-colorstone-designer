import assert from 'node:assert/strict';
import test from 'node:test';
import { captureMetaAttribution, updateMetaAttribution } from '../meta-attribution.js';

const now = Date.UTC(2026, 8, 1, 10, 0, 0);
const capture = (href, extras = {}) => captureMetaAttribution({ href, now, ...extras });

test('captures direct-ad and Linktree attribution without inventing Meta identifiers', () => {
  const direct = capture('https://customize.luckycolorstone.com/?utm_source=facebook&utm_medium=paid&fbclid=click', { cookieString: '_fbp=fb.1.1725184800000.123' });
  const linktree = capture('https://customize.luckycolorstone.com/?utm_source=instagram&utm_medium=linktree');
  assert.equal(direct.meta.fbclid, 'click');
  assert.equal(direct.meta.fbp, 'fb.1.1725184800000.123');
  assert.equal(direct.meta.fbc, 'fb.1.1788256800000.click');
  assert.equal(linktree.meta.fbc, null);
  assert.equal(linktree.utm.medium, 'linktree');
});

test('keeps first touch immutable and updates only external last touch', () => {
  const first = capture('https://customize.luckycolorstone.com/?utm_source=instagram&utm_medium=paid&fbclid=first');
  const linktree = capture('https://customize.luckycolorstone.com/?utm_source=instagram&utm_medium=linktree');
  const state = updateMetaAttribution({}, first);
  const updated = updateMetaAttribution(state, linktree);
  assert.equal(updated.firstTouch.utm.medium, 'paid');
  assert.equal(updated.lastTouch.utm.medium, 'linktree');
  const internal = capture('https://customize.luckycolorstone.com/designer', { referrer: 'https://customize.luckycolorstone.com/' });
  assert.equal(updateMetaAttribution(updated, internal).lastTouch.utm.medium, 'linktree');
});
