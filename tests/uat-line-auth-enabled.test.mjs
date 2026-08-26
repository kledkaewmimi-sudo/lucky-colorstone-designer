import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const app = readFileSync(resolve(root, 'app.js'), 'utf8');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');

assert.match(html, /https:\/\/static\.line-scdn\.net\/liff\/edge\/2\/sdk\.js/,
  'UAT must load the LIFF SDK for its dedicated UAT LIFF app');
assert.match(app, /resolveLiffEnvironmentConfig\(\{ environment: 'uat', liffId: payload\?\.liffId \}\);\s*LIFF_ID = resolved\.liffId;/,
  'UAT LIFF ID must come from the environment-specific config endpoint');
assert.match(app, /await initLIFF\(\);/,
  'startup must initialize LIFF after loading the UAT configuration');
assert.match(app, /return LIFF_ID \? `https:\/\/liff\.line\.me\/\$\{LIFF_ID\}` : '';/,
  'the LIFF entry fallback must use the configured UAT LIFF ID');
assert.doesNotMatch(app, /if \(IS_UAT_MODE\) return '';/,
  'UAT must not suppress its LIFF entry URL');

assert.match(app, /async function handleStripeCheckout\(\) \{\s*if \(IS_UAT_MODE\) \{/,
  'UAT checkout must remain disabled');
assert.match(app, /function sendAnalyticsPayload\(payload, \{ beacon = false \} = \{\}\) \{\s*if \(IS_UAT_MODE\) return;/,
  'UAT analytics must remain disabled');
assert.doesNotMatch(html, /2010525799-qImIuhla/,
  'UAT must never embed the production LIFF ID');

console.log('UAT LIFF authentication is enabled while checkout and analytics remain disabled.');
