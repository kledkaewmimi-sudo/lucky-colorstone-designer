# Step 3 LINE login migration audit

**Date:** 2026-08-22
**Scope:** Read-only architecture and migration design. No customer-flow, analytics, backend, database, or deployment behavior was changed by this audit.

## 1. Executive summary

### Recommendation: CONDITIONAL GO

The proposed guest-capable Steps 1–3 architecture is compatible with the current customizer. `renderStep1`, `renderStep2`, and `renderStep3` do not directly require a LINE identity, LIFF context, or a Supabase-authenticated browser user. The present mobile restriction is a landing-start guard, not a requirement of the three design steps themselves.

The safe mandatory-login boundary is **immediately before entering Step 4** (the Step 3 “next” action). LINE identity must be attached before an order/Stripe checkout payload is created so paid-order buyer notifications and CRM attribution continue to work.

This is not safe to implement merely by moving a call to `requireLineLoginForCustomization()`. The current OAuth resume mechanism intentionally stores only `{ ts, step: 1 }` in `lucky_colorstone_customize_login_intent`, then resets the design and returns the customer to Step 1. A future migration needs a dedicated, versioned guest-design handoff and restoration path.

The recommended implementation is a **hybrid**: a short-lived, non-sensitive canonical-design snapshot in localStorage for same-context recovery, backed by a short-lived opaque server-side handoff token for cross-browser/app-context LINE redirects. This is especially important for Instagram in-app browsers.

No database migration is needed for the current audit. A future implementation may need a bounded server-side temporary-state store (or an existing secure store with TTL); that decision should be made only during implementation.

## 2. Current auth sequence

### Files and participating functions

| Location | Current responsibility |
| --- | --- |
| `app.js` `setupLandingEvents()` | Handles the landing CTA, tracks `start_customize_click`, waits for bootstrap, then gates mobile designer entry. |
| `app.js` `requireLineLoginForCustomization()` | Central mobile/LINE-in-app authentication guard. Desktop returns success without LINE. |
| `app.js` `requiresLineLoginForCustomization()` | Requires login when `isLiffInClient()` or `isLikelyMobileBrowser()` is true. |
| `app.js` `initLIFF()` | Initializes LIFF once on page startup, checks login status, and retrieves a LINE profile when logged in. |
| `app.js` `syncLineProfileFromLiff()` | Retrieves profile if LIFF is logged in but `State.lineUserId` is missing. |
| `app.js` `startLiffLoginForCustomization()` | Saves the current customization login intent, tracks login start, then invokes `liff.login`. |
| `app.js` `openLineConnectEntryForCustomization()` | Fallback that stores the intent and navigates to the LIFF entry URL. |
| `app.js` `rememberCustomizationLoginIntent()`, `restoreCustomizationIntentAfterLogin()`, `completeCustomizationStartResume()` | Current post-OAuth restore path; restores only a Step 1 start intent. |
| `app.js` `getLiffRedirectUri()`, `clearOAuthQueryParams()` | Builds the clean app-path redirect URI and removes OAuth callback query parameters after initialization. |
| `app.js` `loadPersistedState()` / `saveState()` | Persists a subset of customizer state in `lucky_colorstone_state`. |

### Current control flow

```mermaid
sequenceDiagram
    participant V as Visitor
    participant L as Landing CTA
    participant A as app.js
    participant LIFF as LIFF / LINE
    participant S as localStorage
    participant D as Designer Step 1

    V->>L: Tap “เริ่มออกแบบ”
    L->>A: setupLandingEvents()
    A->>A: track start_customize_click; await startup bootstrap
    A->>A: resetStep3DesignState()
    A->>A: requireLineLoginForCustomization()
    alt Desktop, not LINE in-app
        A-->>D: Allow Step 1 (desktop bypass)
    else Mobile / LINE in-app with existing identity
        A-->>D: Allow Step 1
    else Mobile / LINE in-app, no identity
        A->>S: Store { ts, step: 1 } login intent
        A->>LIFF: liff.login({ redirectUri: clean app URL })
        LIFF-->>A: New callback page after authentication
        A->>LIFF: initLIFF(); isLoggedIn(); getProfile()
        A->>S: Find intent; restore currentStep = 1
        A->>A: clear OAuth parameters; render Step 1
    end
```

