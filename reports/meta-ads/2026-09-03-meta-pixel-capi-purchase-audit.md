# Meta Pixel + Conversions API Purchase Tracking Audit

## Scope and evidence

Audit only. No tracking request was sent, no secret was read, no payment code was changed, and no deployment occurred. Source reviewed was Production `main` at `a4ff7199f41e65de0eff41431ba8c6959f99035e`.

Important finding: this is **not** a blank Meta-tracking codebase. Current `main` already contains partial browser Pixel and server CAPI logic. Its live configuration and whether Events Manager receives events are **not verified** in this audit.

## 1. Current tracking architecture

### Existing browser behavior

`index.html` currently loads the Meta browser library, initializes a hard-coded public Pixel identifier, and sends `PageView` immediately. `app.js` has best-effort wrappers around `window.fbq` and currently sends:

- `ViewContent`, once per browser session while the customer is in the designer (before Step 4);
- `InitiateCheckout`, only after the application has successfully created a Stripe Checkout Session; it sends THB and `amountTotal / 100`.

These are browser-only events. `ViewContent` has no value/content metadata, and `InitiateCheckout` has no explicit `eventID` because it currently has no server companion event.

### Existing server behavior

`server.js` has `getMetaConversionsApiConfig()` reading `META_PIXEL_ID` and `META_CONVERSIONS_API_ACCESS_TOKEN`, plus `sendMetaPurchaseEvent(order)`. When configured, it posts one `Purchase` to Graph API v22.0 with:

- `event_id`: `stripe_checkout_<Stripe Checkout Session ID>`;
- `action_source`: `website`;
- `currency`: `THB`;
- `value`: `getOrderTotalPrice(order)`.

It sends no `user_data`, `fbp`, `fbc`, client IP, user agent, email, phone, or test-event code. There is no retry/outbox/observability record. Its activation is **UNVERIFIED** because environment values were intentionally not inspected.

### Existing internal analytics

