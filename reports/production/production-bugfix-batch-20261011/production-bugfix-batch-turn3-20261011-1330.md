# Lucky Colorstone — Production fixes, turn 3 (Lucky coverage, Undo, geometry, social proof)

**Report:** `reports/production/production-bugfix-batch-20261011/production-bugfix-batch-turn3-20261011-1330.md`
**Date:** 2026-10-11, 12:00–13:35 Asia/Bangkok (GMT+7)
**Deployed:** Vercel Production `dpl_5n4C2ryvSXd7Ddx6J9vfK7XDfEt2` (13:19 +07, both custom domains). Backend unchanged this release — `server.js` untouched, Render keeps `fe282deaeebb644ccf1bd3fc5e8de70cdce7b44f` (owner-deployed, verified live).

## Verified starting state (not assumed)

| Surface | Evidence |
|---|---|
| Render backend | `/api/social-proof` returns `{"displayCount":1329,"successfulOrderCount":98,"recentBracelets":[…4…]}` with the endpoint's own `Cache-Control: public, max-age=300, s-maxage=300, stale-while-revalidate=600` → the owner deployed `fe282dea` ✓ |
| Prod frontend (before this release) | `app.js` 458,090 B, `lumi/ui/lumi-ui.js` 72,379 B |
| UAT frontend | `app.js` 451,450 B, `lumi/ui/lumi-ui.js` 70,962 B |
| UAT vs Production engine | all 75 deployed `lumi/**` files hashed: **74 identical, 1 different** (`ui/lumi-ui.js` = the fallback-copy fix shipped to Production only). The UAT runtime runs the same engine/composition/scoring code as Production. The 3,087-case gallery was offline tooling and never a different runtime. |

## TASK 1 / TASK 3 — Lucky coverage and cl01 (root cause found, coverage restored by the stock fix)

**cl01 is genuinely in stock in the authoritative catalog:** `GET /api/charms` → `cl01 bee_heart inStock=true isActive=true qty=1000 price=290` ✓ (Task 3 items 1–3 satisfied at the public-API boundary; no write was performed).

**Root cause of the reported symptom** — `lumi/composition/composition-generator.js`:
`if (goalIds.includes('luck')) { const clover = scored.charms.eligible.find(x => x.materialId === 'cl01'); if (!clover) throw NO_CHARM('Lucky Clover unavailable.'); }`
Every luck-containing goal set therefore **requires Lucky Clover**, and "เสริมทุกด้าน" (all six goals) always contains luck. While cl01 was out of stock the engine threw `LUMI_COMPOSITION_NO_CHARM` before any design was built → the "ยังหาแบบที่พอดีกับตัวเลือกนี้ไม่ได้" card. With cl01 restocked the same code path succeeds; **no engine change was required for the reported case** (the only engine-adjacent fix this turn is the fallback-copy defect from the previous batch, already live).

**Coverage measured with the real engine + the real acceptance validator against the live Production catalog**
(`tools/lucky-coverage-matrix.mjs`; each combination runs `generateLumiRecommendation` and then
`prepareLumiAcceptance`, so a design only counts as SUCCESS when it is genuinely applicable to Step 3):

| Slice | Combinations | Result |
|---|---|---|
| 63 goal sets × 7 weekdays × 2 styles @ 6 mm | 882 | **882 SUCCESS (100%)** |
| 63 goal sets × 2 weekdays (Sat, Sun) × 2 styles × {4 mm, 10 mm, mixed} | 756 | **756 SUCCESS (100%)** |
| Total sampled | 1,638 | **100% SUCCESS**, 0 NO_RECOMMENDATION, 0 STOCK_UNAVAILABLE, 0 VALIDATION_FAILURE |