### Current conditions and redirect details

- A mobile user agent is enough to require LINE, even outside the LINE in-app browser. A LINE in-app browser is always considered login-required.
- The intentional desktop bypass is the false branch of `requiresLineLoginForCustomization()`.
- `initLIFF()` runs once in the normal page-start sequence. An OAuth return loads a new document and initializes LIFF again for that new page; the audit found no duplicate LIFF initialization within one document startup.
- `getLiffRedirectUri()` removes the query string. Consequently, raw UTM parameters are not passed through the LIFF return URL.
- `clearOAuthQueryParams()` removes callback parameters after initialization. A future opaque handoff key must be parsed and validated before that cleanup, or be preserved by a separately verified LIFF-safe mechanism.

## 3. Step dependency matrix

Classification means a dependency of the step implementation itself, not the current landing gate that prevents mobile users from reaching it.

| Dependency | Step 1 | Step 2 | Step 3 | Step 4 / checkout boundary |
| --- | --- | --- | --- | --- |
| `lineUserId` | NOT USED | NOT USED | NOT USED | REQUIRED BEFORE checkout/order payload by current app guard and buyer notification business rule |
| LINE profile / display name | OPTIONAL (`ownerName` can be entered) | NOT USED | NOT USED | OPTIONAL presentation field; identity is required separately before checkout |
| Profile image | NOT USED | NOT USED | NOT USED | NOT USED |
| LIFF context | NOT USED | NOT USED | NOT USED | Required only indirectly by the mobile login guard |
| Supabase authenticated browser user | NOT USED | NOT USED | NOT USED | NOT USED; the server, not the browser, uses Supabase credentials |
| Catalog data | NOT USED for wrist UI | REQUIRED for options/visuals | REQUIRED for catalog, stock validation and rendering | REQUIRED for authoritative server validation/pricing |
| Visitor/session IDs | OPTIONAL analytics | OPTIONAL analytics | OPTIONAL analytics | Required for continuity/attribution, not for visual rendering |
| CRM row/order record | NOT USED | NOT USED | NOT USED | Created only as part of checkout/order flows |
| Backend identity | NOT USED | NOT USED | NOT USED | Required before final payload to preserve LINE buyer notification and CRM identity |

`renderStep1()` only renders wrist-size/owner controls. `renderStep2()` and `renderStep3()` use customizer/catalog state but do not inspect `State.lineUserId`. `renderStep4()` itself is largely a review/shipping UI, but both `handleStripeCheckout()` and `submitOrderToCRM()` currently invoke `requireLineLoginForCustomization()` before they create their respective payloads. The recommended future point is therefore the **Step 3 -> Step 4 boundary**, not a later checkout-button gate.

## 4. State inventory and redirect survival

### Current persisted customizer state

`lucky_colorstone_state` currently persists:

- `wristSize`, `beadSize`, and `mixedPlacingSize`
- `ownerName`
- `lineUserId`
- `shippingInfo`
- `selectedCharmIds` (plus compatibility handling for legacy `selectedCharmId`)
- normalized `selectedStones`
- `currentStep`

Analytics uses separate localStorage keys for the pseudonymous `visitor_id`, `session_id`, first/latest source, and started time. The landing dismissal flag is sessionStorage. Checkout resume uses separate localStorage keys for checkout summary and Stripe order payload.

### Canonical future guest-design handoff state

Persist only data needed to reconstruct the design. The handoff should include a schema version, creation/expiry times, a random handoff identifier, and the following canonical fields:

