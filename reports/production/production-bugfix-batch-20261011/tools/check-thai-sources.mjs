// Thai-integrity check for the candidate copy sources of the Lucky fallback states.
import fs from 'node:fs';

const report = (label, value) => {
  const marks = [...value].filter((char) => /\p{Mark}/u.test(char)).length;
  console.log(`${label}\n   text: ${JSON.stringify(value)}\n   chars=${[...value].length} bytes=${Buffer.byteLength(value, 'utf8')} combiningMarks=${marks}`);
  return marks;
};

const candidate = fs.readFileSync('reports/production/full-uat-feature-migration-20261009/reconciled-candidate/lumi/ui/lumi-ui.js', 'utf8');
for (const [label, re] of [
  ['current NO_RECOMMENDATION body', /NO_RECOMMENDATION\) return messageScreen\('([^']*)','([^']*)'/]
]) {
  const match = candidate.match(re);
  if (match) { report(label + ' (title)', match[1]); report(label + ' (body)', match[2]); }
}

const qa = fs.readFileSync('tests/lumi/lumi-browser-qa.spec.mjs', 'utf8');
const headings = [...qa.matchAll(/\['(no-recommendation|stale-context|stale-catalog|error)', '([^']+)'\]/g)];
console.log('\nQA spec headings:');
for (const [, mode, text] of headings) report('  ' + mode, text);

const replaceHeading = qa.match(/name: '([^']+)' \}\)\)\.toBeVisible\(\);\s*await expect\(page\.getByText\('([^']+)'\)\)/);
if (replaceHeading) { console.log('\nQA replacement card copy:'); report('  heading', replaceHeading[1]); report('  body', replaceHeading[2]); }

for (const [label, text] of [
  ['current lucky page1 heading', 'ให้ Lucky รู้จักคุณอีกนิด'],
  ['current lucky result heading', 'Lucky ได้คัดสรรพลังงานพิเศษ'],
  ['current primary CTA', 'ใช้แบบนี้ต่อ']
]) report('\nreference copy: ' + label, text);