`app.js` creates a UUID-like `analyticsSessionId` and `analyticsVisitorId`; the first landing source is stored in browser `localStorage`. It captures `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, referrer, landing URL, user agent, and a platform guess. It preserves this analytics continuity across the site’s deferred LINE-auth handoff and includes it in the pending order.

The current source model does **not** capture `fbclid`, `_fbp`, or `_fbc`. UTM values are available to internal analytics/order context, but they are not Meta click identifiers.

## 2. Authoritative Purchase point

The authoritative paid-order path is server-side:

1. `/api/stripe/webhook` verifies the Stripe signature.
2. It accepts only `checkout.session.completed` or `checkout.session.async_payment_succeeded` where Stripe reports `payment_status === 'paid'`.
3. `applyStripeCheckoutPaymentEvent()` verifies application order reference, order/session linkage, THB currency, and authoritative amount.
4. It deducts stock, marks `stripePaymentStatus: 'paid'`, persists the paid order/cost snapshot, and links internal analytics.
5. Current CAPI `Purchase` is started asynchronously after `saveOrderForApi(paidOrder)` and analytics linking; it is not awaited by webhook processing.

This is the correct candidate authority for CAPI Purchase. A Stripe success redirect, `/api/stripe/checkout-session` browser read, checkout-session creation, or client callback must not be the sole Purchase authority. The browser return page currently checks server-reported paid status, but it is still not authoritative by itself.

The authoritative amount is the validated paid order total used by `getOrderTotalPrice(order)` after webhook amount/currency verification. Currency is currently THB. Do not use a client-calculated price or Stripe success-page query string as the Purchase value source.

## 3. Recommended minimum event plan

| Event | Recommended trigger | Source | Value/currency | Notes |
| --- | --- | --- | --- | --- |
| `PageView` | Page load, after applicable consent | Browser Pixel | none | Existing, but currently loads before any consent gate. |
| `ViewContent` | First meaningful designer/custom-bracelet view | Browser Pixel | Optional only if a deterministic displayed product value exists | Existing trigger is acceptable as a custom-product view; do not invent product IDs/value. |
| `InitiateCheckout` | Stripe Checkout Session successfully created | Browser Pixel | server-returned `amountTotal / 100`, `THB` | Existing timing is correct; session creation is not Purchase. |
| `Purchase` | Paid webhook authority; optional browser mirror only after browser re-reads paid state | Server CAPI + Browser Pixel | authoritative paid order total, `THB` | Required deduplication design below. |

Do not add a generic `AddToCart` merely because Meta supports it: this journey is a designer with no demonstrated cart boundary. Do not report Purchase from success-page arrival.

## 4. Purchase event ID and deduplication design

Use one immutable deterministic event ID per paid checkout:

```text
stripe_checkout_<Stripe Checkout Session ID>
```

This is already the current CAPI ID and is preferable to a random browser ID. It is one-to-one with the application checkout and is available to the paid webhook and the browser return URL. Do not expose it in marketing copy or logs beyond existing controlled order/session handling.

Future design:

1. Server sends CAPI `Purchase` only from the authoritative paid webhook with this ID.
2. Browser sends Pixel `Purchase` only after it calls the existing checkout-session read endpoint and receives the matching paid order/session state.
3. Browser passes the same value, currency, and event ID using Meta Pixel’s documented event-ID option.
4. Meta deduplicates the browser and server versions by event name and shared event ID. Never generate distinct browser/server IDs for one payment.

If the customer never returns from Stripe, CAPI still records the real paid purchase. If browser tracking is blocked, CAPI still provides the server event. Existing code has CAPI only, so it does not currently create a duplicate Purchase; it also does not yet meet the requested dual-channel deduplication design.

## 5. Matching data audit

| Candidate field | Current availability at paid webhook | Proposed use | Hashing / caution |
| --- | --- | --- | --- |
| Email | Stripe webhook session can contain `customer_details.email`; browser return endpoint also reads it | Eligible only if present, consent/legal basis is documented, and normalized correctly | SHA-256 before CAPI user data; do not log. Current CAPI does not send it. |
| Phone | Shipping form/order and Stripe session may contain phone | Eligible only if actually present and normalized | SHA-256 before CAPI user data; do not use address as a substitute. |
| External ID | Immutable application `order.id` is available | Optional server-side matching/correlation field | Hash according to Meta CAPI requirements; keep raw ID internal. |
| Client IP | Not safely available at webhook: webhook requester is Stripe | Do **not** use webhook request IP | To use, capture original checkout-request IP server-side with privacy review; never fabricate it. |
| Client user agent | Existing analytics source carries browser user agent into the order when present | Potentially available, but verify provenance/retention and consent | Not a hashed identifier; do not rely on it if absent. |
| `_fbp` / `_fbc` | Not currently captured or persisted | Future consent-gated attribution fields | Send raw Meta cookie values only when genuinely present; do not hash or invent. |

The Stripe checkout creation code currently puts customer/shipping details into Stripe metadata. That is pre-existing and outside this audit; do not broaden that pattern for tracking. Prefer a narrowly scoped application order attribution object, retained server-side, rather than putting Meta identifiers or additional PII into Stripe metadata.

## 6. `fbclid`, `_fbc`, and `_fbp` design

Current state: none are captured by customer code, orders, or server CAPI.

Future additive design, after consent is resolved:

1. On the **first landing**, read `fbclid` from the query string exactly if present. Preserve it with the existing first-touch analytics/order continuity; do not overwrite it on later internal navigation.
2. Read `_fbp` only if Meta Pixel has set it and consent permits use; persist the actual returned cookie value with the pending order attribution context.
3. Use an existing `_fbc` cookie if present. If no `_fbc` exists but the original landing has a real `fbclid`, derive a compatible `_fbc` only using Meta’s documented format and the actual landing timestamp. Never derive `_fbc` without `fbclid`.
4. Keep these values out of URLs, public logs, Stripe metadata, and frontend bundles after capture. Carry only the approved attribution object from order creation to the paid webhook.
5. At paid webhook, use only values truly carried from the original customer request; never use Stripe webhook IP/UA as customer values.

Implementation should recheck the current Meta CAPI specification for formatting/normalization immediately before launch.

## 7. Direct-ad and link-hub attribution

### Direct ad destination

Preferred paid-Meta destination is the direct website URL, with both Meta click parameters preserved and explicit UTM parameters for internal analytics. If `fbclid` arrives at Lucky Colorstone, the site can capture it, Pixel can set/read browser identifiers subject to consent, and the order can carry attribution to server CAPI. This gives Meta its strongest practical matching opportunity; it is still not a promise of every conversion being attributed.

### Instagram/Linktree/link-hub path

If an Instagram profile or link hub sends a visitor onward without `fbclid`, Lucky Colorstone cannot honestly reconstruct it. UTM parameters can survive and preserve internal source/campaign reporting, but they do not replace Meta click IDs. Pixel/CAPI can still measure events on Lucky Colorstone and may match using permitted browser/server signals, but Meta may not attribute that payment back to the original ad interaction.

Recommendation: use a direct site destination for paid Meta ads whenever the campaign objective is website purchase optimization. For link-hub links, configure dedicated UTMs, test whether the provider preserves query parameters, and do not claim that the hub retains Meta attribution unless a real end-to-end test proves it.

### Linktree / link-hub is a supported production journey

The following is a normal supported journey and must be covered by the future implementation and release test plan:

```text
Meta/Facebook/Instagram ad or content
→ Instagram profile
→ Linktree or another link hub
→ customize.luckycolorstone.com
→ bracelet designer
→ Stripe Checkout
→ authoritative paid webhook
→ CAPI Purchase
```

The site must capture every attribution value that actually reaches Lucky Colorstone on the landing request: `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `fbclid` when present, existing `_fbp`, existing valid `_fbc`, document referrer, full landing URL, and an explicit first-landing timestamp. It must preserve this first-touch object across the designer, checkout, the pending application order, Stripe order correlation, paid webhook, and CAPI Purchase.

