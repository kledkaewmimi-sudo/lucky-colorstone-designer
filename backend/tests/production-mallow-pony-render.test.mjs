import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';
import sharp from 'sharp';

const MALLOW_THAI = '\u0E2D\u0E31\u0E0D\u0E21\u0E13\u0E35\u0E41\u0E2B\u0E48\u0E07\u0E40\u0E2A\u0E19\u0E48\u0E2B\u0E4C';
const PONY_THAI = '\u0E21\u0E49\u0E32\u0E41\u0E2B\u0E48\u0E07\u0E1D\u0E31\u0E19';
const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const data = await readFile(new URL('../data.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../index.css', import.meta.url), 'utf8');

function codepoints(value) {
  return Array.from(value, (character) => character.codePointAt(0));
}

async function assertApprovedAsset(relativePath, expectedHash) {
  const file = new URL(relativePath, import.meta.url);
  const content = await readFile(file);
  const metadata = await sharp(content).metadata();
  assert.ok((await stat(file)).size > 0);
  assert.equal(createHash('sha256').update(content).digest('hex').toUpperCase(), expectedHash);
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.hasAlpha, true);
  assert.equal(metadata.width, 3375);
  assert.equal(metadata.height, 4219);
}

test('Mallow and Pony approved WebP runtime assets are present and transparent', async () => {
  await assertApprovedAsset('../assets/spacers/Mallow.webp', '8DDB90661DD81BB8803297E31CE95B2798C9A96F1F2FE0EA9C0C03175AD7E53B');
  await assertApprovedAsset('../assets/spacers/Pony.webp', 'C229566B7F12B96BF29165A2AB77C1C9D702326E8868F1DD5A7CC365994EE5E6');
});

test('authoritative Thai strings retain every owner-approved Unicode codepoint', () => {
  assert.deepEqual(codepoints(MALLOW_THAI), [0x0E2D, 0x0E31, 0x0E0D, 0x0E21, 0x0E13, 0x0E35, 0x0E41, 0x0E2B, 0x0E48, 0x0E07, 0x0E40, 0x0E2A, 0x0E19, 0x0E48, 0x0E2B, 0x0E4C]);
  assert.deepEqual(codepoints(PONY_THAI), [0x0E21, 0x0E49, 0x0E32, 0x0E41, 0x0E2B, 0x0E48, 0x0E07, 0x0E1D, 0x0E31, 0x0E19]);
});