| Category | Persist for handoff? | Notes |
| --- | --- | --- |
| Wrist size, bead size, mixed placement size | Yes | Source state. |
| Ordered `selectedStones`, including IDs, sizes, component type, unique IDs and spacer/charm placement | Yes | Source state; preserves exact sequence and Beryl occurrence positions. |
| Selected charms / selected charm IDs | Yes, if separate from ordered components | Source state. |
| Active catalog section/slot | Optional | UI-restoration convenience only; never needed to reconstruct the bracelet. |
| Current return target | Yes: `step: 4` | Must be distinct from the existing `{ step: 1 }` start intent. |
| Selected template/example | Include only if a real selected-template source field exists at implementation time | No independent source field was found in this audit beyond canonical selected components. |
| Owner name, shipping, notes | No in a guest redirect handoff by default | Treat as personal data; collect/reconfirm after login. Existing state persists these today, but a new handoff should minimize them. |
| Discount, line-item prices, total, preview image | No | Derived and/or server-authoritative; recompute and revalidate. |
| `ResolvedLayout`, geometry, canvas state | No | Derived from canonical components. |
| Beryl visual image choice | No | `getBerylVisualImage(occurrenceIndex)` deterministically derives its image while walking ordered components. |
| Catalog/stock snapshot | No | Refetch/revalidate after redirect. |
| Visitor/session IDs and compact attribution | Yes, link only | Pseudonymous identifiers must remain continuous; do not use them as an authorization credential. |

The design configuration code may be useful as a diagnostic/export representation, but it is base64 encoded rather than signed and should not be the sole authoritative handoff.

### Current state-survival answer

**A Step 3 design would not survive the current LINE redirect unchanged.** The current login intent only requests Step 1, and the resume path calls `resetStep3DesignState()` before rendering the designer.

## 5. OAuth redirect survival analysis

| Scenario | Expected future behavior | State risk | Mitigation |
| --- | --- | --- | --- |
| A. Instagram in-app browser | Login gate opens; return restores the exact canonical design and opens Step 4. | HIGH: LINE may open another app/custom-tab context with a different storage partition. | Opaque server handoff token plus local fallback; test actual ad deep-link path. |
| B. LINE in-app browser | LIFF login/reuse occurs; return restores Step 4. | MEDIUM: normally same context, but LIFF callback/lifecycle and query cleanup are sensitive. | Hybrid handoff; parse token before OAuth cleanup; test login and already-logged-in cases. |
| C. Chrome Android | Return restores Step 4. | MEDIUM: localStorage normally survives but app reclaim/new-tab behavior can lose or separate context. | Hybrid handoff with TTL. |
| D. Safari iOS | Return restores Step 4. | MEDIUM-HIGH: app lifecycle, private mode, storage eviction and external-app context are less predictable. | Hybrid handoff; graceful resume link/error state and device testing. |
| E. Returning authenticated LINE user | No redirect; immediately merge existing identity and enter Step 4. | LOW. | Validate `lineUserId`, retain the same guest visitor/session IDs, restore from in-memory/local snapshot. |
| F. User cancels login | Keep them at the Step 3 gate with the design intact; allow retry/back. | MEDIUM if the page reloads. | Do not clear handoff until successful restore or TTL expiry. |
| G. Login fails | Show a non-destructive retry state; retain Step 3 design. | MEDIUM. | Same as cancellation; record non-PII failure reason for diagnostics. |
| H. Browser/app process killed | A return link can recover within TTL. | HIGH for client-only persistence. | Server record is needed for a meaningful recovery path. |
| I. Return in a different browser context | Recover through opaque token if it reaches the app. | HIGH for localStorage; visitor/session cookie-like storage may not be shared. | Server fallback; attach LINE identity but preserve original attribution only after token validation. |
| J. Refresh after callback | Idempotently consume/restore or show a safe already-restored result. | MEDIUM: duplicate restoration or cleanup race. | One-time/idempotent handoff status, version checks, and a completed marker. |

sessionStorage alone is unsafe for this use case because it is tied to a tab/session and can be lost by an external-app/new-context redirect. localStorage is useful as a same-context convenience but not sufficient for Instagram and other cross-context paths.

## 6. Recommended storage strategy

### Options considered

