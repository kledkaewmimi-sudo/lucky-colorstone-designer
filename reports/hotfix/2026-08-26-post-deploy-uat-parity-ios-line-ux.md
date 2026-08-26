# Phase 6B.2 — Post-deploy UAT parity and iOS LINE UX hotfix preparation

## Scope and safety

- Worktree: `D:\Projects\lucky-colorstone-prod-hotfix`
- Branch: `hotfix/post-deploy-uat-parity`
- Base: `origin/main` / `7820286e9f9037e59166f246c94d324e47c2cd01`
- Production deployment, production main, Render, Vercel, LINE configuration, Supabase, and payment code were not changed.
- UAT at `D:\Projects\lucky-colorstone-uat` was read-only.

## Audit classification

### Missing from production

1. The final UAT Step 2 presentation block was only partly selectively promoted. Production already had the four cards, their markup, the right-side hand panels, exact Thai copy, and CSS ordering. It omitted the final UAT dimensions and polish: compact vertical spacing, the shared text/image grid, 68px hand panels, normalized label/detail scale, complete mixed gold treatment, and small-screen rules. Earlier generic production card rules therefore continued to dominate the customer-visible composition.
2. Production had the accepted sticky card and animation-removal declarations, but omitted the final UAT active-view rule: `#stepView3.step-view.active { height: auto; min-height: 100%; }`. Without that sticky-containing-block contract, the preview can regress while the catalog scrolls.

### Already in production

- Step 2 state remains explicitly unselected on a fresh flow; the existing Thai validation and back-navigation preservation remain unchanged.
- The single `#step3PreviewCard` renderer, `position: sticky; top: 0`, opaque covered paint, and the animation/transform/filter reset already existed.
- Phase 6A.4 server-first callback handoff, callback marker recognition before reset, restore-before-consume, Step 4 authorization guards, and mixed physical-size preservation remain unchanged.
- LINE/OA code already takes the native LIFF friendship API before the approved OA URL fallback and uses a website-controlled loading/transition state around it.

### Intentionally UAT-only

- UAT sticky diagnostic helpers/overlay code (`debugSticky` and `step3StickyDebugOverlay`) were not copied.
- UAT environment guards, banners, routes, fixture behavior, and Step 4 test-only controls were not copied.

## Implemented hotfix

`index.css` now contains the final owner-approved UAT Step 2 presentation declarations and the missing active Step 3 sticky-containing-block declaration. The change is presentation-only: no renderer, state, geometry, pricing, callback, server, authentication, or payment behavior changed.

## iOS LINE UX audit

The full-screen login is LINE/LIFF/iOS-owned: the app invokes `liff.login({ redirectUri })` only when the deferred Step 3 boundary requires mobile LINE authentication and no LINE identity is available. A website cannot safely force that OS/provider authentication experience into a bottom sheet.

When identity already exists, `createDeferredStep3AuthBoundary` returns the direct path before any snapshot/handoff/login redirect. The subsequent centralized gate verifies `liff.getFriendship()`. For a non-friend, the app owns a loading/transition overlay, while LINE owns `liff.requestFriendship()` and its official add-friend UI. There is no omitted production half-height website friend modal in UAT; adding one would not replace or authorize the LINE-owned login surface.

Accordingly, no LINE behavior was changed. This preserves the proven iOS new-context recovery and avoids weakening LINE identity, OA friendship, or Step 4 authorization.

## Regression coverage added

`tests/production-hotfix-uat-parity.test.mjs` covers:

- Step 2 card order, mixed three-bead treatment, exact Thai copy, every right-side wrist image, vertical layout, and warm-gold selectors.
- The one shared Step 3 preview, sticky `top: 0`, opaque covered paint, absence of the Step 3 stacking animation, active-view height contract, and absence of debug/compact preview code.
- Deferred authentication bypass when identity already exists.
- Separation of website transition UI from LINE-owned login/native friendship behavior while preserving official fallbacks.

The earlier suite tested state/order and individual sticky declarations, but did not assert the final UAT card composition block or the active sticky-containing-block declaration. That omission allowed these visual regressions through a source-oriented regression pass.

## Verification

- `node --test tests/production-hotfix-uat-parity.test.mjs`: 4 passed, 0 failed.
- `node --test tests/*.test.mjs`: 114 passed, 0 failed.
- `node --check app.js`, `server.js`, `line-auth-handoff.js`, `line-redirect-restore.js`, `line-callback-bootstrap.js`, and `guest-design-state.js`: passed.
- `git diff --check`: passed.

## Files changed

- `index.css` — production-safe Step 2 presentation parity and Step 3 active sticky-container rule.
- `tests/production-hotfix-uat-parity.test.mjs` — regression contracts for the three owner-reported areas.

## Deployment status

This is hotfix preparation only. Production remains on its existing deployed release. The branch is ready to commit and push for controlled emergency deployment and owner mobile QA.