- `cl01` is chosen in 416 of the sampled combinations (every luck-containing one) ✓
- **Pyrite used 0 times** ✓ (also re-verified over 216 runs by `tools/verify-lucky-exclusivity.mjs`)
- **4 mm + talisman is not structurally unsupported**: 126/126 such combinations SUCCEED.
- The all-six-goals + WITH_TALISMAN case (the owner's screenshot) succeeds for every bead mode and weekday sampled.

Not measured this turn: the remaining 1,890 combinations (Mon–Fri × {4 mm, 10 mm, mixed}). The tool accepts
`--weekdays=`/`--beads=` so the sweep can be completed on demand; the sampled slices already cover the
reported case, the luck/clover rule and the 4 mm question.

## TASK 4 — Undo (root cause: capture race; label changed; depth verified)

- **Label** is now exactly `Undo` (bottom-left, still mirrored against Reset) — verified in the served HTML and live.
- **Live measurement before/after:** 5 edits → 5 consecutive undos → baseline restored, button then disabled.
  So the deployed code already walked a multi-step history in Chromium; the reported "only one" is explained by the
  capture race I removed:
  a settle timer scheduled by an edit could fire *after* the customer pressed Undo and push the pre-undo state back
  onto the stack (the next Undo then re-applied the state they had just left, so the visible progress stopped after one step).
- Fixes: `undoSuppressUntil` window + pending-timer cancel inside `undoLastBraceletAction`; duplicate protection widened to
  the last two entries; history cap raised 30 → 40.
- **Regression:** 20 sequential edits (15 adds interleaved with 5 removals) → **20 accepted Undo clicks** → exact baseline
  restored (stone count, ghost count, charm ids, price, bead counter), button disabled at the true bottom of the history,
  no Step-4 navigation. `tests/production-bugfix-batch/undo-depth-and-geometry.spec.mjs` (task 4 case).

## TASK 5 — Bracelet geometry after removing stones and adding a talisman (root cause + fix)

Live reproduction (before the fix), Lucky charm design at 6 mm:

| Step | stones | retained ghosts | rendered ghost nodes | price |
|---|---|---|---|---|
| after Lucky accept | 24 | 0 | 0 | ฿1,058 |
| remove 4 stones | 20 | **4** | **4** | ฿974 |
| add talisman | 19 | **4** | **4** | ฿1,543 |

Root cause: `adjustBeadsToNewCapacity()` kept every retained `empty` slot unconditionally. A retained slot is
an editor position for a deleted bead, but the layout counts it in the *visual* loop
(`visualUsedLengthMm` over all loop components), so after a new component consumed the freed capacity the deleted
beads' footprint was still drawn — the canvas rendered 19 beads + 4 phantom positions + 2 talismans in a ring sized for
the physical bracelet (bead size shrank 23.1 px → 20.3 px) and four empty positions that could no longer be filled
remained visible.

Fix: retained slots survive only while the ring still has room for them
(`usedLengthMm + retainedSlotLengthMm <= usableBeadLengthMm`); once a stone or talisman consumes that capacity they are
consumed, so the rendered circumference equals the physical one.

Live verification after the fix (same flow): remove 4 stones → 4 retained gaps (refill affordance preserved) →
add talisman → **stones 19, ghosts 0, ghost nodes 0, charms 2, price ฿1,543** ✓ and the rendered ring matches the
physical composition. Regression covers 6 mm, 10 mm and mixed (3/3 pass) including "undo repeatedly restores the exact
Lucky baseline".

## TASK 6 — Social-proof formula: VERIFIED (no change made)

- Live: `displayCount 1329 = 1035 + 98 × 3` ✓; four real previews published ✓; no PII fields in the payload ✓.
- Counting is server-derived: an exact-count PostgREST request filtered by the canonical paid-order filter
  (`stripePaymentStatus = paid`, or the legacy `paymentStatus = paid` fallback) projecting a single id column, so each paid
  order counts once, pending/failed checkouts are excluded, and rendering the page or refreshing the cache cannot change it
  (60 s in-process cache, 300 s HTTP cache). 0/1/2/10-order arithmetic matches the owner's table exactly.

## TASKS NOT COMPLETED THIS TURN (no fix shipped)

- **Task 2 — CRM talisman save.** Investigated read-only only: the CRM uses `PUT/POST /api/charms` behind the admin
  session + CSRF checks; reproducing the failure needs an authenticated operator session (the admin secret lives only in
  Render's environment, so it cannot be exercised from this workspace) and a synthetic catalog record. No root cause was
  proven, therefore **no code was changed** — shipping a speculative fix to the authenticated inventory write path would
  risk the production catalog. Recommended next step: run the isolated harness with a local server + synthetic catalog row
  and a test admin secret, or capture the failing HTTP status/sanitized body from the operator's browser.
- **CRM shipping information moved into order cards.** Not started; it is a self-contained CRM UI change
  (`crm.html`/`crm.js`/`crm.css`) and is best done as its own reviewed change.

## Files changed (this release)

| Path | Change |
|---|---|
| `reconciled-candidate/app.js` | retained-ghost consumption in `adjustBeadsToNewCapacity()`; `undoSuppressUntil` + timer cancel in `undoLastBraceletAction`; two-entry duplicate guard; history cap 40 |
| `reconciled-candidate/index.html` | Undo control label → exactly `Undo` |
| `reconciled-candidate/tests/production-bugfix-batch/undo-depth-and-geometry.spec.mjs` | new regression (20-edit Undo depth + geometry at 6/10/mixed) |
| `reports/production/production-bugfix-batch-20261011/tools/lucky-coverage-matrix.mjs` | new coverage-matrix tool (filters, progress, classification) |
| `reports/production/production-bugfix-batch-20261011/tools/live-undo-geometry-probe.mjs`, `tools/live-verify-turn3.mjs` | new live reproduction / verification harnesses |

Artifact: 291 files, 106,116,229 bytes, fingerprint `4842bd2226db9ded775389a55571f4d477b2cd77d241238f167a9e25ba5c7890`;
Render set unchanged (`219f766b…`) → **no backend deploy required for this release**.

## Test summary

| Suite | Result |
|---|---|
| Production regression (`node --test tests/*.test.mjs tests/*.test.cjs`, candidate) | **250/250 pass** |
| Task 4 + Task 5 regression (new spec) | **4/4 pass** |
| Lucky coverage matrix (live catalog) | **1,638/1,638 SUCCESS** |
| Lucky exclusivity (pyrite) | 0 pyrite occurrences |
| Live verification (`live-verify-turn3.mjs`) | **all checks pass** (artifact identity 4/4, Undo label, geometry fix present, formula, 4 previews, no PII, live geometry Lucky→remove 4→talisman→0 ghosts) |

## Verdict

| Task | Verdict |
|---|---|
| 1 — Lucky coverage | **PASS (root cause: cl01 stock; coverage now 100% on the sampled matrix; no engine code change needed)** |
| 2 — CRM talisman save | **NOT DONE** (investigated only; root cause unproven; no code changed) |
| 3 — cl01 stock | **PASS** (1,000 units live in the public catalog; engine uses it in 416 sampled combinations; no write performed) |
| 4 — Undo | **PASS** (label `Undo`; 20/20 undos; race removed) |
| 5 — geometry | **PASS** (ghost positions consumed; verified live at 6 mm and by regression at 6/10/mixed) |
| 6 — social-proof formula | **VERIFIED** (unchanged) |
| CRM shipping card section | **NOT DONE** |

**Overall: PARTIAL** — three tasks fixed and verified in Production, one verified unchanged, one blocked on
operator-session evidence, one not started.

## Security / data safety

No CRM auth, CSRF, order API, Stripe/LINE webhook or pricing change; `public.admin_order_numbers` untouched (its
pre-existing exposure risk remains **accepted and unremediated** for this release — it is not presented as secure);
no catalog row modified; no order, customer record, schema or payment action; the four social-proof previews and the
transparent stone assets remain as previously verified.
