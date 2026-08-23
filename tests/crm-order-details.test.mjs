import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildCopyReadyShippingLabel, getOrderFinalBraceletPreviewImage } from '../crm-order-details.js';

test('CRM uses the saved final Step 4 preview even for designs containing Beryl', () => {
  const finalPreview = 'data:image/webp;base64,final-step4-preview';
  assert.equal(getOrderFinalBraceletPreviewImage({
    braceletPreviewImage: finalPreview,
    braceletSequence: [{ type: 'stone', stoneId: 'beryl' }]
  }), finalPreview);
  assert.equal(getOrderFinalBraceletPreviewImage({ braceletPreviewImage: 'https://example.test/preview.webp' }), '');
});

test('copy-ready shipping label has exactly recipient, full address, and phone lines', () => {
  const label = buildCopyReadyShippingLabel({
    recipientName: '\u0E18\u0E31\u0E0D\u0E1E\u0E23 \u0E42\u0E1E\u0E28\u0E32\u0E25\u0E2A\u0E38\u0E02\u0E27\u0E34\u0E17\u0E22\u0E32',
    addressLine: '35/145 \u0E0B.\u0E23\u0E31\u0E0A\u0E14\u0E32\u0E20\u0E34\u0E40\u0E29\u0E0132',
    province: '\u0E01\u0E23\u0E38\u0E07\u0E40\u0E17\u0E1E\u0E21\u0E2B\u0E32\u0E19\u0E04\u0E23',
    postalCode: '10900',
    phoneNumber: '0621542457'
  });
  assert.deepEqual(label.split('\n'), [
    '\u0E18\u0E31\u0E0D\u0E1E\u0E23 \u0E42\u0E1E\u0E28\u0E32\u0E25\u0E2A\u0E38\u0E02\u0E27\u0E34\u0E17\u0E22\u0E32',
    '35/145 \u0E0B.\u0E23\u0E31\u0E0A\u0E14\u0E32\u0E20\u0E34\u0E40\u0E29\u0E0132 \u0E01\u0E23\u0E38\u0E07\u0E40\u0E17\u0E1E\u0E21\u0E2B\u0E32\u0E19\u0E04\u0E23 10900',
    '0621542457'
  ]);
});

test('CRM retains its SVG layout only as the legacy fallback and renders the copy button', async () => {
  const [crmSource, cssSource] = await Promise.all([
    readFile(new URL('../crm.js', import.meta.url), 'utf8'),
    readFile(new URL('../crm.css', import.meta.url), 'utf8')
  ]);
  assert.match(crmSource, /if \(savedPreviewImage\) \{/);
  assert.doesNotMatch(crmSource, /savedPreviewImage && !hasBeryl/);
  assert.match(crmSource, /order-copy-shipping-label/);
  assert.match(crmSource, /navigator\.clipboard\.writeText\(shippingLabel\)/);
  assert.match(cssSource, /\.order-bracelet-preview-snapshot \{[\s\S]*border: 0;/);
});
