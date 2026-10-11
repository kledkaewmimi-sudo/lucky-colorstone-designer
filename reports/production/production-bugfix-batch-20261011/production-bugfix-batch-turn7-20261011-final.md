# Lucky Colorstone — Turn 7 (WebKit Undo root cause, iPhone removal fix, controlled Production release)

**Report:** `reports/production/production-bugfix-batch-20261011/production-bugfix-batch-turn7-20261011-final.md`
**Date:** 2026-10-11, 17:45–20:20 Asia/Bangkok

## 1. Executive summary

The Turn 6 hold is resolved. The WebKit Undo defect was **proven by A/B to be introduced by the Turn 6 pointerup change** (pre-Turn-6 was perfect, Turn 6 lost every removal as an Undo step), the cause was identified in the Undo capture/settle mechanism, and it is fixed with the pointerup interaction retained. Both engines now show one Undo = exactly one action. The iPhone removal path no longer waits for the synthetic click, no longer scales the tapped bead, and hides it in the same task as the release. The Lucky engine policy (five excluded stones, authoritative `sizes`) is unchanged from Turn 6, re-verified, and now confirmed **on the deployed runtime**. The candidate passed every release gate and was released.

| Task | Status |
|---|---|
| A — WebKit Undo root cause + fix | **SUCCESS** (A/B proven, fixed, WebKit 10/10 + 6/6, Chromium 10/10 + 6/6) |
| B — iPhone bead-removal performance | **SUCCESS (engine-level)**; REAL_IPHONE_VERIFICATION **UNVERIFIED** (no physical device available) |
| C — Lucky engine policy preserved | **SUCCESS** (unit 5/5, offline 3,528/3,528, live runtime 28/28, 0 violations) |
| D — full regression | **SUCCESS** (273/273 unit, 226/226 security, matrix clean, preserved-feature specs 9/9 + WebKit suites) |
| E — controlled Production release | **SUCCESS** (Vercel `dpl_9PEQomhLhh1jxeGrC3vT9b4MwKdE`, 5/5 changed files byte-identical live, no Render change required) |
| F — final report | this document |

## 2. Undo root cause and A/B evidence

Variant trees were built from the exact code revisions (Turn 5 committed = the live Production bytes, hash `a51662f0…`; Turn 6 working tree = the held candidate) and driven by one identical WebKit script: 8 additions, 4 touch removals, then Undo until disabled. Expected trajectory `[5,6,7,8,7,6,5,4,3,2,1,0]` (every removal and every addition restored one at a time).

| Variant | app.js | index.css | Undo trajectory | Verdict |
|---|---|---|---|---|
| `base` (pre-Turn-6) | click-bound removal | Turn 5 CSS | `[5,6,7,8,7,6,5,4,3,2,1,0]` (12 steps) | correct |
| `cssonly` | click-bound removal | Turn 6 CSS | same as base (touch/hover CSS alone is safe) | correct |
| `t6` (Turn 6 candidate) | pointerup removal | Turn 6 CSS | `[7,6,5,4,3,2,1,0]` (8 steps) | **defect: the four removals were never recorded** |
| `fix` (this turn) | pointerup removal + Undo correction | Turn 6 CSS | `[5,6,7,8,7,6,5,4,3,2,1,0]` (12 steps) | correct |

**Root cause.** The Undo history is captured by document-level `pointerdown`/`click`/`change` listeners that remember the pre-action snapshot and push it from a 260 ms settle timer. Turn 6 moved the removal from the node's `click` handler to `pointerup`, i.e. **before** the trailing click, so:

1. the trailing `click` capture cancelled the pending settle timer that still held the *pre-removal* snapshot, and
2. the replacement snapshot was taken *after* the mutation, so it compared equal to the current state and was discarded.

Result: the removal never entered the history and one Undo jumped back several actions — the owner's "manual Undo only works once" symptom, which Turn 6's WebKit suite caught as 3/6.

