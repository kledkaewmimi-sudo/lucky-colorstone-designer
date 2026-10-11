# Lucky Colorstone - Production follow-up, turn 5 (owner-confirmed defects after turn 4)

**Report:** `reports/production/production-bugfix-batch-20261011/production-bugfix-batch-turn5-20261011-1620.md`
**Date:** 2026-10-11, 15:25-16:35 Asia/Bangkok
**Frontend deployed:** Vercel Production `dpl_6FcvxGochjbyqHYaHip1o6oRc9or` (`lucky-colorstone-designer-r6vuyz6nn`), aliased to `customize.luckycolorstone.com` + `crm.luckycolorstone.com`; 5/5 changed files byte-identical to the artifact live.
**Backend:** Render `srv-d8v7cknlk1mc739o88lg` currently runs `606da9aff796a60aa6c6749cfaff3be8e5f616ec`; the new commit `9d35e942eac78dba6355715770d173343bf744fb` is pushed to `release/uat-feature-migration-20261010` and awaits the owner's manual deploy.

## Verdicts

| Issue | Verdict |
|---|---|
| 1 - CRM talisman status cannot be re-enabled | **PASS (code fixed and verified).** Live cl01 is still `inStock=false / isActive=false` because re-enabling requires one authenticated CRM save, which only the operator can perform - no credential exists in this workspace and security was not bypassed. |
| 2 - Duplicate shipping details on the order card | **PASS (fixed, deployed, verified).** |
| 3 - Lucky cannot design in Production | **ROOT CAUSE PROVEN = issue 1.** With the live catalog (`cl01` inactive) the six-goal WITH_TALISMAN flow fails 28/28 with `LUMI_COMPOSITION_NO_CHARM` and never substitutes. With `cl01` active (zero stock or 1000 units) it succeeds 28/28 and the real browser flow passes. Live resolution requires the owner's one reactivation save. |
| 4 - Undo stops after one step on a manual bracelet | **NOT REPRODUCED in automation; two latent defects in the same code path fixed and verified against the mandated workflow matrix.** |

## Issue 1 - root cause and fix

**Root cause (proven in code + reproduced).** Both the client normalizer (`data.js normalizeCharmRecord`) and the backend (`server.js normalizeCatalogAvailabilityPayload`) derived the status with AND over **two representations**: the nested `availability` object the CRM form writes, and the legacy flat `inStock`/`isActive` keys that remain on the payload. Disabling writes `false` into both, so from then on the stale flat `false` won the AND forever and a reactivation could never be persisted - exactly the live row: `inStock=false`, `isActive=false`, `stockQty=1000`.

**Fix.** An explicitly present nested value is now authoritative and the flat keys are derived from it (client and server), so `availability.inStock=true` + `availability.isActive=true` persists in both representations. Unrelated fields (price, render tuning, stock quantity) are untouched.

| Path | Change |
|---|---|
| `data.js` | `normalizeCharmRecord`: nested-first precedence, flat `inStock`/`isActive`/`stockQty` mirrored from the resolved availability. |
| `server.js` | `normalizeCatalogAvailabilityPayload`: same precedence, payload and `in_stock`/`is_active` columns derived from the nested value. |

**Evidence (all through the real client helper + a real backend with real login/CSRF):**

* `tools/crm-charm-status-matrix.mjs` - the owner's exact reproduction plus the mandated 10-case matrix: **32/32 PASS** against the fixed server and **32/32 PASS against the currently deployed server revision `606da9a`** (proving the frontend fix alone already unblocks the operator). Evidence: `evidence/crm-charm-status-matrix.json`.
* Cases covered: true/true -> false/false -> true/true; false/true; true/false; false/false -> true/false -> true/true; duplicate save; save after refresh; hidden/inactive record re-enabled; stock 1000 preserved during status-only edits; zero stock + active; unauthenticated PUT 403; cookie PUT without CSRF 403.
* The captured reactivating request body carries explicit `"inStock":true` / `"isActive":true` flat **and** nested flags.

