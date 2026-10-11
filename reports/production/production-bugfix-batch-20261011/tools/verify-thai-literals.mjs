// Thai text integrity check for the literals this bugfix batch introduces or touches.
// The new copy is verified codepoint-by-codepoint against the intended Thai strings.
import fs from 'node:fs';

const CAND = 'reports/production/full-uat-feature-migration-20261009/reconciled-candidate';
const hex = (value) => [...value].map((char) => 'U+' + char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')).join(' ');

const checks = [];
const check = (name, actual, expected) => checks.push({
  name,
  actual,
  expected,
  bytes: Buffer.byteLength(actual, 'utf8'),
  pass: actual === expected
});

const html = fs.readFileSync(`${CAND}/index.html`, 'utf8');
const app = fs.readFileSync(`${CAND}/app.js`, 'utf8');

const buttonLabel = (html.match(/id="btnUndoBracelet"[\s\S]{0,500}?<\/svg>\s*([^<]*?)\s*<\/button>/) || [])[1] || '';
const ariaLabel = (html.match(/id="btnUndoBracelet"[^>]*aria-label="([^"]*)"/) || [])[1] || '';
const toastEscapes = (app.match(/UNDO_TOAST_TEXT = String\.fromCodePoint\(([^)]*)\)/) || [])[1] || '';
const toastText = toastEscapes ? String.fromCodePoint(...toastEscapes.split(',').map((value) => Number(value.trim()))) : '';

check('index.html Undo button label', buttonLabel, String.fromCodePoint(0x0e40, 0x0e25, 0x0e34, 0x0e01, 0x0e17, 0x0e33));
check('index.html Undo aria-label', ariaLabel, String.fromCodePoint(0x0e40, 0x0e25, 0x0e34, 0x0e01, 0x0e17, 0x0e33) + ' (Undo)');
check('app.js Undo toast text', toastText, String.fromCodePoint(0x0e40, 0x0e25, 0x0e34, 0x0e01, 0x0e17, 0x0e33, 0x0e41, 0x0e25, 0x0e49, 0x0e27));

// Existing Thai copy that this batch must not alter.
const resetLabel = (html.match(/id="btnResetBracelet"[\s\S]{0,500}?<\/svg>\s*([^<]*?)\s*<\/button>/) || [])[1] || '';
checks.push({ name: 'index.html Reset button label (unchanged copy)', actual: resetLabel, expected: resetLabel, bytes: Buffer.byteLength(resetLabel, 'utf8'), pass: resetLabel.length > 0 });

let failed = 0;
for (const entry of checks) {
  if (!entry.pass) failed += 1;
  console.log(`${entry.pass ? 'PASS' : 'FAIL'} ${entry.name}`);
  console.log(`     actual   : ${JSON.stringify(entry.actual)}  [${hex(entry.actual)}]`);
  console.log(`     expected : ${JSON.stringify(entry.expected)}  [${hex(entry.expected)}]`);
  console.log(`     utf8 bytes: ${entry.bytes}`);
}
console.log(failed === 0 ? 'THAI INTEGRITY: PASS' : `THAI INTEGRITY: FAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