**Fix (in `app.js`):**

* `bindLoopItemActivation` records the pre-removal state explicitly at activation (`pushUndoSnapshot(captureUndoSnapshot())`) and cancels any settle capture this gesture armed, so the same state cannot be pushed twice (a duplicate push had produced a no-op Undo step).
* `bindUndoHistoryCapture.schedule` no longer lets a later event of the same gesture replace a pending capture that still holds the pre-action state.
* When the settle timer fires it re-arms one capture for the current state, so an action that starts inside the settle window (rapid taps) still becomes undoable.

The history limit, the `Undo` label, the Lucky-acceptance boundary and the Reset boundary are unchanged.

## 3. iPhone bead-removal latency (Task B)

Removal is triggered by the physical release, not by the synthetic click, and the tapped node is hidden in the same task as the release:

| Engine / viewport | pointerup → ring rebuilt | pointerup → trailing click | removals per tap | hover scale |
|---|---|---|---|---|
| WebKit 390×844 (touch) | **44–45 ms** | 48 ms | **1** (analytics `item_removed` count) | none (`@media (hover: hover)` only) |
| Chromium mobile 390×844 | **~20 ms** | 28 ms | **1** | none |
| Pre-fix (Turn 5/6 behaviour) | removal only after the click, 300 ms `all` transition animated the sticky-hover `scale(1.08)` | click gated | 1 | scale applied on tap |

CSS/behaviour changes: `.bead-node` carries `touch-action: manipulation`, `-webkit-tap-highlight-color: transparent` and `user-select: none`; the hover scale and the 300 ms transition exist only under `@media (hover: hover) and (pointer: fine)`; `.bead-node.is-removing` hides the tapped node with `transition: none`; a >12 px movement cancels the activation so scrolling/pinch keep working; one activation per node per 600 ms prevents duplicate releases; the click path remains for engines without Pointer Events.

**REAL_IPHONE_VERIFICATION: UNVERIFIED** — no physical iPhone was available; WebKit automation is engine-level evidence only. The measured 44 ms ring rebuild is desktop WebKit headless and is expected to be slower on a device.

## 4. Files changed (candidate)

| Path | Change |
|---|---|
| `app.js` | Undo capture correction (explicit removal entry, no pending-capture cancellation, rapid-action re-arm); bead activation on pointer release with immediate hide, movement threshold, duplicate guard, click fallback |
| `index.css` | Touch affordances on `.bead-node`, hover/transition restricted to fine pointers, `.bead-node.is-removing` |
| `lumi/knowledge/engine-excluded-stones.js` | **new** — the five forbidden stone ids |
| `lumi/scoring/eligibility.js` | engine exclusion wired through the existing discontinued-material path |
| `lumi/import/step3-import.js` | import/acceptance gate so cached or reference designs cannot reintroduce an excluded stone |
| tests | `tests/production-bugfix-batch/undo-action-parity.spec.mjs` (new, 10 scenarios), `tests/production-bugfix-batch/ios-bead-removal-latency.spec.mjs` (hardened), `tests/production-lucky-engine-policy.test.mjs` (Turn 6, unchanged) |
| tools | `setup-undo-ab-trees.mjs` + `undo-ab.spec.mjs` (A/B harness), `live-engine-policy-probe.mjs` |

## 5. Test commands and results

