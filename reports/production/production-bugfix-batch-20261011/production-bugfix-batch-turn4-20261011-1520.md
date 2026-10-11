# Lucky Colorstone - Production fixes, turn 4 (CRM talisman save, order-card shipping, Lucky design eligibility)

**Report:** `reports/production/production-bugfix-batch-20261011/production-bugfix-batch-turn4-20261011-1520.md`
**Date:** 2026-10-11, 13:35-15:25 Asia/Bangkok (GMT+7)
**Deployed frontend:** Vercel Production `dpl_3FJJ5LkvPAVKbX8HC1dVWohQqE2r` (`lucky-colorstone-designer-58m2cw65o`), aliased to `customize.luckycolorstone.com` + `crm.luckycolorstone.com`.
**Backend:** commit `606da9aff796a60aa6c6749cfaff3be8e5f616ec` pushed to `release/uat-feature-migration-20261010`; Render is owner-operated, so the currently live backend is still `fe282deaeebb644ccf1bd3fc5e8de70cdce7b44f`.

## Task / goal

1. **TASK A** - make the CRM talisman Save path correct for existing hidden/inactive records, safe on a duplicate-ID POST, and honest about failures.
2. **TASK B** - move the complete shipping-information presentation into each CRM Order Card (recipient, full address, postal code, phone, "คัดลอกที่อยู่จัดส่ง"), keeping customer/specs -> layout -> pricing -> shipping -> cost order, mobile layout and View Detail intact.
3. **TASK C** - separate Lucky *design eligibility* from *fulfillment availability*: active, replenishable stones/charms stay recommendable at zero stock; discontinued Pyrite, inactive, deleted or nonexistent items stay excluded; checkout stays authoritative.

## Scope

Production source of truth `reports/production/full-uat-feature-migration-20261009/reconciled-candidate` (verified byte-identical to live `customize.luckycolorstone.com` before the change). The UAT tree (`index.html`, `app.js`, `crm.*` at the repository root) was **not** modified.

## What was inspected

`data.js` (`getSharedCharmCatalog`, `saveSharedCharmCatalogEntry`, `refreshCharmCatalog`, `adaptNormalizedCharmCatalogToLegacy`), `crm.js` (talisman form/inline saves, `renderOrdersList`, `openOrderDetailModal`, `getOrderShippingInfo`), `crm.html`/`crm.css` (orders table, modal, `data-label` mobile rules), `crm-order-read-model.js`, `server.js` (`/api/charms` GET/POST/PUT, `requireAdminAccess`, `readCrmOrderProjection`, `validateOrderStockOrThrow`), `lumi/contracts/catalog-snapshot.js`, `lumi/scoring/eligibility.js`, `lumi/import/step3-import.js`, `lumi/ui/lumi-ui.js`, `app.js` (Lucky preview + snapshot plumbing), live `https://customize.luckycolorstone.com/api/charms|stones|spacers`.

## Findings (verified, not assumed)

* **`GET /api/charms` has no visibility filter.** The live API lists `bh02` with `isActive=false`. So "hidden charms are absent from the public catalog" was *not* proven; the real defect is that the CRM derived the write verb from a **client-side list that can drift** (bundled `/data/charms.json` fallback when `/api/charms` fails, deleted rows, another operator's change) while swallowing every failure (`return null`, no toast).
* Server contract measured with the real backend + real operator login/CSRF: `POST /api/charms` with an existing id -> **409**; `PUT /api/charms/:id` -> 200 for stored ids, **404** for ids the catalog no longer stores; `GET /api/charms` lists inactive rows.
* The CRM order list projection (`readCrmOrderProjection` + `toCrmOrderSummary`) did **not** carry any shipping field, so the card could not present the address without a backend change.
* **Lucky runtime gate found by runtime evidence, not by reading code alone:** with a fully zero-stock but active catalog the engine *did* produce a recommendation (`lumi_recommendation_viewed`), but the Lucky preview's `validateLumiPresentationCompleteness` threw `LUMI_PREVIEW_INCOMPLETE_PRESENTATION`, which `lumi-ui` converts into the "Lucky ยังทำงานไม่สำเร็จ" screen. Offline gallery coverage therefore did **not** equal runtime coverage (owner's warning confirmed).

## Root causes