| Option | Reliability | Privacy/security | Complexity | Assessment |
| --- | --- | --- | --- | --- |
| A. localStorage only | Good only in same browser context; poor for cross-context return. | Must contain no secrets/PII. | Low. | Insufficient as the only recovery path. |
| B. sessionStorage only | Poor after external login/new tab/app lifecycle. | Lower persistence but not reliable. | Low. | Reject. |
| C. Opaque server token + temporary server state | Best cross-context reliability and attribution continuity. | Token must be high entropy, single-use/idempotent, TTL-bound, and contain no raw secret in URL. | Medium. | Strong core mechanism. |
| D. Hybrid localStorage + opaque server fallback | Best practical reliability; local fast-path survives a normal same-context return and server covers cross-context. | Minimize client state; server record has TTL and access controls. | Medium-high. | **Recommend.** |

### Proposed hybrid contract (future work)

1. At the Step 3 gate, validate the canonical design locally and create a snapshot with schema version and a short expiry (for example, 10 minutes).
2. Store a minimized local copy under a dedicated new key; do not reuse `CUSTOMIZATION_LOGIN_INTENT_KEY`.
3. Create a server-side temporary record keyed by a random opaque token. It contains only the canonical design, pseudonymous visitor/session/attribution linkage, timestamps, status, and a return target. It does not contain LINE access tokens, Stripe credentials, Supabase credentials, or shipping details.
4. Start LIFF login with a verified way to carry/recover the opaque token. This must be validated against the deployed LIFF behavior before implementation; raw design, UTM values, and PII must not be placed in a redirect query string.
5. On callback, initialize LIFF, validate identity, atomically load/mark the temporary handoff, restore canonical fields, recompute layout/Beryl visuals/price, refresh catalog and stock, set `currentStep = 4`, then render.
6. Keep a one-time/idempotent completion record long enough for a refresh retry; expire and clean up records promptly. Delete the local handoff only after successful restoration or final completion.

## 7. Identity merge design

### Rules

1. The existing anonymous `visitor_id` remains unchanged through login whenever the same context survives.
2. The existing analytics `session_id` remains unchanged; pre-login events stay anonymous and are later associated with the LINE identity on the same session record.
3. On successful authentication, attach `lineUserId` and permitted profile display name to the same session/visitor context. Do not issue a new analytics session just because login completed.
4. The temporary handoff is authoritative for merging across browser contexts. If local storage is unavailable after callback, use its saved pseudonymous IDs and immutable first-attribution fields only after validating the random token and expiry.
5. Do not create a CRM customer or order at the guest-design stage. Create/attach identity only when the authenticated user progresses to Step 4 and a payment/order action occurs under current rules.
6. Preserve the original first-touch attribution; record the login return as a separate event/property rather than overwriting the original UTM source with direct traffic.
7. If a handoff is stale, corrupt, already consumed incompatibly, or fails catalog validation, do not guess. Recover the user to a non-destructive Step 3 state where possible and explain that the design needs review.

This prevents duplicate sessions, duplicate CRM customers, and duplicate orders while keeping historical anonymous funnel events attributable to the same visitor/session.

## 8. Analytics, Meta Pixel, and UTM plan

### Current behavior

- Analytics initializes a localStorage `session_id` and `visitor_id`, records first/latest source in localStorage, and sends events with current step and `lineUserId` when available.
- Existing funnel aliases include `landing_view`, `start_customize_click`/`start_designer`, `step_1_view` through `step_4_view`, `checkout_started`, and `payment_success`.
- Meta Pixel `ViewContent` is deduplicated in sessionStorage and occurs after the current designer-start path; `InitiateCheckout` is deduplicated per checkout session after Stripe session creation.
- Raw UTM query parameters are captured into analytics source state on landing. The current LIFF redirect URI removes query parameters, so the stored first source survives only when the browser storage context survives.

### Future event proposal (do not implement in this audit)

Retain current `start_customize_click` and step-view meanings. Add only explicitly named gate events using the project’s existing `trackAnalyticsEvent` convention:

- `line_login_gate_shown` — unauthenticated Step 3 user requests Step 4.
- `line_login_started` — LINE login navigation begins; include `gate_step: 3` and a non-PII method.
- `line_login_completed` — valid identity and handoff restored; include restore status/duration only.
- `line_login_failed` — technical authentication/recovery failure, with sanitized code.
- `line_login_cancelled` — explicit cancellation/return without a valid identity if detectable.
- `step4_reached_after_login` — Step 4 is actually rendered after successful restoration.

Keep `start_customize_click`, `step_1_view`, `step_2_view`, `step_3_view`, `step_4_view`, checkout, and paid events unchanged. Historical reporting remains comparable if reports distinguish a new gate conversion from the previous pre-Step-1 login behavior; do not redefine the old Start Designer event retroactively.

Pixel behavior should remain unchanged. In particular, do not duplicate `ViewContent` during a redirect restore and do not emit `InitiateCheckout` until a Stripe checkout session has actually been created. A future implementation needs redirect-aware deduplication testing because sessionStorage may not survive an external context.

## 9. Payment, CRM, and LINE notification impact

### Observed current flow

1. `handleStripeCheckout()` validates the design and fresh stock, calls `requireLineLoginForCustomization()`, validates shipping, creates/ensures preview, builds the order payload, then POSTs `/api/stripe/checkout-session`.
2. `buildCurrentOrderPayload()` includes `lineUserId`, customer/design/shipping fields, selected components, and analytics linkage.
3. The server’s `buildAuthoritativeStripeOrder()` performs authoritative catalog, stock, and pricing construction. `createStripeCheckoutSession()` creates the Stripe session and stores the pending order.
4. The direct CRM fallback `submitOrderToCRM()` also requires LINE before submission.
5. On payment, admin notifications are independent of buyer identity, but `trySendPaidOrderLineNotification()` uses `getOrderLineUserId(order)` to send the buyer’s paid-order LINE message.

### Consequences for the future design

- The server does not appear to enforce a non-empty `lineUserId` itself; the current application guard supplies that business rule. The future Step 3 gate must preserve it before payload/checkout creation.
- Stripe checkout technically need not happen before Step 4, and moving the gate to immediately before Step 4 preserves server-authoritative pricing, inventory validation, metadata construction, webhook idempotency, CRM data, and buyer LINE notifications.
- Do not create a guest CRM/order row before login. That would create avoidable duplicate identity and order-reconciliation risk.
- No Supabase schema or production record migration is indicated for this design. Backend service-role access remains server-only.

## 10. Security and privacy requirements

- Never store or transmit a LINE access token, LIFF secret, Stripe secret/key, Supabase service-role key, or any privileged credential in guest persistence.
- Store only non-sensitive canonical bracelet state locally. Do not put raw shipping address, phone, email, or full profile data in the new guest handoff.
- Treat owner name as personal data for the dedicated handoff and re-collect/reconfirm it after login unless a documented privacy decision permits local-only retention.
- Use an opaque, unguessable server token; no raw state in a URL. Enforce HTTPS, TTL, size limits, schema validation, and one-time/idempotent restoration.
- Use a schema version and validate IDs/sizes/component order against current catalog data. Ignore corrupt/stale handoffs safely rather than evaluating arbitrary objects.
- Expire temporary records quickly (recommended 10 minutes), remove local/server records after successful completion according to a documented retention policy, and keep only enough completed status to make callback refreshes idempotent.

## 11. Proposed future UX (design only)

At the Step 3 next action:

- If `isLineIdentityAvailable()` is true, proceed straight to Step 4.
- Otherwise, display a compact, non-technical gate that explains the benefit of connecting LINE. The supplied copy fits the current premium, supportive tone and can be accommodated as a title, supporting text, and primary CTA without changing the Steps 1–3 customizer model:

  - Title: `บันทึกแบบของคุณแล้วไปต่อ`
  - Supporting text: `เชื่อมต่อ LINE เพื่อเก็บแบบกำไลและดำเนินการสั่งซื้อ`
  - CTA: `ดำเนินการต่อด้วย LINE`

