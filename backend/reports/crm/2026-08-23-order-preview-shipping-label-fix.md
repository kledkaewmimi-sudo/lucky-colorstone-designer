# CRM order preview and shipping-label fix

## Scope

This narrow CRM-only change does not alter the customer Step 4 renderer, order
creation, Stripe, webhook, LINE authentication or notifications, analytics,
UTM, pricing, catalog, or Beryl behavior.

## Order preview

New Stripe orders already persist `braceletPreviewImage`: the compact data-image
created from the final customer Step 4 preview before checkout. CRM previously
ignored that saved image for an order containing Beryl and rebuilt an independent
SVG layout. That fallback introduced the visible white bead stroke and different
layering.

CRM now always displays the stored final Step 4 image when one exists, including
orders with Beryl. Its wrapper adds no background, border, or padding. The SVG
renderer remains only as a backward-compatible fallback for legacy orders that
do not have a saved data-image; its white stone stroke was removed.

## Copy-ready shipping block

Order Details now derives a selectable three-line label from existing shipping
fields:

1. recipient name;
2. address line, province, and postal code joined with spaces;
3. phone number.

The **คัดลอกที่อยู่จัดส่ง** button copies exactly that string. It uses the secure
clipboard API with a browser fallback and does not change stored order data.
Structured shipping fields remain below it for reference.

## Verification

- `node --test tests/*.test.mjs`: 55 passing tests.
- New CRM tests verify saved Step 4 images are selected even for Beryl, legacy
  preview fallback remains present, and the shipping label has exactly three
  lines.
- `node --check crm.js`, `node --check crm-order-details.js`, `node --check
  app.js`, and `node --check server.js` passed.
- `git diff --check` passed.

Browser automation was not available in this environment; after deployment the
live CRM scripts are checked directly. An authenticated owner should make the
final visual/copy check on a production order, including a legacy order if one
is available.