| Task | Root cause |
|---|---|
| A | Write verb decided from a non-authoritative client list; all non-OK responses collapsed into `null`, and the CRM closed the modal without feedback. |
| B | The authenticated CRM order-list projection omitted recipient/phone/address fields (Supabase `select` list) - the data existed only on the detail endpoint. |
| C | `available(item)` was used for both `active` and `inStock` in the catalog snapshot, `eligibility.js` treated stock as a blocking reason, `step3-import.js` refused zero-stock materials, and the Lucky preview treated an unfilled ring position as fatal. |

## Files changed (release candidate)

| Path | Change |
|---|---|
| `data.js` | `saveSharedCharmCatalogEntry(record, { mode })`: authoritative verb choice (`update`/`create`/catalog), POST-409 retried as PUT against the same id **only** when the refreshed catalog exposes the record (protected `renderTuning` carried over), explicit 404/409/401/403/400 messages via `getLastCharmSaveError()`, no blind overwrite. |
| `crm.js` | `reportCharmSaveFailure` + `getLastCharmSaveError` (toast + activity log, form stays open on failure); `mode:'update'` for inline/stock/detail edits; Order Card shipping cell between Pricing and Cost with `data-order-id`, per-row copy binding, and a bounded detail-endpoint fallback when the list projection lacks the fields. |
| `crm.html` | New `Shipping Information` column header between `Price Summary` and `COST`. |
| `crm.css` | `.order-card-shipping` card styling + `data-label="Shipping Information"` added to both mobile card-layout selector lists. |
| `crm-order-read-model.js` | `resolveCrmOrderShippingInfo` mirrored from `crm.js`; `toCrmOrderSummary` carries `shippingInfo`; the overview projection strips it (no addresses in the compact overview). |
| `server.js` | Authenticated CRM order-list projection additionally selects `recipientName, phoneNumber, addressLine, province, postalCode, shippingInfo` and normalises them; no public route reads this projection, checkout validation untouched. |
| `lumi/contracts/catalog-snapshot.js` | `active` = activity flag only; `inStock`/`available` keep the fulfillment state. |
| `lumi/scoring/eligibility.js` | Stock is no longer a blocking design reason; eligible entries carry a non-scoring `fulfillment` label (`in_stock` / `out_of_stock_now`); inactive/unknown/discontinued still excluded; no stock quantity enters the scoring layer (source-hygiene invariant kept). |
| `lumi/import/step3-import.js` | `usable()` requires activity, not stock. |
| `app.js` | `renderLumiRecommendationPreview` reports an incomplete ring presentation instead of throwing, so a design the authoritative importer accepted is still shown. |

New tests: `tests/production-crm-talisman-save.test.mjs` (7), `tests/production-crm-order-card-shipping.test.mjs` (4), `tests/production-lucky-design-eligibility.test.mjs` (7), `tests/production-bugfix-batch/crm-talisman-save-and-order-shipping.spec.mjs` (browser, 2), `tests/production-bugfix-batch/lucky-zero-stock-runtime.spec.mjs` (browser runtime, 1), plus the stale-auth fix in `tests/crm-order-detail-browser-acceptance.mjs`.

## Validation / tests

| Suite | Result |
|---|---|
| Production regression (`node --test tests/*.test.mjs tests/*.test.cjs`) | **268/268 pass** |
| Security harnesses (`run-security-suites.mjs`) | **226/226 pass** (auth, CSRF, write, Supabase mode, payments, topology, legacy links, webhooks, rollback, static exposure) |
| Backend charm contract harness (`crm-charm-save-harness.mjs`, real server + real login/CSRF) | **13/13 pass** (401 anonymous, 403 without CSRF, PUT ok, 409 duplicate, 404 unknown id, inactive re-activation, zero stock keeps `isActive`, render tuning preserved) |
| CRM browser acceptance (`crm-talisman-save-and-order-shipping.spec.mjs`) | **2/2 pass** (active/hidden/duplicate/stale talisman saves + error surfacing; order-card shipping, per-order copy, section order, View Detail, mobile stacking, list-without-shipping fallback) |
| Lucky runtime acceptance zero-stock (`lucky-zero-stock-runtime.spec.mjs`) | **1/1 pass** (design produced and applied at Step 3, cl01 present, no Pyrite, no runtime error) |
| Turn-3 regression (`undo-depth-and-geometry.spec.mjs`) | **4/4 pass** (20/20 Undo, ghost-slot geometry at 6/10/mixed) |
| Existing CRM card/detail acceptance | **pass** |
| Lucky coverage matrix, live catalog, all 3,528 combinations | **3,528/3,528 SUCCESS**, 0 Pyrite, cl01 in 896 |
| Lucky coverage matrix, every active material forced to zero stock | **3,528/3,528 SUCCESS**, 0 Pyrite, cl01 in 896 |
| Phase 12.8H reference replay (3,087 approved cases, live catalog) | 3,087 accepted, **0 not-recommended, 0 hard-rule failures**; 7 exact sequences, 2,965 different material choices |
| Phase 12.8H reference replay with stock forced on (isolates catalog drift) | 3,087 accepted, 0 rule failures, 2,999 material differences -> differences are **catalog drift** (reference fingerprint `lumi-c1-76a7dce7` vs today `lumi-c1-ec615b2d`), not the policy change |
| Root UAT `tests/lumi/**` suite run against the candidate engine (isolated temp tree) | 28 failures with the change vs 71 without; the only difference is 44 tests the policy change fixes; the remaining 28 fail identically before and after (root-only fixtures/assets) |
| `verify-release-artifact.mjs` | all checks pass except the stale "this turn changed only the landing client files" scope assertion, which encodes the previous batch's change set |

