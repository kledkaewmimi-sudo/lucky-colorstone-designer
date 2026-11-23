# Meta Pixel production implementation

Date: 2026-08-22

## Scope and audit

Audited `index.html`, `app.js`, `server.js`, Stripe Checkout creation, the signed Stripe webhook, the Stripe return/success handling, internal analytics, and deployment configuration. No prior Meta Pixel preparation or consent implementation was found.

The customer site is a Vercel static frontend served at `https://customize.luckycolorstone.com/`. Its `/api/*` requests proxy to the Render backend. The browser Pixel ID is public by design; no Meta access token is placed in frontend code.

Existing internal analytics, UTM handling, LIFF behavior, checkout pricing, stock validation, Stripe behavior, fulfillment, and LINE notifications are unchanged.

## Implemented browser events

- Pixel ID: `1573172861217430`.
- `PageView`: the base Pixel queues one event on each customer-page load. It is not triggered by step changes or rerenders.
- `ViewContent`: sent once per browser tab session when the customer enters the designer (after the landing/login flow reaches customization). It is also restored once if a LIFF return opens an in-progress designer session. It has no PII or catalog payload.
- `InitiateCheckout`: sent only after `/api/stripe/checkout-session` successfully returns a Stripe Checkout URL and server-authoritative `amountTotal` and `currency`. The browser sends `currency: "THB"` and the server amount converted from Stripe minor units to THB. No event is emitted on a failed session creation or merely by entering Step 4.

The browser loader is asynchronous, has the standard `fbq` guard, and does not block rendering or the LINE flow.

## Purchase and Conversions API

Purchase is not sent from the success page. The existing success page still only queries/uses paid state established by the signed Stripe webhook.

Server-side Purchase is prepared as an isolated, best-effort post-payment side effect. It runs only after the webhook has validated the paid Stripe session, saved the paid order, and linked the existing internal analytics conversion. It uses the authoritative saved order total in THB and a stable `event_id` of `stripe_checkout_<Stripe Checkout Session ID>`. Existing webhook retry handling returns before repeating the side effect; the stable event ID also supports Meta deduplication if delivery is retried externally.

The CAPI path stays disabled when either required environment variable is absent, and a delivery failure is caught so it cannot fail payment/order processing.

Required backend environment variables:

```text
META_PIXEL_ID=1573172861217430
META_CONVERSIONS_API_ACCESS_TOKEN=<create manually in Meta Events Manager; do not commit or expose it>
```

No access token, PII, raw IP, visitor ID, session ID, fingerprinting, or customer data is added to Meta tracking.

## Consent and privacy follow-up

No privacy-policy, cookie notice, or consent gate was found in the audited customer app. Because the browser Pixel loads immediately, the owner should have a privacy/PDPA counsel review and, where required for the audience/jurisdiction, publish an appropriate privacy/cookie disclosure and configure a consent mechanism before using advertising optimization at scale. This task intentionally does not add a new consent UI/system.

## Verification performed

- `node --check app.js` passed.
- `node --check server.js` passed.
- `git diff --check` passed.
- Static review confirmed one Pixel initialization and one base `PageView` call.
- Browser runtime was unavailable in this environment, so no live browser/network event assertion or Meta Test Events verification was possible before deployment.

## Owner test procedure after deployment

1. In Meta Events Manager, open **Lucky Colorstone Website** > **Test Events** (เหตุการณ์ทดสอบ).
2. Visit `https://customize.luckycolorstone.com/` in a fresh browser tab. Confirm one `PageView` for Pixel/Dataset `1573172861217430`.
3. Start the designer and complete the LINE entry flow if prompted. Confirm one `ViewContent`.
4. Change steps, rerender the bracelet, and interact with the catalog. Confirm no repeated `PageView` or `ViewContent` events.
5. Complete valid checkout details until the app redirects to Stripe. Confirm one `InitiateCheckout` with THB currency and the Stripe Checkout amount.
6. Force or trigger a checkout-session validation failure. Confirm no `InitiateCheckout`.
7. Open a Stripe success URL without a paid webhook confirmation. Confirm no browser `Purchase`.
8. For server Purchase, add the two backend environment variables, redeploy Render, complete a real/test paid Stripe webhook event, and then confirm `Purchase` in Test Events. Without the access token, Purchase is intentionally unavailable.