Do not put `fbclid`, `_fbp`, `_fbc`, or additional customer matching data in Stripe metadata. Existing Stripe metadata’s `orderId` is sufficient correlation: the authoritative webhook finds the pending application order by Stripe Checkout Session ID, then reads the server-persisted attribution object from that order.

#### Linktree URL standard

Use a dedicated, consistent destination URL rather than relying on referrer alone, for example:

```text
https://customize.luckycolorstone.com/?utm_source=instagram&utm_medium=linktree&utm_campaign=<campaign>
```

Suggested convention:

| Traffic | `utm_source` | `utm_medium` | `utm_campaign` |
| --- | --- | --- | --- |
| Organic Instagram profile → Linktree | `instagram` | `linktree` | a stable content/profile campaign name |
| Paid Meta click intentionally routed through link hub | `instagram` or `facebook` | `linktree_paid` | Meta campaign identifier/name |
| Direct paid Meta ad → website | `facebook` or `instagram` | `paid_social` | Meta campaign identifier/name |

Keep `utm_content` for creative/link placement and `utm_term` only where it has an agreed purpose. If an ad platform macro is used, retain its arriving value separately rather than overloading these fields. Naming must be agreed once and documented; a link hub must be tested to prove it preserves the chosen query parameters.

#### Required Linktree identifier cases

| Case | What Lucky Colorstone must do | What must not be claimed |
| --- | --- | --- |
| A. `fbclid` reaches the website | Preserve original `fbclid`; use existing/validly derived `_fbc`; preserve `_fbp` when present and permitted; send valid available CAPI matching data at paid authority | Best practical match potential is not guaranteed ad attribution. |
| B. `fbclid` is lost, but browser identifiers exist | Preserve genuine `_fbp` and existing valid `_fbc` only; preserve Linktree UTMs/referrer/session/order linkage; send only available permitted data | Do not recreate a missing `fbclid` or assert the purchase is attributable to the earlier Meta ad. |
| C. No Meta click identifier reaches the website | Track session/order internally with UTM, referrer, landing URL, and timestamps; send legitimate Pixel/CAPI Purchase without fabricated Meta IDs | Meta may not attribute the purchase to the originating ad. UTM does not substitute for `fbclid`/`_fbc`. |