**Owner action required (one save, ~20 seconds):** CRM -> Inventory -> Talismans -> Edit Lucky Clover (cl01) -> check **IN STOCK** -> check **ACTIVE IN CATALOG** -> **Save Talisman** -> reopen. Expected: both checkboxes checked, stock 1000, `GET /api/charms` shows `inStock=true / isActive=true` for cl01. **Live operator verification: UNVERIFIED by me (no credential); verified locally end-to-end.**

## Issue 2 - single shipping presentation per order card

The card rendered five `order-detail-field` rows (RECIPIENT NAME / PHONE NUMBER / FULL ADDRESS / PROVINCE / POSTAL CODE) *plus* the formatted copy block, duplicating recipient, phone and address.

**Fix.** `renderOrderCardShipping` now renders the compact block only: `<div class="order-card-shipping">${renderCopyReadyShippingLabel(shippingInfo)}</div>`. The block still carries recipient, complete formatted address (province + postal code on the address line) and phone, plus the **คัดลอกที่อยู่จัดส่ง** button. The copy handler moved into `bindOrderCardShippingCell` (one binding per card) and calls `event.stopPropagation()` so copying never opens View Detail. The obsolete `.order-card-shipping .order-detail-field` CSS rules are gone; the card keeps the rounded navy border, mobile stacking (`data-label`) and desktop layout. View Detail keeps its full field list, and the authenticated CRM contract is unchanged.

Verified: unit test `production-crm-order-card-shipping.test.mjs` (asserts exactly one `.order-shipping-label-block`, one copy button, zero field rows, block-only renderer, order pricing -> shipping -> cost) and the browser acceptance spec (per-order copy text, distinct addresses, no modal opened by copy, mobile stacking with no horizontal overflow, missing-address handling, list-without-projection fallback).

## Issue 3 - Lucky in Production

`tools/lucky-cl01-status-matrix.mjs` runs the owner's configuration (WITH_TALISMAN + all six goals, 7 weekdays x 4 bead modes) through the real engine **and** the real Step-3 acceptance validator against the live catalog:

| Catalog state | Recommended | Accepted | Clover present | Pyrite |
|---|---|---|---|---|
| cl01 inactive (current production) | 0/28 - `LUMI_COMPOSITION_NO_CHARM` | 0 | n/a - no substitution | 0 |
| cl01 active, stock 0 | **28/28** | **28/28** | 28/28 | 0 |
| cl01 active, stock 1000 | **28/28** | **28/28** | 28/28 | 0 |

Real browser (Chromium, mobile viewport, real UI): six goals + WITH_TALISMAN with an active-but-zero-stock catalog produces the result page, applies the design to Step 3, keeps `cl01`, and never uses Pyrite (`tests/production-bugfix-batch/lucky-zero-stock-runtime.spec.mjs`).

Conclusion: the turn-4 policy change works; the live failure is the `cl01` row being **inactive** (issue 1). The engine correctly refuses rather than silently substituting, so the flow stays blocked until the owner's reactivation save. **Live customer flow after reactivation: UNVERIFIED by me; to be confirmed by the owner in the CRM + customer flow.**

## Issue 4 - manual-design Undo

The mandated realistic manual matrix was executed in Chromium (390x844, tap interaction): empty manual bracelet, 10 sequential stone additions, a talisman, a spacer, four removals, further edits to more than 20 distinct actions, then Undo until empty with **every intermediate composition, charm set and price compared against the recorded timeline**; plus rapid-tap, retained-slot re-add and Lucky-generated Undo regressions. **All five specs pass on the current code**, so the owner's exact trigger was not reproduced by automation.

Two latent defects in that same path were found and fixed anyway:

1. `pushUndoSnapshot` compared a new snapshot against the previous **history entries** and silently dropped the entry when a removal returned the bracelet to a composition the history already held - a lost step makes Undo stop walking back. Replaced with a 400 ms burst window that suppresses only the duplicate DOM events of the *same* action (`pointerdown` + `click` + `change` + the settle re-check).
2. The Undo control was bound directly to the cached node; any Step 3 toolbar re-render would leave a dead button. The click handler is now delegated from `document`, and `syncUndoButtonState` resolves the live node.

Verified: `manual-undo-depth.spec.mjs` (3 tests), `undo-button-identity.spec.mjs` (2 tests, includes node-identity tracking across tab switches and 12 rapid taps), `undo-depth-and-geometry.spec.mjs` (Lucky-generated Undo + geometry, 4/4). If the owner still sees a single-step Undo, the exact tap sequence is needed - the scripted equivalents all pass.

## Tests performed

| Suite | Result |
|---|---|
| Production regression (`node --test tests/*.test.mjs tests/*.test.cjs`) | **268/268 PASS** |
| Security harnesses | **226/226 PASS** |
| CRM charm contract harness (real backend + login/CSRF) | **13/13 PASS** |
| CRM status persistence matrix (owner reproduction + 10 mandated cases) | **32/32 PASS** (fixed server) and **32/32 PASS** (deployed server revision) |
| CRM browser acceptance (talisman save + order card) | **2/2 PASS** |
| CRM unit tests (talisman save, order-card shipping) | **11/11 PASS** |
| Manual-editor Undo specs | **5/5 PASS** |
| Lucky runtime zero-stock acceptance (six goals + talisman) | **1/1 PASS** |
| Lucky cl01 status matrix | 0/28 inactive (refused) - 28/28 zero stock - 28/28 in stock |
| Live artifact identity after deploy | **5/5 changed files byte-identical** |

## Files changed (release candidate)

`data.js` (charm availability precedence), `server.js` (same precedence server-side), `crm.js` (single shipping block + copy binding), `crm.css` (drop dead field-row rules), plus new tests/harnesses: `tests/production-bugfix-batch/manual-undo-depth.spec.mjs`, `tests/production-bugfix-batch/undo-button-identity.spec.mjs`, extended `tests/production-bugfix-batch/crm-talisman-save-and-order-shipping.spec.mjs`, extended `tests/production-crm-order-card-shipping.test.mjs`, `tools/crm-charm-status-matrix.mjs`, `tools/lucky-cl01-status-matrix.mjs`.

## Release artifacts

| Item | Value |
|---|---|
| Vercel artifact | 291 files, 106,128,828 bytes, fingerprint `bed7ba5a27df89c7175e00466b25f7a8d3687a49f82c155d3e501e0250c90738` |
| Render artifact | 11 files, 296,624 bytes, fingerprint `f207998a062fc8ff2c07380204ac2f5114bb0a455fab5891de6390aef5620033`; `server.js` sha256 `b48990263dcb0a18...` |
| Vercel deployment | `dpl_6FcvxGochjbyqHYaHip1o6oRc9or` (production, Ready, both custom domains) |
| Render commit (owner deploy) | `9d35e942eac78dba6355715770d173343bf744fb` on `release/uat-feature-migration-20261010` (parent `606da9a`); verified on the remote and byte-identical to the artifact |
| Production data modified | **none** (no catalog, order, schema, RLS, GRANT or environment change; `cl01` stock quantity untouched at 1000) |

## Remaining operator steps / blockers

1. **Re-enable cl01 in the CRM** (steps above). Until then the live six-goal WITH_TALISMAN flow keeps returning no recommendation - by design, because an inactive item must not be recommended.
2. Optional: deploy Render commit `9d35e942eac78dba6355715770d173343bf744fb` so the server-side precedence matches the client (the frontend fix already unblocks the save on the deployed revision).
3. If manual Undo still stops after one step, provide the exact tap sequence from the owner's session; every scripted equivalent of the reported flow passes.
