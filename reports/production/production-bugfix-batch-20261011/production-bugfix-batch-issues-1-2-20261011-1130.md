# Lucky Colorstone — Production bugfix batch, remaining issues 1 & 2

**Report:** `reports/production/production-bugfix-batch-20261011/production-bugfix-batch-issues-1-2-20261011-1130.md`
**Date / time:** 2026-10-11, 10:30–11:40 Asia/Bangkok (GMT+7)
**Predecessor:** `reports/production/production-bugfix-batch-20261011/production-bugfix-batch-20261011-1024.md` (issues 3-6, already live)
**Targets:** customer app `https://customize.luckycolorstone.com`, CRM `https://crm.luckycolorstone.com`, backend `https://lucky-colorstone-designer.onrender.com`
**Source of truth:** `reports/production/full-uat-feature-migration-20261009/reconciled-candidate/` (verified against the live build before editing)

---

## 1. Task / goal

Complete the two remaining issues of the authorised Production bugfix batch while preserving the four
already-released fixes:

1. **Issue 1** — show the actual bracelet previews of the four newest eligible customer orders on the
   landing page, next to the customized-bracelet count, with a minimal privacy-safe public response.
2. **Issue 2** — investigate the Lucky talisman "undefined" defect using the owner's recorded video,
   reproduce it, fix the root cause, and add a regression test.

## 2. Scope

In scope: the landing social-proof endpoint (`server.js`), the landing client (`app.js`, `index.html`),
the Lucky fallback copy in `lumi/ui/lumi-ui.js`, the release artifact, the Production frontend
deployment and the Render release commit. Out of scope and untouched: pricing, stock, checkout, Stripe,
LINE/LIFF, Supabase schema/data, CRM behaviour, the four previously completed fixes, and `main`/`uat`.

## 3. What was inspected

- `server.js` social-proof block, `readPaidOrderCountAggregate`, `applyCrmPaidOrderFilter`,
  `readCrmOrderProjection`, `supabaseRequest`, `sendJson`, the static-exposure allowlist and the auth
  boundaries; `guest-design-state.js`; the order payload assembly in `app.js` (`braceletPreviewImage`,
  `createCompactBraceletPreviewDataUrl`, `renderBraceletShowcaseCard`, the hero-shot renderer and the
  unreachable receipt renderer that prints the customer name).
- `lumi/ui/lumi-ui.js` (state machine, `messageScreen`, `screen()`), the four fallback branches, the
  Phase-8.5 UI/UX interaction spec, the 2026-09-28 build that still carried the approved fallback copy,
  and every other historical `lumi-ui.js` copy in the workspace.
- The owner's recording found in `C:\Users\Aou\Downloads\813343311.756463.mp4` (112.7 s, 440x960) - no
  video was attached to the workspace, so the file was decoded locally frame by frame (no ffmpeg:
  Chromium + canvas frame extraction) and read frame by frame.
- Live Production: `/api/social-proof`, `/api/charms`, `/api/stones`, the landing strip, Steps 1-4, the
  Lucky flows and the security probes.

## 4. Findings

### 4.1 Issue 2 — root cause found and reproduced from the recording

The recording shows, on the production domain: Step 3 → Lucky CTA → page 1 with **วันจันทร์,
07 / 07 / 2003, style มีเครื่องราง** → page 2 with **all six goals** selected → the designing screen →
a card headed "น้อง Lucky" whose only call-to-action reads **`undefined`** → the customer returns to Step
3 with an empty bracelet and no design applied.

Root cause (proven): `lumi/ui/lumi-ui.js` renders the four fallback states through
`messageScreen(...)` and **passed the literal string `'undefined'` as the primary button label**:

```
if (state === LUMI_UI_STATES.NO_RECOMMENDATION) return messageScreen('น้อง Lucky','…','undefined','close');
```

The same placeholder was used for `STALE_CONTEXT`, `STALE_CATALOG` and `ERROR`. The 2026-09-28 build
still carried the approved per-state copy and actions; the placeholder replaced it during the
"น้อง Lucky" rebrand on 2026-09-30 and was never replaced with real text, so any fallback state since
then showed the literal word `undefined` as the only way forward.