### First-touch and last-touch internal attribution

Current code has a useful first-touch pattern: on analytics initialization, it stores the first source in `ANALYTICS_SOURCE_KEY`, and `getAnalyticsOrderFields()` sends that first source with the order. It also writes a latest source snapshot to `ANALYTICS_LATEST_SOURCE_KEY` on initialization. However, the current pending order/server analytics model persists only the first source as the explicit order attribution field; it does **not** yet persist a distinct last-touch object through the paid webhook. This is a design gap, not evidence that both touch models are already supported.

Future design:

1. Create immutable `first_touch` at the first consented external landing. Include raw arriving attribution and `captured_at`; never overwrite it during internal navigation.
2. Create `last_touch` only for a later meaningful external/re-entry landing with real new UTM, `fbclid`, or referrer evidence. Internal designer navigation must not replace it with empty/direct values.
3. Persist both objects in the pending application order before Stripe Session creation. Keep Stripe metadata limited to correlation (`orderId`), then retrieve both through the existing order/session lookup at the paid webhook.
4. For CAPI Purchase, use first-touch Meta identifiers when they are the valid original click context; retain last-touch only for internal reporting unless a documented business rule explicitly selects another attribution model. Never overwrite a known first paid-ad attribution merely because the same browser later arrives through Linktree.
5. Internal reports should expose first-touch and last-touch separately. Do not sum them or use one as a silent replacement for the other.

Example: first touch `instagram / paid_social / campaign_a`; later Linktree entry `instagram / linktree / profile_link`. Preserve both. The initial paid source remains the first-touch fact; the Linktree visit is the later-touch fact. Whether a future business report credits first, last, or an agreed model is an analytics decision, not a data-capture mutation.

### Direct-ad preference

For Meta campaigns optimizing toward website purchases, use the direct `customize.luckycolorstone.com` destination with campaign UTMs whenever possible. Linktree remains fully supported for Instagram-profile and organic/link-hub journeys, but it should not be the preferred conversion-campaign landing when direct website linking is available because link hops can discard Meta identifiers.

### Acceptance tests for the future implementation

Both scenarios must pass without changing checkout/payment behavior:

1. **Direct Meta Ad → Website → Purchase:** arriving `fbclid`/UTMs are captured once, carried to the pending order, and the paid webhook emits exactly one CAPI Purchase with the deterministic event ID; browser Purchase, if enabled after paid confirmation, uses the same ID.
2. **Meta/Instagram → Linktree → Website → Purchase:** all arriving Linktree UTMs/referrer/identifiers are captured; Cases A/B/C above are tested explicitly; no missing ID is fabricated; the paid webhook remains the purchase authority.

For each scenario assert that Stripe session creation, payment, stock/order persistence, CRM, customer confirmation, and webhook response remain successful when Pixel/CAPI is blocked, unconfigured, or returns an error.

## 8. Privacy and consent

No customer-facing cookie preference/consent mechanism was found in the audited tracked files. Current Pixel loads and sends PageView immediately, so this needs a privacy/legal review before tracking expansion.

