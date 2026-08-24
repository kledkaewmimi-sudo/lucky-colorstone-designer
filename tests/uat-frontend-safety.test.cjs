const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const vercel = JSON.parse(read('vercel.json'));
const redirects = read('_redirects');
const app = read('app.js');
const html = read('index.html');

const apiRoute = vercel.routes.find((route) => route.src === '/api/(.*)');
assert.equal(apiRoute?.dest, 'https://lucky-colorstone-uat.onrender.com/api/$1');
assert.match(redirects, /https:\/\/lucky-colorstone-uat\.onrender\.com\/api\/:splat/);
assert.doesNotMatch(JSON.stringify(vercel), /lucky-colorstone-designer\.onrender\.com/);
assert.match(app, /const APP_ENV = 'uat';/);
assert.match(app, /const IS_UAT_MODE = APP_ENV === 'uat';/);
assert.match(app, /async function initLIFF\(\) \{[\s\S]*?if \(IS_UAT_MODE\) \{/);
assert.match(app, /function sendAnalyticsPayload\(payload, \{ beacon = false \} = \{\}\) \{\s*if \(IS_UAT_MODE\) return;/);
assert.match(app, /async function handleStripeCheckout\(\) \{\s*if \(IS_UAT_MODE\) \{/);
assert.match(app, /async function submitOrderToCRM\(showToastNotification = true, overrides = \{\}\) \{\s*if \(IS_UAT_MODE\) \{/);
assert.match(app, /async function handleLineOrder\(\) \{\s*if \(IS_UAT_MODE\) \{/);
assert.doesNotMatch(html, /connect\.facebook\.net|static\.line-scdn\.net|1573172861217430|2010525799-qImIuhla/);

console.log('UAT frontend routing and external-integration guards passed.');