Evidence: `evidence/lucky-coverage-production-full-3528*.json`, `evidence/lucky-coverage-production-zero-stock-all*.json`, `evidence/lucky-reference-compare-*.json`, `evidence/crm-charm-save-harness.json`, `evidence/security-suites-verification.json`.

## Artifacts and deployment

| Item | Value |
|---|---|
| Vercel artifact | 291 files, 106,126,894 bytes, fingerprint `66b42b5ebc561c40cec84d39f44236897fc9344ccd33829f81d09d74973a1e03` |
| Render artifact | 11 files, 295,748 bytes, fingerprint `c0e192133de7bd3dcc0ac067dddc94958d7235227b74bef4b2a53eb81029feaa`; `server.js` sha256 `d427b295abb74fd1...`, `crm-order-read-model.js` sha256 `7619e98be58f10e9...` |
| Deployment performed | `dpl_3FJJ5LkvPAVKbX8HC1dVWohQqE2r` (production, Ready, both custom domains) |
| Live verification | 9/9 changed files byte-identical to the artifact on `customize.luckycolorstone.com`; `live-verify-turn3.mjs` all checks pass (Undo label, Lucky design, ghost-slot geometry, social-proof formula, four previews, no PII) |
| Render owner action | **Manual Deploy -> Deploy a specific commit -> branch `release/uat-feature-migration-20261010` -> `606da9aff796a60aa6c6749cfaff3be8e5f616ec`** (never "Deploy latest"). Until then the order cards complete their shipping block through the detail-endpoint fallback. |

## Data / catalog / API impact

No catalog row, order, customer record, schema, RLS policy, GRANT or environment variable was modified. `cl01` was already 1,000 units and was not written. `public.admin_order_numbers` was not touched. No Stripe/LINE payment or webhook action. The only API change is additive fields inside the already admin-authenticated CRM order-list response.

## Catalog-only impact check

app bootstrap changed? **YES** (Lucky preview presentation fix in `app.js`) - required by TASK C and covered by the 3,528-case matrix plus the runtime acceptance. landing changed? NO. Step 1? NO. Step 2? NO. unrelated Step 3? NO (Lucky preview / design eligibility only). Step 4? NO. deployment configuration changed? NO. alias/domain target changed? NO (the production alias moved to a new deployment of the same project, which is the normal release path).

## Risks / outstanding items

* The Render backend commit is not deployed yet (owner-operated). The CRM order cards fall back to the detail endpoint, so the feature works, but the fallback costs one admin request per card missing the fields until Render ships `606da9a`.
* An accidental stray Vercel project named `vercel` was created when the repackaged artifact lost its `.vercel` link (`dpl_So4JvPWNz7U2ofVMEuAU4ifRXg7L`). It is not aliased to any Lucky domain and can be deleted in the Vercel dashboard.
* Reference-gallery sequences differ from today's output because the catalog changed after 2026-09-28; the restock comparison attributes the difference to that drift.

## Production changes performed / production data modified

Frontend: one production deployment (`dpl_3FJJ5LkvPAVKbX8HC1dVWohQqE2r`). Backend: one commit pushed to the release branch (no Render deploy by this workspace). Production data: **none**.
