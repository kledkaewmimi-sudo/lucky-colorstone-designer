'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file));
const sha = (file) => crypto.createHash('sha256').update(read(file)).digest('hex');

// Hashes captured from the exact recovered Production frontend baseline
// (dpl_Ar3kGCsUJF2pVNhP6UHxbsTSBMCJ) and Render backend 123ed986ccc9977d21418094ae311690a6286fae.
const UNCHANGED = {
  'frontend/crm.js': '118ab19034ebe00be79aed814cccd9c8db08e7216d581ada3c65c812cdde4195',
  'frontend/crm.html': 'd9df38efe2f215e0ff61dc8d89c5426d00a7a12a5c119186f78a41ed8d992399',
  'frontend/data.js': 'af602a638d0077c13d7b2781e9581b965b93e09e59d7a79e3b17f6413eb53821',
  'backend/server-order-validation.js': '17287069f9a924266649323c6ff94008bb911f66937255a6bb5e173b9ff6b636',
  'backend/data/stones.json': '7f9bed3d00d6185c83f1813b34e436ec7fe3654add294084c4b8c491a5159de7',
  'backend/data/charms.json': 'fff45327ead0691b8cee20eb1e15c09ed56842cb45f445944f2c8b7a07ec753c',
  'backend/data/spacers.json': 'd27fc1efba340df7ab0dce8aba65229dcdf359152dc8a4f3bd33ac9a459fb79a'
};

const COMMERCE_FUNCTIONS = {
  createStripeCheckoutSession: 'df590fc817a2e0fddb4696a5f147b60ce6f6a5dee64b6850b71928eeeae0c884',
  applyStripeCheckoutPaymentEvent: '2c99c156c7cd708585aacc026b6af39566b6f802b0013e126dfeb02bf4af7710',
  deductStockForOrder: '7756205302a65cbcfd85cdc522a7251fbb69e4cce0fb5d3516539051617a1c19',
  validateOrderStockOrThrow: '3c03483abf440dd7b2fbab8c49079c2a2dec3a68cd270c0fe55bcdb6e2a8442a',
  saveOrderForApi: 'f643a80541c9b238e98565a608a07c8ac4ef8946d9804e652c7bbe94cf8607f8',
  buildAuthoritativeStripeOrder: 'fc3a9b281f658ad47f81da3a43a5548e31440860052c8367ca209c4e357ef959'
};

function functionBody(source, name) {
  let index = -1;
  for (const prefix of [`async function ${name}(`, `function ${name}(`]) {
    index = source.indexOf(prefix);
    if (index >= 0) break;
  }
  assert.notEqual(index, -1, `missing function ${name}`);
  const start = source.indexOf('{', index);
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(index, i + 1);
    }
  }
  throw new Error(`unbalanced function ${name}`);
}

test('frontend catalog and CRM files remain byte-identical to the recovered Production baseline', () => {
  for (const [file, expected] of Object.entries(UNCHANGED)) {
    assert.equal(sha(file), expected, file);
  }
});

test('existing Stripe, webhook, order, and stock functions remain byte-identical', () => {
  const server = read('backend/server.js').toString('utf8');
  for (const [name, expected] of Object.entries(COMMERCE_FUNCTIONS)) {
    const digest = crypto.createHash('sha256').update(functionBody(server, name)).digest('hex');
    assert.equal(digest, expected, name);
  }
  assert.equal(/STOCK_RESERVATION_RPC_ENABLED|apiRateLimiter|validateImageDataUrl|setSecurityHeaders/.test(server), false);
});

test('minimal vercel config adds only the auth-entry route and no security-policy headers', () => {
  const config = JSON.parse(read('frontend/vercel.json').toString('utf8'));
  const routes = config.routes.map((route) => route.src);
  assert.ok(routes.includes('/line-auth-entry'));
  assert.ok(routes.indexOf('/line-auth-entry') < routes.indexOf('/api/(.*)'));
  assert.equal(config.headers, undefined);
  const uniqueAuthRoutes = routes.filter((route) => route === '/line-auth-entry').length;
  assert.equal(uniqueAuthRoutes, 1);
});
