const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('index.css', 'utf8');

test('Step 2 mixed-size card inherits the standard card and selected-card surfaces while retaining its recommendation badge', () => {
  assert.match(html, /class="bead-size-card bead-size-card-mixed"/);
  assert.match(html, /class="bead-size-mixed-recommendation"[\s\S]*?แนะนำ/u);
  assert.match(css, /#stepView2 \.bead-size-card,[\s\S]*?border-color: rgba\(181, 169, 219, 0\.24\);[\s\S]*?background: var\(--color-white\);[\s\S]*?box-shadow: 0 6px 16px rgba\(111, 85, 148, 0\.08\);/);
  assert.match(css, /#stepView2 \.bead-size-card\.active,[\s\S]*?border-color: rgba\(139, 0, 0, 0\.18\);[\s\S]*?box-shadow: 0 8px 18px rgba\(181, 169, 219, 0\.1\);/);
  assert.doesNotMatch(css, /#stepView2 \.bead-size-card-mixed(?:\.active)?\s*\{/);
});