- Include a safe back/dismiss path that keeps the customer’s Step 3 design; cancellation must not reset the bracelet or send them to the landing screen.

No UI was added in this audit.

## 12. Rollback strategy

Implement the future gate behind a remote/configurable feature flag, defaulting to the existing behavior. Keep the existing pre-Step-1 `requireLineLoginForCustomization()` path isolated and available as the immediate fallback.

Suggested flag behavior:

- **Off:** current production flow exactly: mobile authentication before Step 1; desktop bypass unchanged.
- **On:** guest-capable Steps 1–3 and the new Step 3 -> Step 4 login handoff.

Rollback is code/config only and does not require a database migration if temporary handoffs have TTL and remain backward-compatible. Turning the flag off must stop new guest handoffs, retain old callback recognition temporarily, and leave already created paid orders/webhooks unchanged. Observe funnel, handoff failure, restore failure, and payment-notification error rates before removing legacy code.

## 13. Staged implementation plan

1. **Preparation:** add internal tests/fixtures for canonical design serialize/deserialize, including mixed stones/spacers/charms and Beryl occurrence order. Do not change gate behavior.
2. **Persistence:** add the versioned, TTL-bound hybrid handoff plus validation, cleanup, and idempotent restore tests. Preserve the old `{ step: 1 }` intent for the legacy flow.
3. **Flagged gate:** add a Step 3 gate behind a disabled-by-default feature flag. On authenticated users, proceed immediately; on unauthenticated users, save handoff and start the existing LINE mechanism.
4. **Callback restore:** process the opaque handoff before OAuth query cleanup; validate LINE identity; restore canonical design; re-fetch/revalidate catalog/stock; recompute derived layout/pricing; open Step 4.
5. **Instrumentation:** add the proposed events, preserve existing event meanings, and add error/restore-duration diagnostics without PII. Verify Pixel deduplication.
6. **Browser/device verification:** test actual Instagram in-app, LINE in-app, Chrome Android, Safari iOS, returning LINE user, cancellation, failure, killed-process, different-context, and refresh flows. Also test desktop bypass and rapid repeated gate taps.
7. **Controlled rollout:** enable for a small monitored cohort, compare Step 1/3/4, checkout, paid, restore-failure, and notification metrics for several days.
8. **Completion:** make a rollout decision only after attribution, CRM order identity, Stripe/webhook, and buyer LINE notification checks pass. Keep the legacy gate until rollback risk is acceptably low.

## 14. Risk ranking

| Risk | Rating | Why / control |
| --- | --- | --- |
| Lost design in Instagram/cross-context redirect | HIGH | Use opaque server handoff and real-device tests. |
| Broken LIFF callback token handling | HIGH | Verify LIFF redirect/state behavior before implementation; parse before cleanup. |
| UTM/visitor attribution split | HIGH | Persist immutable first-touch linkage in validated handoff; do not overwrite on callback. |
| Duplicate analytics/Pixel events | MEDIUM | Preserve current meanings and add redirect-aware dedupe tests. |
| Checkout/CRM buyer identity missing | HIGH | Gate before Step 4/order payload; reject/repair missing identity before Stripe creation. |
| Stale price or unavailable component after redirect | MEDIUM | Re-fetch and server-authoritatively validate at Step 4/checkout. |
| Beryl/renderer visual mismatch | LOW-MEDIUM | Restore ordered canonical components only and recompute deterministic visuals/layout. |
| Privacy leakage in browser storage/query | HIGH if mishandled | No PII/secrets in handoff; opaque tokens and TTL. |

## 15. Audit conclusion

Proceed only as a feature-flagged, measured migration after the hybrid handoff and real in-app-browser testing are implemented. The business objective is technically feasible without modifying renderer, catalog identity, pricing, Stripe, webhook, CRM, or Supabase records, but redirect survivability and attribution continuity are release-blocking acceptance criteria.