| Command / suite | Result |
|---|---|
| `node --test tests/*.test.mjs tests/*.test.cjs` (candidate) | **273/273 PASS** |
| `run-security-suites.mjs` (auth, CSRF, write, Supabase mode, payments, topology, links, webhooks, rollback, static exposure) | **226/226 PASS** |
| `npx playwright test …/undo-action-parity.spec.mjs --browser=webkit` | **10/10 PASS** |
| `npx playwright test …/undo-action-parity.spec.mjs --browser=chromium` | **10/10 PASS** |
| `npx playwright test …/ios-bead-removal-latency.spec.mjs --browser=webkit` | **6/6 PASS** |
| `npx playwright test …/ios-bead-removal-latency.spec.mjs --browser=chromium` | **6/6 PASS** |
| `crm-talisman-save-and-order-shipping.spec.mjs` + `manual-undo-depth.spec.mjs` + `undo-depth-and-geometry.spec.mjs` (Chromium) | **9/9 PASS** (CRM save/order-card shipping, manual Undo depth, Lucky acceptance geometry) |
| `live-engine-policy-probe.mjs` (deployed site, real catalog) | **0 violations**, 28/28 six-goal cases recommended + accepted, clover in 28/28 |
| `live-verify-turn3.mjs` (deployed site) | **all checks pass, problems: []** (Lucky design, ghost-slot geometry, Undo label, social proof, no PII) |

## 6. WebKit / Chromium Undo parity matrix (one Undo = one action)

| Scenario | WebKit | Chromium |
|---|---|---|
| 20 consecutive additions | 20 steps, exact reverse | 20 steps, exact reverse |
| 20 consecutive removals | 20 steps, +1 bead each | 20 steps, +1 bead each |
| mixed add/remove (16 actions) | exact | exact |
| rapid taps + double tap | 6 rapid actions, +1 each | same |
| talisman insert + removal | exact | exact |
| Lucky acceptance then manual editing | exact (5 actions) | exact |
| desktop mouse | exact (9 actions) | exact |
| keyboard (Tab/Enter, Undo via Enter) | no accidental removals, one action | same |
| narrow iPhone 320×568 | exact (11 actions), no horizontal overflow | same |
| catalog scroll must not remove a bead | pass (no removals) | pass |

## 7. Lucky engine 3,528-case coverage (live Production catalog, final revision)

| Metric | Value |
|---|---|
| Combinations attempted | **3,528** (63 goal sets × 7 weekdays × 2 styles × 4 bead modes) |
| Successful recommendations | **3,528** |
| Structurally unsupported / no recommendation / validation failures | **0 / 0 / 0** |
| Forbidden stone violations (malachite, labradorite, howlite, sodalite, pyrite) | **0** |
| Unsaleable size violations (vs `payload.sizes`) | **0** |
| Pyrite violations | **0** |
| Talisman rule violations (love→Lakshmi, luck→Clover) | **0** (cl01 used in 896 cases) |
| Weekday colour violations | **0** |
| Physical-fit failures | **0** (each case also passed the Step-3 acceptance validator) |
| By style | stones_only 1,764 / with_charm 1,764 |
| By bead mode | 4 mm 882 / 6 mm 882 / 10 mm 882 / mixed 882 |

Live runtime (deployed site, `live-engine-policy-probe.mjs`, six goals + WITH_TALISMAN × 7 weekdays × 4 bead modes): 28/28 recommended and accepted, 0 forbidden stones, 0 unsaleable sizes; the deployed catalog exposes `rutilated_quartz sizes [10]` while still carrying `p4=88, p6=88` (the price/count trap), and `golden_rutile [4,6,10]`.

## 8. UAT comparison

The 3,528 matrix reproduces the approved UAT grammar (weekday colour bans, Lakshmi/Clover rules, fit, colour distribution and diversity) with the two policy deltas: the five excluded stones are replaced by valid alternatives, and stones are never used at a size they do not sell (`rutilated_quartz` only at 10 mm).

**Phase 12.8H reference replay, re-run for this turn** (`evidence/lucky-reference-compare-phase-12.8h-turn7.json`):

| Metric | Value |
|---|---|
| Reference cases replayed (approved UAT gallery) | **3,087** |
| Cases that still produce an accepted design | **3,087 (100%)** |
| No-recommendation cases | **0** |
| Hard-rule failures (weekday colour, talisman rules, Pyrite/exclusion) | **0** |
| Exact ordered sequence identical to the reference | 13 (was 7 before the policy) |
| Same materials, different sequence | 124 |
| Different material choice | 2,950 |

