// Extracts the owner-approved Lucky fallback-state copy from the 2026-09-28 build that still carried
// it, and prints each string with its codepoints so Thai integrity can be verified before reuse.
import fs from 'node:fs';

const file = process.argv[2] || 'reports/lumi/backups/phase-12-10a-20260928-2029/lumi-ui.js';
const source = fs.readFileSync(file, 'utf8');
const states = ['NO_RECOMMENDATION', 'STALE_CONTEXT', 'STALE_CATALOG', 'ERROR'];
const codepoints = (value) => [...value].map((char) => 'U+' + char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')).join(' ');
const marks = (value) => [...value].filter((char) => /\p{Mark}/u.test(char)).length;

for (const state of states) {
  const match = source.match(new RegExp(`LUMI_UI_STATES\\.${state}\\) return messageScreen\\(([^;]+)\\);`));
  if (!match) { console.log(state + ': NOT FOUND'); continue; }
  const args = [...match[1].matchAll(/'([^']*)'/g)].map((entry) => entry[1]);
  console.log('=== ' + state + ' ===');
  console.log('  raw args: ' + JSON.stringify(args));
  args.forEach((value, index) => {
    console.log(`  [${index}] ${JSON.stringify(value)}`);
    console.log(`      codepoints: ${codepoints(value)}`);
    console.log(`      utf8 bytes: ${Buffer.byteLength(value, 'utf8')}, chars: ${[...value].length}, marks: ${marks(value)}`);
  });
}