Thailand’s PDPA guidance describes non-necessary cookies and user choice/consent considerations; see [OPDC cookie-consent guidance](https://dataportal.opdc.go.th/tl/knowledge//cookies-consent) and [DITP PDPA overview](https://pdpa.ditp.go.th/). For UK/EEA or similarly regulated traffic, advertising tracking/cookies generally require prior, informed, freely given consent; the [ICO cookie guidance](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/cookies-and-similar-technologies/) and [online-advertising guidance](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/how-do-the-rules-apply-to-online-advertising/) are useful examples. This is implementation guidance, not legal advice.

Before expanding Pixel/CAPI, owner should obtain privacy advice for actual target markets, update privacy/cookie disclosures, decide lawful basis/consent records and withdrawal behavior, and ensure Pixel/cookies/CAPI matching fields do not run or transmit when consent is absent where consent is required. Do not silently add a banner in this phase.

## 9. Meta owner setup required

Before implementation, owner must confirm in Events Manager:

- the intended Meta Dataset/Pixel and its Pixel ID;
- domain association/verification and any event configuration/measurement requirements for `customize.luckycolorstone.com`;
- a server-side CAPI credential strategy: System User/durable token with only necessary dataset access, not a Graph API Explorer token;
- secure server environment names (for example `META_PIXEL_ID`, `META_CONVERSIONS_API_ACCESS_TOKEN`, and a separate test-event-code variable only for test mode);
- Events Manager Test Events procedure and test code handling;
- owner for token expiry/rotation and monitoring.

Never paste these credentials into chat, source files, GitHub Actions, or browser code.

## 10. Failure isolation and retry design

The current CAPI call is best-effort because it is started without awaiting it after paid-order persistence; Meta failure therefore does not block checkout, webhook response, stock deduction, order creation, customer confirmation, CRM, or LINE notifications. This behavior must be retained.

Future implementation should add bounded timeout, redacted structured result logging, and a durable idempotent retry/outbox strategy keyed by the same Purchase event ID. It must never retry by creating a new event ID, delete orders, or turn a Meta failure into a webhook failure. Alert on sustained failures without logging customer matching data.

## 11. Phased implementation plan — do not implement in this task

### Phase A — Pixel base and browser identifiers

Reconcile the existing hard-coded Pixel initialization with approved configuration and consent behavior. Add consent-gated first-touch `fbclid` / `_fbp` / `_fbc` capture and safe order continuity.

### Phase B — browser funnel events

Keep the minimum event set: PageView, meaningful ViewContent, and InitiateCheckout only after Stripe Session creation. Define precise custom-product metadata only where deterministic.

### Phase C — server CAPI Purchase

Harden the existing webhook-only CAPI Purchase around paid-order authority, safe user-data normalization/hashing only for available consented fields, timeout, redacted errors, and idempotent outbox/retry.

### Phase D — browser/server Purchase deduplication

Add browser Purchase only after confirmed paid-state read. Use the existing `stripe_checkout_<session>` event ID identically in browser and CAPI.

### Phase E — Events Manager Test Events

Use a test-only event code; validate PageView, funnel events, CAPI Purchase, event ID matching, value/currency, and no duplicate Purchase.

### Phase F — low-risk live purchase test

One approved real low-value test payment; re-read Stripe/order state and Events Manager diagnostics. Confirm checkout/payment/CRM remain unchanged.

### Phase G — Ads Manager optimization and attribution review

After sufficient real traffic, inspect attributed purchases/value, Event Match Quality, deduplication, and direct-vs-link-hub behavior. Do not infer business performance from a single test.

## 12. Future files and blast radius

Likely future changes, subject to separate approval:

- `index.html`: only Pixel base/config/consent gating if retained there;
- `app.js`: consent-aware browser identifiers, first-touch attribution persistence, browser Purchase after server paid confirmation, and event-ID forwarding;
- `server.js`: CAPI payload/matching data, event idempotency/retry, and explicit non-blocking failure handling;
- focused Meta tracking tests and a privacy/cookie document or consent component.

These are high-touch files (`index.html`, `app.js`, `server.js`) and would require a dedicated regression plan. No orders schema/table, Stripe amount computation, webhook authority, CRM behavior, inventory, catalog, renderer, existing analytics meaning, or GitHub Actions Ads ingestion scheduler should be changed as part of tracking. The only acceptable causal link is an additive, best-effort call made after authoritative paid persistence.

## Final status

- Meta Pixel implemented by this audit: **NO**
- Pre-existing browser Pixel implementation found: **YES — partial (PageView, ViewContent, InitiateCheckout)**
- Conversions API implemented by this audit: **NO**
- Pre-existing server CAPI Purchase implementation found: **YES — partial; live configuration/delivery UNVERIFIED**
- Browser/server Purchase deduplication implemented: **NO**
- `fbclid` / `_fbp` / `_fbc` continuity implemented: **NO**
- Production modified: **NO**
- Frontend modified: **NO**
- Payment behavior modified: **NO**
- Stripe behavior modified: **NO**