The exact-sequence differences are catalog drift (reference fingerprint `lumi-c1-76a7dce7` vs today `lumi-c1-ec615b2d`) plus the intended policy substitutions; they are reported as such, not claimed as byte-identical reproduction of the released gallery.

## 9. Security and checkout regression

226/226 security harnesses pass (CRM session/CSRF, order write authorization, Supabase mode, payment authority, deployment topology, legacy order links, webhook compatibility, rollback safety, static exposure). No checkout/pricing code was touched; the server-authoritative inventory and pricing validation is unchanged; no catalog, order, schema, RLS, GRANT or environment change was made this turn; `public.admin_order_numbers` was not touched.

## 10. Release identifiers

| Item | Value |
|---|---|
| Vercel deployment | **`dpl_9PEQomhLhh1jxeGrC3vT9b4MwKdE`** (`lucky-colorstone-designer-aretz04a6`), target production, both custom domains |
| Vercel artifact | 292 files, 106,136,578 bytes, fingerprint `c37924f0a67c58b24a5747fa8db9557ace270c0495387d8535df5b129e2b6d2e` |
| Render artifact | unchanged — fingerprint `f207998a062fc8ff2c07380204ac2f5114bb0a455fab5891de6390aef5620033`, `server.js` sha256 `b48990263dcb0a18…` (currently live commit `9d35e942eac78dba6355715770d173343bf744fb`) → **no Render deployment required** |
| Git | batch commit on branch `uat`, subject «fix(production): one undo per action in WebKit, immediate iPhone bead removal, engine policy re-verified» (17 files); the SHA is reported in the hand-off message and confirmed by `git log -1` |
| Rollback target | previous production deployment `dpl_6FcvxGochjbyqHYaHip1o6oRc9or` |

## 11. Production verification

* 5/5 changed files byte-identical between the artifact and `customize.luckycolorstone.com` (`app.js`, `index.css`, `lumi/knowledge/engine-excluded-stones.js`, `lumi/scoring/eligibility.js`, `lumi/import/step3-import.js`).
* Live catalog re-checked: `cl01` is `inStock: true, isActive: true, stockQty: 1000` (the owner's reactivation from Turn 5 held), and all five excluded stones are active in the catalog — i.e. the engine exclusion is the only thing keeping them out of Lucky designs.
* `live-engine-policy-probe.mjs`: 28/28, 0 violations on the deployed bytes.
* `live-verify-turn3.mjs`: all checks pass, `problems: []`.
* No order, payment, inventory or CRM data was written.

## 12. UNVERIFIED items

* **REAL_IPHONE_VERIFICATION: UNVERIFIED** — no physical iPhone test; WebKit automation is engine-level.
* Authenticated CRM operator walk-through (talisman re-save, order-card copy in a live session) remains operator-verified only; no Production CRM credentials were requested or used.
* Live checkout with a real payment was not executed (never allowed in this scope).

## 13. Remaining risks

* A real iPhone may still show a small frame delay proportional to the ring re-render cost (measured 44 ms on desktop WebKit headless; a device is slower). The bead hide itself is synchronous with the release, so the *perceived* removal no longer waits for a render or a click.
* The Undo capture mechanism remains event-order dependent by design (settle timer + explicit removal entry); the parity suite now covers add/remove/replace/Talisman/Lucky/rapid/double/scroll/narrow/mouse/keyboard, but any future change to an interaction's event order must re-run `undo-action-parity.spec.mjs` in both engines.
* Phase 12.8H reference sequences differ from today's catalog (drift, not policy); the comparison is documented, not equalised.

## 14. Exact next action

None required for release. Recommended follow-ups: (1) one physical iPhone pass over tap-to-remove, Undo depth and the Lucky six-goal flow, reported back as PASS/FAIL; (2) if the owner wants byte-level UAT reference parity, re-freeze the 12.8H gallery against the current catalog under the new policy.
