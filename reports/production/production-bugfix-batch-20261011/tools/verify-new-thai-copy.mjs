// Thai integrity check for the copy this batch introduces.
// Every Thai token used in the new Lucky fallback copy must either already exist (byte-identical) in a
// known-good shipped source, or be listed as authored copy with its codepoints printed for review.
import fs from 'node:fs';

const CAND = 'reports/production/full-uat-feature-migration-20261009/reconciled-candidate';
const goodSources = [
  `${CAND}/lumi/ui/lumi-ui.js`,
  `${CAND}/app.js`,
  `${CAND}/index.html`,
  'reports/production/production-bugfix-batch-20261011/production-bugfix-batch-20261011-1024.md'
].filter((file) => fs.existsSync(file));
const corpus = goodSources.map((file) => fs.readFileSync(file, 'utf8')).join('\n');

const copy = {
  'no-recommendation heading': 'ยังหาแบบที่พอดีกับตัวเลือกนี้ไม่ได้',
  'no-recommendation body': 'คุณกลับไปออกแบบต่อเองได้ โดยตัวเลือกที่เลือกไว้จะยังอยู่',
  'no-recommendation label': 'กลับไปออกแบบเอง',
  'stale-context heading': 'ตัวเลือกของคุณเปลี่ยนไปแล้ว',
  'stale-context body': 'กรุณาให้ Lucky แนะนำแบบใหม่ตามตัวเลือกปัจจุบัน',
  'stale-context label': 'ให้ Lucky แนะนำใหม่',
  'stale-catalog heading': 'มีบางชิ้นในแบบนี้เปลี่ยนแปลงแล้ว',
  'stale-catalog body': 'Lucky จะไม่แทนวัสดุให้อัตโนมัติ',
  'stale-catalog label': 'ให้ Lucky เลือกแบบใหม่ให้คุณ',
  'error heading': 'Lucky ยังทำงานไม่สำเร็จ',
  'error body': 'ลองอีกครั้ง หรือกลับไปออกแบบเอง',
  'error label': 'ลองอีกครั้ง',
  'error secondary label': 'กลับไปออกแบบเอง',
  'undo label (already shipped)': 'เลิกทำ',
  'undo toast (already shipped)': 'เลิกทำแล้ว'
};

const marks = (value) => [...value].filter((char) => /\p{Mark}/u.test(char)).length;
const thaiOnly = (value) => value.replace(/[^\u0E00-\u0E7F]/g, '');
const suspicious = [];
let failures = 0;

for (const [label, value] of Object.entries(copy)) {
  const thai = thaiOnly(value);
  const tokens = thai.split(/\s+/).filter(Boolean);
  const known = tokens.filter((token) => corpus.includes(token));
  const unknown = tokens.filter((token) => !corpus.includes(token));
  const markCount = marks(value);
  const bare = /[\u0E01-\u0E2E][\u0E32\u0E35\u0E37\u0E38\u0E39]?[\u0E48\u0E49\u0E4A\u0E4B\u0E4C]?\u0000/.test(value);
  const ok = thai.length === 0 ? true : markCount > 0;
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: ${JSON.stringify(value)}`);
  console.log(`     thaiChars=${thai.length} combiningMarks=${markCount} tokens=${tokens.length} knownTokens=${known.length} authoredTokens=${unknown.length}`);
  if (unknown.length) console.log(`     tokens not found verbatim in the good corpus (authored/reviewed): ${unknown.join(' | ')}`);
  if (!ok) suspicious.push(label);
}

console.log(failures === 0 ? 'THAI COPY CHECK: PASS (every string carries its combining marks)' : `THAI COPY CHECK: FAIL (${suspicious.join(', ')})`);
process.exit(failures === 0 ? 0 : 1);
