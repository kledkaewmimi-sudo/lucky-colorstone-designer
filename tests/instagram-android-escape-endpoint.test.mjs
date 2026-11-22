import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');
const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));

test('Android escape experiments are UAT-only fixed-destination routes', () => {
  assert.match(server, /INSTAGRAM_ANDROID_ESCAPE_ROUTES/);
  assert.match(server, /'\/ig-android-escape'/);
  assert.match(server, /'\/ig-android-chrome-escape'/);
  assert.match(server, /new URL\('\/', UAT_ALLOWED_ORIGIN\)/);
  assert.match(server, /S\.browser_fallback_url=/);
  assert.match(server, /googlechrome:\/\/navigate\?url=/);
  assert.match(server, /readInstagramEscapeDestination/);
});

test('Android experiment selection is opt-in and does not create a browser-choice UI', () => {
  assert.match(app, /android_escape/);
  assert.match(app, /'302-intent'/);
  assert.match(app, /'302-googlechrome'/);
  assert.match(app, /'js-googlechrome'/);
  assert.doesNotMatch(app, /btnInstagramOpenExternal/);
});

test('Vercel routes both experimental paths to the UAT Render service', () => {
  const destinations = vercel.routes.map((route) => route.dest);
  assert.ok(destinations.includes('https://lucky-colorstone-uat.onrender.com/ig-android-escape'));
  assert.ok(destinations.includes('https://lucky-colorstone-uat.onrender.com/ig-android-chrome-escape'));
});