Reproduced deterministically: the recording's inputs (Monday, 07-07-2003, with-charm, all six goals)
return `INVALID_INPUT / LUMI_COMPOSITION_NO_CHARM` from the engine for every wrist size and bead mode
(the luck goal's charm `cl01` is out of stock), so the flow legitimately lands on the no-recommendation
card - which is exactly the card whose button said `undefined`.

### 4.2 Issue 1 — the count-only protection is replaced by an authorised, bounded publication

The strip previously published a number only (2026-10-10 privacy remediation). The owner authorised
publication on 2026-10-11, so the endpoint now also returns the four newest eligible previews. The
publication is deliberately anonymous and bounded: at most four inline WebP thumbnails, re-encoded
server-side, with no identifiers and no order record.

## 5. Root cause / blocker summary

| Issue | Root cause | Status |
|---|---|---|
| 1 | The strip had no imagery because the 2026-10-10 revision intentionally returned a count only | fixed in code; frontend live; backend commit awaits the owner's Render deploy |
| 2 | Four fallback branches passed the literal string `'undefined'` as the CTA label | fixed and verified live |

## 6. Files changed

| Path | Change |
|---|---|
| `reconciled-candidate/server.js` | `/api/social-proof` now returns `{ displayCount, successfulOrderCount, recentBracelets }`: bounds-checked preview extraction, a bounded newest-first projection (`created_at` + the two preview columns, `limit 10`, paid filter), a change-detected in-process thumbnail cache, server-side thumbnail re-encoding (176px WebP, metadata dropped, undecodable payloads skipped), and a cacheable public response header (+152/−1) |
| `reconciled-candidate/app.js` | landing strip renders up to four published previews; the payload is treated as untrusted input (only bounded inline `data:image/` URLs are accepted, a failed image removes itself) |
| `reconciled-candidate/index.html` | the four `.sp-thumb` slots restored in the existing strip |
| `reconciled-candidate/lumi/ui/lumi-ui.js` | the four fallback states now carry their own Thai copy and action (editor return, explicit regeneration, retry + editor return) instead of `'undefined'` |
| `reports/production/full-uat-feature-migration-20261009/tools/social-proof-privacy-tests.mjs` | publication contract updated (21 assertions) |
| `reports/production/production-bugfix-batch-20261011/tools/*` | new verification tooling: video frame extraction, Thai copy checks, backend publication harness, landing-strip spec helpers, security-suite runner, artifact gate, live verification, preview inspector |
| `reconciled-candidate/tests/production-bugfix-batch/{lucky-fallback-copy.spec.mjs,lucky-copy-harness.html,landing-social-proof.spec.mjs}` | new regression tests |

## 7. Data / catalog / API / backend impact

- **API contract (public, read-only):** `GET /api/social-proof` gains `recentBracelets` (0-4 inline
  `data:image/webp` thumbnails) while `displayCount` and `successfulOrderCount` keep their exact previous
  meaning and formula (`1035 + paid x 3`). No other route, method or status code changed; the endpoint
  still rejects writes (POST → 404).
- **Query design (egress):** the count keeps its exact-count, id-only, `limit 1` request. The preview read
  is a separate bounded projection (`created_at`, `payload->>braceletPreviewImage`,
  `payload->checkoutSummary->>braceletPreviewImage`, `order=created_at.desc`, `limit 10`, paid filter)
  and only runs when the newest paid order changed or the cached set aged out (6 h fully-populated,
  15 min otherwise). A public landing view therefore hits the in-process cache (60 s) and the HTTP cache
  (300 s, `stale-while-revalidate=600`) instead of Supabase.
- **Image processing:** every stored preview is decoded and re-encoded to a 176 px WebP thumbnail; the
  re-encode drops EXIF/ICC/profile metadata, bounds each published image to a few kilobytes and rejects
  anything that is not a decodable image, not an inline `data:image/` URL, or larger than ~470 KB.
- No schema change, no catalog/price/stock change, no order write, no Supabase write, no Stripe/LINE
  change. `server.js` is the only backend file touched; the Render artifact set stays 11 files.

### 7.1 Publication and customer-permission implications (owner decision record)

- The selected imagery is the **bracelet hero render** produced by the app for the order: a synthetic
  drawing of the bracelet on a transparent canvas. It contains no face, no person, no name, no order
  number and no text at all - the only render that prints the customer's name is the receipt renderer,
  which sits after an early `return` in the same function and is unreachable dead code.
- The public response carries **no identifier** that links an image to a customer, so the published
  artifact itself is not personal data and cannot be resolved back to an individual through the API.
- The owner's authorisation is a decision of the data controller. It is **not** the same thing as each
  customer's consent, and the customer app currently has **no privacy policy page, no terms page and no
  "we may feature your design" notice** (`/privacy` and `/terms` return 404; no consent string exists in
  `index.html`, `crm.html` or `data.js`). Under Thai PDPA (and equivalent regimes for non-Thai
  customers) publishing customer-derived content should rest on a documented lawful basis and on
  transparency, ideally with an opt-out.
- Recommended follow-ups for the owner: (1) add a short notice to the order/checkout terms and a
  privacy/terms page covering "we may show your bracelet design as an anonymous example"; (2) keep the
  publication anonymous (already the case); (3) provide an opt-out path - today the selection is purely
  data-driven, so removing an order's stored `braceletPreviewImage` (or unpublishing it in the CRM)
  removes it from the strip at the next refresh; a first-class "do not publish" flag would be a small
  follow-up if the owner wants one-click exclusion.
- Reproducible review tool: `tools/inspect-live-social-proof-previews.mjs` fetches the published set and
  writes each image to PNG for inspection (also reports size, alpha, cache header and forbidden tokens).

## 8. Frontend impact

- The strip keeps its layout, wording and count; the four slots now show the published previews and fall
  back to the designed pastel circles when the endpoint has none (the state until the backend commit is
  deployed). No other page, step or flow changed.

## 9. Validation / tests

| Suite | Result |
|---|---|
| Production regression (`node --test tests/*.test.mjs tests/*.test.cjs`, candidate) | **250/250 pass** |
| Security harnesses against the modified candidate (`LCS_BASELINE_DIR`) | **226/226 pass** (security 26, write security 43, supabase mode 8, payment 21, predeploy topology 28, legacy order link 8, webhook compat 8, rollback safety 6, static exposure 78) |
| Public-endpoint privacy/publication harness | **21/21 pass** (id-only count projection, bounded newest-first preview projection, paid filter, no PII/order/base64 leak, undecodable payloads never published, 60 s cache, no write surface) |
| New backend publication harness (`verify-social-proof-backend.mjs`, synthetic orders) | **9/9 pass** - exactly four previews, newest-first proven by decoding the thumbnails' pixels, paid-only, orders without a preview skipped, corrupt/remote/oversized payloads skipped, 176x176 WebP, no order id or customer field anywhere, cache header present, repeat request identical |
| Landing strip UI (`landing-social-proof.spec.mjs`) | **5/5 pass** at 390x844, 320x568 and 1366x768; count preserved; untrusted payload entries ignored; count-only payload degrades to the empty fallback slots with no console error |
| Lucky fallback copy + video scenario (`lucky-fallback-copy.spec.mjs`) | **5/5 pass** - four states show their own copy, no `undefined`, retry regenerates, close returns to the editor; the recorded flow reproduces the no-recommendation card with real copy |
| Preserved fixes (full-flow gate, undo suite, Lucky acceptance repro) | **7/7 pass** (2 + 3 + 2) |
| Lucky exclusivity (`verify-lucky-exclusivity.mjs`) | **pass** - 216 recommendation runs across 3 weekdays x 2 styles x 9 goal sets x 4 bead modes: **0 pyrite**, 0 inactive components |
| Release artifact gate (`verify-release-artifact.mjs`) | **9/9 pass** - production routing, both host rules, four slots, client renderer, undo/no-auto-Step-4/copy fix present, only the three expected frontend files changed, 35 cut-out assets preserved, packaged Render artifact matches the candidate |
| Live artifact identity | **44/44 served files byte-identical** to the release manifest |

## 10. Deployment

| Item | Value |
|---|---|
| Frontend artifact | 291 files, 106,114,147 bytes, fingerprint `8efa9edfd1e74c5330c90a2f56dcaa5818e8e14bf3cd1508ba2e772f54030c03` |
| Frontend deployment | **`dpl_6pZ1wqiM4JQokku1YwrqQJCmaE4B`** (`https://lucky-colorstone-designer-5jzn3np9f-lucky-colorstone.vercel.app`), target `production`, READY, aliased to `customize.luckycolorstone.com` and `crm.luckycolorstone.com`, created 2026-10-11 11:10 +07 |
| Frontend rollback reference | `dpl_9dLNZfWVS63UcKjCkJ99htNgKXem` (previous batch) |
| Render artifact | 11 files, fingerprint `219f766b372940c8ea06ea6ab35600e58ea9f7b910cf87486acae655e09ef609`; `server.js` sha256 `44e5e6e843d437b517f29df1c7c08acf1356a0a4761dd05df79bffa125e54071` |
| Render release commit | **`fe282deaeebb644ccf1bd3fc5e8de70cdce7b44f`** on branch `release/uat-feature-migration-20261010` (pushed; fast-forward `dde5b5c..fe282de`), parent `dde5b5c99c364446e0f8b141e0113797ac3b2945` = the deployed backend; the commit changes `server.js` only (+152/-1) and its blob is byte-identical to the verified candidate |
| Render deploy | **NOT deployed by this workspace** (Render is owner-operated, no credential here). The commit is ready; see section 12 for the exact owner action. |
| `main` / `uat` | unchanged (`c777c95b…`, `0d02b601…`) |

## 11. Final Production verification

`live-issue1-2-verify.mjs` against `https://customize.luckycolorstone.com` → **23/23 pass**:

| Check | Result |
|---|---|
| Landing strip renders with the count and four positions | pass (count 1,329) |
| Strip count matches the public aggregate | pass (1,329 = endpoint `displayCount`) |
| No customer/order data in the strip text | pass |
| Public response exposes only the count and previews | pass (`displayCount, successfulOrderCount` - the preview field arrives with the backend commit) |
| Fallback while the backend commit awaits deployment | pass (four slots, count intact, no error) |
| Recorded flow selects all six goals, with charm, Monday 07-07-2003 | pass |
| **The no-recommendation card shows real copy, never `undefined`** | pass |
| The card offers a working way back to the editor | pass (`กลับไปออกแบบเอง`) |
| Closing the card returns to Step 3 unchanged | pass |
| Undo still restores the previous bracelet state | pass (0 → 1 → 0) |
| Accepting a Lucky design still keeps the customer on Step 3 | pass (25 placed beads, 1 talisman) |
| Talisman still renders in the Step 3 bracelet | pass |
| No `undefined` anywhere after applying a design | pass |
| Lucky result page still shows its material images | pass (talisman + three stones, all loaded) |
| Replacement confirmation still appears on the second Lucky design | pass (`ต้องการใช้แบบใหม่แทนที่เส้นเดิม`) |
| Cancelling the replacement keeps the current bracelet | pass |
| Replacement still lands on Step 3 | pass |
| Stone assets still served as transparent cut-outs | pass (`webp`, alpha, 800x800) |
| Page/console errors during the whole pass | none |

Post-deploy identity and security boundary (read-only probes): live artifact 44/44 byte-identical,
CRM root/`crm.js`/`data.js` byte-identical to the artifact, anonymous `/api/orders` 403,
anonymous `/api/crm/orders` 401, anonymous `/api/purchases` 401, `/api/settings` 200,
`/server.js` 404, `/server.ps1` 404, source archive 404.

## 12. Verdict

| Issue | Verdict | Detail |
|---|---|---|
| 1 — four real customer previews | **PARTIAL (frontend PASS, backend pending one owner action)** | endpoint implemented, verified offline (9/9 + 21/21 privacy) and packaged in the pushed Render commit `fe282dea…`; the landing strip is live, keeps the count and shows the fallback slots until that commit is deployed. Owner action (single step): Render → service `lucky-colorstone-designer` → **Manual Deploy → Deploy a specific commit → branch `release/uat-feature-migration-20261010` → commit `fe282deaeebb644ccf1bd3fc5e8de70cdce7b44f`** (never "Deploy latest", never `main`). Then `/api/social-proof` returns four previews and the strip fills automatically. |
| 2 — Lucky talisman "undefined" | **PASS** | root cause proven from the recording and fixed; regression tests added (5/5 including the exact recorded flow); verified live - the recorded configuration now shows real Thai copy and no `undefined` |
| 3 — replacement confirmation (previous batch) | **PASS (preserved)** | verified live again |
| 4 — transparent Page 3 stones (previous batch) | **PASS (preserved)** | 35 cut-out assets unchanged; live `Opal.webp` still `webp` with alpha |
| 5 — no automatic Step 4 (previous batch) | **PASS (preserved)** | verified live for charm and stone-only designs |
| 6 — Step 3 Undo (previous batch) | **PASS (preserved)** | verified live |

## 13. Risks and residual concerns

1. **Backend not deployed yet.** Until the owner runs the Render step above, the landing strip shows the
   designed empty fallback circles (no images) and the published API carries no previews. Nothing is
   broken, and the images appear with no further frontend change once the commit is live.
2. **Publication consent is a business decision, not documented customer consent.** See section 7.1;
   adding a terms/privacy notice and an opt-out is recommended and is not implemented by this batch.
3. **Vercel may normalise the public cache header.** The live response currently reports
   `public, max-age=0, must-revalidate`; the endpoint's own `max-age=300, s-maxage=300,
   stale-while-revalidate=600` takes effect after the Render deploy. Even if the edge revalidates, the
   in-process cache still bounds Supabase reads to one bounded projection per change.
4. **Visual PII review of the real thumbnails is still pending** and can only happen once the backend is
   live; run `tools/inspect-live-social-proof-previews.mjs`, which writes the four published images to
   `evidence/live-previews/` for review. Code inspection shows the only name-bearing render is
   unreachable dead code, and the re-encode strips all metadata.
5. **The charm engine still cannot serve the "all six goals + charm" combination** (no in-stock charm for
   the luck goal), so that configuration legitimately lands on the no-recommendation card. The card is
   now usable, but the owner may want the engine to fall back to a stone-only design instead; that is a
   product decision, not part of this batch.
6. The 250-test regression, 226 security assertions and the live passes were executed; an authenticated
   CRM operator walk-through and a real paid checkout remain outside this batch (unchanged).

## 14. Recommended next action

1. Owner: run the single Render deploy for `fe282dea…` (section 12), then confirm `/api/social-proof`
   returns `recentBracelets` with four entries.
2. Owner: run `node reports/production/production-bugfix-batch-20261011/tools/inspect-live-social-proof-previews.mjs`
   and review the four PNGs (or ask me to) as the final publication check.
3. Owner: decide on the terms/privacy notice and opt-out for published designs (section 7.1).

## 15. Exact blocker if blocked

Render deployment of `fe282deaeebb644ccf1bd3fc5e8de70cdce7b44f` requires the owner's Render dashboard (no
Render API credential or CLI exists in this workspace). This is a platform capability limit, not a
technical failure.

## 16. Production changes performed

- One Vercel Production deployment `dpl_6pZ1wqiM4JQokku1YwrqQJCmaE4B` (both custom domains aliased).
- One fast-forward push to `release/uat-feature-migration-20261010` carrying the single-file backend
  release commit `fe282deaeebb644ccf1bd3fc5e8de70cdce7b44f`; **no** Render deployment, no environment
  change, no database change, no Stripe/LINE change, no security control weakened, and `main`/`uat`
  untouched.
- No customer order, catalog record or Supabase object was created, modified or deleted, and no payment
  was executed.

## 17. Production data modified

**None.** All tests ran against synthetic fixtures or read-only live probes; no order or customer record
was touched.