test('only presentation=hanging spacers use the pendant anchor path', () => {
  assert.match(data, /presentation: record\.presentation \|\| 'inline'/);
  assert.match(data, /renderWidthMm: toFiniteNumber\(record\.business\?\.renderWidthMm/);
  assert.match(data, /attachmentLoopMm: toFiniteNumber\(record\.business\?\.attachmentLoopMm/);
  assert.match(app, /function isHangingSpacerComponent\(component\)/);
  assert.match(app, /component\?\.type === 'spacer' && component\?\.presentation === 'hanging'/);
  assert.match(app, /const HANGING_SPACER_PREVIEW_TUNING = Object\.freeze/);
  assert.match(app, /mallow: Object\.freeze\(\{[\s\S]*?renderWidthMm: 14\.45,[\s\S]*?renderHeightMm: 28\.475,[\s\S]*?outwardOffsetMm: 7\.2,[\s\S]*?attachmentAnchorX: 0\.5197,[\s\S]*?attachmentAnchorY: 0\.1704/);
  assert.match(app, /pony: Object\.freeze\(\{[\s\S]*?renderWidthMm: 21,[\s\S]*?renderHeightMm: 30,[\s\S]*?outwardOffsetMm: 7\.2,[\s\S]*?attachmentAnchorX: 0\.3369,[\s\S]*?attachmentAnchorY: 0\.1887/);
  assert.match(app, /function getHangingSpacerPreviewComponent\(component\)/);
  assert.match(app, /function getFixedHangingSpacerPlacement\(component, frameWidth, frameHeight, sourceWidth, sourceHeight, bounds = null\)/);
  assert.match(app, /if \(isHangingSpacerComponent\(component\)\) \{[\s\S]*?return getFixedHangingSpacerPlacement/);
  assert.match(app, /node\.component\.charmType === 'bee_heart' \|\| isHangingSpacerComponent\(node\.component\)/);
  assert.match(app, /component\.type === 'charm' \|\| isHangingSpacerComponent\(component\)/);
  assert.match(app, /presentation: spacer\.presentation \|\| 'inline'/);
});

test('Mallow uses a stable 85 percent display frame while Pony retains its accepted frame and anchor', () => {
  const metadata = {
    mallow: { widthMm: 14.45, heightMm: 28.475, catalogWidthMm: 17, catalogHeightMm: 33.5, anchorX: 0.5197, anchorY: 0.1704, bounds: { width: 1681, height: 3085 } },
    pony: { widthMm: 21, heightMm: 30, anchorX: 0.3369, anchorY: 0.1887, bounds: { width: 1991, height: 2456 } }
  };
  for (const item of Object.values(metadata)) {
    const firstAngleScale = Math.min(item.widthMm / item.bounds.width, item.heightMm / item.bounds.height);
    const laterAngleScale = Math.min(item.widthMm / item.bounds.width, item.heightMm / item.bounds.height);
    assert.equal(firstAngleScale, laterAngleScale);
    assert.ok(item.anchorX > 0 && item.anchorX < 1);
    assert.ok(item.anchorY > 0 && item.anchorY < 1);
  }
  assert.equal(Number((metadata.mallow.widthMm / metadata.mallow.catalogWidthMm).toFixed(6)), 0.85);
  assert.equal(Number((metadata.mallow.heightMm / metadata.mallow.catalogHeightMm).toFixed(6)), 0.85);
  assert.equal(metadata.pony.widthMm, 21);
  assert.equal(metadata.pony.heightMm, 30);
  assert.notEqual(metadata.mallow.widthMm / metadata.mallow.heightMm, metadata.pony.widthMm / metadata.pony.heightMm);
  assert.notEqual(metadata.mallow.anchorX, metadata.pony.anchorX);
});

test('Step 3 preview layers above tabs while charm hit testing remains clipped to its viewport', () => {
  assert.match(css, /#stepView3 \.canvas-card \{[\s\S]*?z-index: 20;/);
  assert.doesNotMatch(css, /\.catalog-type-filter \{[\s\S]{0,240}?z-index:\s*21;/);
  assert.match(app, /const previewInteractionClipId = 'bracelet-preview-interaction-clip';/);
  // Evaluate the existing attribute arguments so quote style is irrelevant.
  const attributesFor = (target) => {
    const attributes = new Map();
    const calls = app.matchAll(new RegExp(`${target}\\.setAttribute\\(([^;]+)\\);`, 'g'));
    for (const [, argumentsSource] of calls) {
      const attributeName = argumentsSource.match(/^['"]([^'"]+)['"]/u)?.[1];
      const expectedNames = target === 'previewInteractionRect' ? ['width']
        : target === 'charmImage' ? ['pointer-events'] : ['clip-path', 'pointer-events'];
      if (!expectedNames.includes(attributeName)) continue;
      const [name, value] = Function('previewInteractionClipId', `return [${argumentsSource}];`)('bracelet-preview-interaction-clip');
      attributes.set(name, value);
    }
    return attributes;
  };
  assert.equal(attributesFor('previewInteractionRect').get('width'), '250');
  assert.equal(attributesFor('charmImage').get('pointer-events'), 'none');
  assert.equal(attributesFor('charmHitbox').get('clip-path'), 'url(#bracelet-preview-interaction-clip)');
  assert.equal(attributesFor('charmHitbox').get('pointer-events'), 'all');
  assert.match(app, /group\.addEventListener\('click', async \(\) => \{/);
});

test('Lucky Clover remains a normal charm path, not a hanging spacer', () => {
  assert.match(app, /if \(component\.type === 'charm' \|\| isHangingSpacerComponent\(component\)\)/);
  assert.doesNotMatch(app, /cl01[\s\S]{0,240}presentation:\s*['"]hanging/);
});
