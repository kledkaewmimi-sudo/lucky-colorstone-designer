# Lucky Colorstone — Production bugfix batch (6 issues)

**Report:** `reports/production/production-bugfix-batch-20261011/production-bugfix-batch-20261011-1024.md`
**Date / time:** 2026-10-11, 08:05–10:30 Asia/Bangkok (GMT+7)
**Target:** Production — customer app `https://customize.luckycolorstone.com`, CRM `https://crm.luckycolorstone.com`
**Source of truth used:** the release candidate the deployed Production frontend is built from,
`reports/production/full-uat-feature-migration-20261009/reconciled-candidate/` (verified before the
change: its `app.js` SHA-256 was byte-identical to the live `https://customize.luckycolorstone.com/app.js`
of 448,780 bytes).

---

## 1. Task / goal

Fix six confirmed Production issues in one batch, verify them before and after deployment, and deploy
the frontend safely:

1. Landing social-proof bracelet preview images missing (with an explicit privacy gate).
2. Lucky design containing a talisman/charm renders the bracelet as "undefined" on page 3.
3. Missing replacement-confirmation dialog when a second Lucky design replaces the current bracelet.
4. Page 3 stone images still have backgrounds (must be transparent cut-outs, same filenames/paths/format).
5. Lucky acceptance must not auto-navigate from Step 3 to Step 4.
6. Add a fully working Undo button to the Step 3 bracelet editor (bottom-left, mirroring Reset).

## 2. Scope

In scope: the customer frontend (`app.js`, `index.html`, `index.css`, `lumi/**`), the stone catalog
image assets used by the designer and the Lucky result page, the release artifact, and the Production
frontend deployment. Out of scope and untouched: pricing, stock, checkout, Stripe, LINE/LIFF
configuration, Supabase schema/data, CRM behaviour, security hardening, and the UAT branch/repo files.

**Explicit note:** the task referenced a "supplied video". No video file was provided in this workspace
or attached to the request, so every issue was reproduced from the live Production domain and from the
Production source tree instead. Issue 2 could not be reproduced (see section 5.3) and is reported as an
unverified item rather than guessed at.

## 3. What was inspected

- `reconciled-candidate/`: `app.js`, `index.html`, `index.css`, `data/*.json`, `guest-design-state.js`,
  `lumi/ui/lumi-ui.js`, `lumi/integration/index.js`, `lumi/import/step3-import.js`,
  `lumi/contracts/catalog-snapshot.js`, `lumi/composition/step3-charm-constraints.js`,
  `lumi/knowledge/*`, `lumi/recommendation/*`, `lumi/onboarding/*`, `vercel.json`, `.vercelignore`.
- Release tooling: `tools/package-uat-migration-release.mjs`,
  `release/{manifest.json,release-record.json}`, `security-hotfix/release/tools/lib/artifact.mjs`.
- `reports/production/full-uat-feature-migration-20261009/**` (release records, privacy-fix report),
  `reports/production/security-hotfix/**` (production target manifest, post-release verification).
- Live Production (read-only): `customize.luckycolorstone.com`, `/api/social-proof`, `/api/charms`,
  `/api/stones`, the packaged artifact bytes, and a Playwright walk-through of Landing -> Step 1 ->
  Step 2 -> Step 3 -> Lucky pages 1-3 -> apply -> Step 4 boundary.

## 4. Current state before the change (all VERIFIED)

| Surface | Value |
|---|---|
| Live Production frontend | `dpl_2rx9xPftnpxvKVRxjuJ1gTpLzK7e` (`...-ct4c9tswe-...`), Production, aliases `customize.` + `crm.` |
| Live `app.js` | SHA-256 `A34F4B47AD913486...`, 448,780 bytes — identical to the candidate |
| Live `/api/social-proof` | 200 `{"displayCount":1329,"successfulOrderCount":98}` (count-only, privacy-safe) |
| Landing social-proof strip | label + count (1,329) + divider + heart, 0 thumbnail slots, 0 images |
| Render backend | unchanged by this batch (`lucky-colorstone-designer.onrender.com`) |
| Deployment tooling | Vercel CLI authenticated as `kledkaewmimi-sudo`, scope `lucky-colorstone` |

## 5. Findings per issue (before the change)

### 5.1 Issue 5 — auto-navigation to Step 4 (CONFIRMED, reproduced live)

`app.js` -> `getLumiUiController().onAccepted` ended with `if (action !== 'use') return true; ... return goToStep(4);`
so accepting a Lucky design with the "use" action pushed the customer from Step 3 straight to Step 4.
Reproduced on the live domain in every tested design (8 combinations plus repeats): after `ใช้แบบนี้ต่อ` the
page switched to `#stepView4.active` and the Step 3 canvas was no longer active.

### 5.2 Issue 3 — replacement confirmation missing on the second Lucky design (CONFIRMED, reproduced live)

`lumi/ui/lumi-ui.js` uses a one-shot `committing` latch to prevent a double commit. It was set to `true`
on a successful acceptance and never cleared: `close()` did not reset it and `open()` reset only
`acceptanceInProgress`. Because `app.js` caches a single `lumiUiController` for the session, every later
Lucky session hit `prepare()`'s first guard, so `prepare('use')` returned immediately — no
`CONFIRM_REPLACE`, no dialog, no replacement.

Live reproduction (read-only, same session): first Lucky design applied -> back to Step 3 -> second Lucky
design -> `ใช้แบบนี้ต่อ` -> `replaceCardVisible: false`, the shell stayed on the result page and the bracelet
was unchanged (24 stones / `tg01` / ฿1,058 before and after).

The first replacement (manual bracelet -> Lucky design) did show the dialog, which matches the issue title
("when replacing old Lucky-generated bracelet with a new one").

### 5.3 Issue 2 — "bracelet = undefined" with a talisman on page 3 (NOT REPRODUCED)

Exhaustive attempts, all read-only, on the live Production domain and on the Production source tree:

- 8-combination matrix on the real engine (bead 4/6/10/mixed x charm/stone x love/money/career/protection/luck):
  every charm design produced a complete Lucky result page and a complete Step 3 bracelet (210-314 SVG
  nodes), 0 `undefined` occurrences in the whole DOM, 0 broken images, 0 console errors.
- All five charm-eligible goals x all 7 weekdays: the engine only ever anchors `tg01` (Takrud Lakshmi) or
  `px01` (Pi Xiu); both images exist and load in Production.
- `with_charm + luck` returns `INVALID_INPUT / LUMI_COMPOSITION_NO_CHARM` (the luck charm `cl01` is out of
  stock in the Production catalog) — this shows the "no recommendation" card, not a broken bracelet.
- With a pre-existing manual bracelet, with the charm tab / spacer tab open, with the talisman removed,
  and after a second Lucky design: no `undefined` text, attribute, `NaN` radius or empty preview anywhere.
- Static analysis: `app.js` contains no string that can emit the literal `undefined`; the Lucky preview
  validates presentation completeness (`LUMI_PREVIEW_INCOMPLETE_PRESENTATION`) and falls back to the error card.

Conclusion: not reproducible on the current Production build (2026-10-11). One genuine contract risk in
that path is recorded in section 13 instead of being "fixed" blind.

### 5.4 Issue 4 — stone images with backgrounds (CONFIRMED, visible live)

The stone catalog images referenced by `data/stones.json` are opaque product photos
(`sharp.metadata().hasAlpha === false` for 35 of 38), so both the Lucky result page material cards and the
Step 3 beads showed white/grey boxes. Live screenshot before the fix:
`evidence/live-lucky-page3-charm-love.png`. The three stones that already shipped with alpha
(`golden_rutile.webp`, `rose_quartz.webp`, `malachite.webp`) were left untouched.

### 5.5 Issue 6 — no Undo (CONFIRMED, feature absent)

Step 3 had a single `.canvas-reset-control` (bottom-right) and no history mechanism anywhere in the editor.

### 5.6 Issue 1 — landing social proof images (BLOCKED by the privacy gate)

The strip is intentionally count-only: the 2026-10-10 privacy remediation removed the four customer
thumbnail slots because the endpoint would otherwise have published up to four real customer bracelet
previews. Live check today: `thumbSlots: 0`, `imagesInStrip: 0`, and the public endpoint returns only
`displayCount` + `successfulOrderCount` (`/api/social-proof` is now live — the count hydrates to 1,329).
No consent mechanism, curated showcase list or owner consent record exists in the repository, so the
publication gate in the brief is not satisfied and the count-only protection was deliberately kept.

## 6. Root cause per issue

| Issue | Root cause | Fix layer |
|---|---|---|
| 1 | Customer order previews cannot be published without verified consent; count-only is the intended privacy-safe state | none (blocked) |
| 2 | not reproducible | none (reported) |
| 3 | `committing` one-shot latch in `lumi/ui/lumi-ui.js` never reset between Lucky sessions | UI state machine |
| 4 | Opaque catalog photos served with no alpha channel | asset pipeline |
| 5 | `onAccepted` called `goToStep(4)` for the `use` action | app integration seam |
| 6 | No history model and no control | editor state + UI |

## 7. Files changed

Source (Production candidate = what the deployed artifact is built from):

| Path | Change |
|---|---|
| `reconciled-candidate/app.js` | Step 3 undo history module (snapshot/restore, boundaries, capture binding, button wiring, reset boundary, Lucky boundary hook); `onAccepted` no longer navigates to Step 4; DOM handle for the new control; undo baseline re-sync on automatic reconciliation |
| `reconciled-candidate/lumi/ui/lumi-ui.js` | `open()` and `close()` clear the one-shot `committing` latch |
| `reconciled-candidate/index.html` | new `#btnUndoBracelet` control (bottom-left of the bracelet preview, mirrored to Reset) |
| `reconciled-candidate/index.css` | `.canvas-undo-control` mirroring `.canvas-reset-control`, disabled state, <=360px sizing |
| `reconciled-candidate/assets/**` (35 files) | backgrounds removed in place — same filenames, same paths, same formats (`.webp` stays `.webp`, `.png` stays `.png`), same 800x800 canvas and centring |

Release / evidence (new, under `reports/production/production-bugfix-batch-20261011/`):

- `tools/`: `remove-stone-backgrounds.mjs`, `restore-stone-assets.mjs`, `verify-stone-backgrounds.mjs`,
  `verify-thai-literals.mjs`, `verify-live-artifact.mjs`, `live-bugfix-batch-verify.mjs`,
  `live-lucky-charm-probe.mjs`, `live-lucky-replace-probe.mjs`, `live-lucky-second-pass-probe.mjs`,
  `compare-deployed-vs-candidate-assets.mjs`, `compare-candidate-vs-deployed-manifest.mjs`,
  `step4-handoff-compare.mjs`, `inspect-opal-diff.mjs`
- `evidence/`: dry-run/apply report, asset QC report, live verification report, before/after manifests,
  changed-file list, and the PNG screenshots referenced from this report
- New regression specs in the candidate's ignored test tree
  (`reconciled-candidate/tests/production-bugfix-batch/`): `full-flow-gate.spec.mjs`,
  `undo-button.spec.mjs`, `lucky-acceptance-repro.spec.mjs`, `lucky-matrix-probe.spec.mjs`,
  `charm-step3-inspect.spec.mjs`, `charm-svg-dump.spec.mjs`, `step4-handoff-probe.spec.mjs`,
  `debug-open.spec.mjs`

## 8. Data / catalog / API / backend impact

- No order, catalog record, price, stock or settings change. No Supabase write. No schema change.
- No `server.js` change: the packaged Render backend fingerprint is unchanged
  (`2860033882a51b2fad6aff13b74d62c15410a330a90a26deef60223f660dd3fa`).
- The public `/api/social-proof` contract is untouched and still returns only `{displayCount, successfulOrderCount}`.
- Stone asset filenames/paths are unchanged, so catalog references, CRM images and order previews keep resolving.

## 9. Validation / tests

Production regression suite (candidate tree):
`node --test "tests/*.test.mjs" "tests/*.test.cjs"` -> **250/250 PASS, exit 0**.

Asset pipeline:

- `remove-stone-backgrounds.mjs` dry run: 38 targets, 0 missing, 0 suspicious (no centre leak, no degenerate
  coverage); apply: 35 applied, 3 skipped (already alpha) — `evidence/stone-background-removal-{dryrun,apply}.json`.
- `verify-stone-backgrounds.mjs` -> **38/38 PASS**: every file keeps its format and 800x800 size, gains
  alpha, has fully transparent frame corners, and the visible stone is preserved (PNG bit-identical; lossy
  WebP mean absolute RGB difference 1.6-3.9 of 255, i.e. a normal quality-82 re-encode).
- Visual contact sheet (`evidence/stone-cutout-contact-sheet.png`) inspected: clean edges, no halos.

UI / state behaviour (Playwright, real application + real Lucky engine, mocked `/api`):

- `full-flow-gate.spec.mjs` -> **2/2 PASS** at 390x844 and 430x790: Landing -> Step 1 -> Step 2 -> Step 3 ->
  Lucky charm design -> applied on Step 3 (`#stepView4` never becomes active), preview 25 placed beads + 1
  rendered talisman, no `undefined` in the page, the accepted design is one undoable step, the second Lucky
  design shows the confirmation card, and the normal `Next` button still runs the Step 3 -> Step 4 gate.
- `undo-button.spec.mjs` -> **3/3 PASS**: add stone -> Undo; 3 edits -> 3 consecutive Undos; Undo at empty
  history is disabled and inert; remove stone -> Undo; replace stone (retained slot) -> Undo; add spacer ->
  Undo; add charm -> Undo; cancel Lucky replacement leaves editor + history unchanged; Undo after a confirmed
  Lucky replacement restores the pre-replacement bracelet (price/beads/preview synchronised); button placement
  mirrors Reset at 390x844, 320x568 and 1366x768. Measured: mobile `undo x=29,y=351,68x44` vs
  `reset x=277,y=351,84x44`; desktop `undo 66x36` / `reset 82x36` — same row, same height, opposite corners,
  no overlap, 44px touch height on mobile.
- `lucky-acceptance-repro.spec.mjs` (the reproduction harness) -> **2/2 PASS after the fix**: charm design
  stays on Step 3; second design shows the confirmation; stone-only design unchanged.

Step 3 -> Step 4 gate (environmental finding):

- In this offline harness the explicit `Next` click stops with the app's LINE handoff message because there
  is no LINE session. `tools/step4-handoff-compare.mjs` ran the same delayed manual `Next` against the
  pre-change deployed artifact and produced the identical message, so this is a harness limitation and not a
  regression.

Thai text integrity (`verify-thai-literals.mjs`) -> **PASS**: the new Undo label is exactly
`U+0E40 U+0E25 U+0E34 U+0E01 U+0E17 U+0E33` (18 UTF-8 bytes), the aria-label adds " (Undo)", the toast is
the 10-codepoint "undo applied" string (30 bytes), and the existing Reset label is byte-unchanged.

## 10. Deployment

| Step | Result |
|---|---|
| Package | `node reports/production/full-uat-feature-migration-20261009/tools/package-uat-migration-release.mjs` -> Vercel artifact 291 files / 106,111,079 bytes / fingerprint `ce84f95b48373412506653e8003aba9880840bfb50f161f49a5dd2abf3012fa3`; Render set unchanged; `problems: none` |
| Artifact guards | `vercel.json` routes `/api/*` to `https://lucky-colorstone-designer.onrender.com/api/$1` (never UAT), hosts `customize.` + `crm.`, fixes present, `tests/` and `reports/` excluded |
| Frontend deploy | `vercel link --project lucky-colorstone-designer --scope lucky-colorstone`, then `vercel deploy --prod --yes --scope lucky-colorstone` from `release/artifact/vercel` -> **`dpl_9dLNZfWVS63UcKjCkJ99htNgKXem`**, target `production`, status `Ready`, aliased to `customize.luckycolorstone.com`, `crm.luckycolorstone.com`, `lucky-colorstone-designer.vercel.app` |
| Rollback reference | previous Production deployment `dpl_2rx9xPftnpxvKVRxjuJ1gTpLzK7e` (`...-ct4c9tswe-...`) |
| Backend (Render) | not deployed and not needed — `server.js` unchanged |

## 11. Final Production verification (custom domain, after deploy)

Artifact identity: `verify-live-artifact.mjs` -> **44/44 served files byte-identical** to the release
manifest (including all 39 files changed by this batch); `/vercel.json` returns 404, the documented Vercel
behaviour for its own build config.

`live-bugfix-batch-verify.mjs` -> **13/13 PASS** on `https://customize.luckycolorstone.com`:

| # | Check | Result |
|---|---|---|
| 1 | Landing social-proof strip renders (count + heart) | PASS — count 1,329 |
| 2 | Social-proof count loads | PASS |
| 3 | No customer preview image published (0 slots, 0 images) | PASS |
| 4 | `/api/social-proof` response privacy-safe | PASS |
| 5 | Undo control present, disabled with empty history | PASS |
| 6 | Undo restores the previous bracelet state | PASS (1 -> 0 stones) |
| 7 | Lucky charm acceptance keeps the customer on Step 3 | PASS (`step3:true, step4:false`) |
| 8 | Talisman renders in the Step 3 bracelet | PASS (25 placed beads + 1 talisman node) |
| 9 | No `undefined` anywhere after applying the design | PASS |
| 10 | Lucky result page shows talisman + stone images, all loaded | PASS |
| 11 | Second Lucky design shows the replacement confirmation | PASS |
| 12 | Cancelling the replacement keeps the current bracelet | PASS |
| 13 | Replacement still lands on Step 3 (no automatic Step 4) | PASS |

Screenshots: `evidence/live-landing-social-proof.png`, `evidence/live-page3-stones-transparent.png`,
`evidence/live-after-lucky-accept.png`, `evidence/live-replace-confirmation.png`,
`evidence/live-after-second-lucky.png`.

## 12. Verdict per issue

| Issue | Verdict | Evidence |
|---|---|---|
| 1 — social proof images | **BLOCKED / PARTIAL** | count verified live and privacy-safe (1,329); the 4 images were intentionally not published because the publication gate (verified permission for public display, or a private/curated consented showcase) is unmet and no owner consent record exists |
| 2 — Lucky charm "undefined" on page 3 | **NOT REPRODUCED** | 8-combination live matrix, weekday variants, existing-design variants, tabs and a second design all render correctly with 0 `undefined`; the owner's video/exact steps are needed |
| 3 — replacement confirmation | **PASS** | root cause fixed in the state machine; dialog, cancel and confirm verified live |
| 4 — Page 3 stone backgrounds | **PASS** | 35 assets cut out in place; 38/38 asset QC; live page 3 shows no boxes; paths/formats/filenames unchanged |
| 5 — no auto Step 4 | **PASS** | verified live and in the local gate for stone-only and talisman designs; manual `Next` still runs the normal gate |
| 6 — Undo button | **PASS** | 3/3 UI suites plus live check; placement mirrored to Reset on mobile and desktop |

## 13. Risks and residual concerns

1. **Issue 2 remains unverified.** No reproduction environment produced the symptom; the owner's video or
   exact steps/device would settle it. This is a reporting blocker, not a masked failure.
2. **Issue 1 remains blocked.** Real-order previews must not be published without verified consent. If the
   owner wants four images, the safe shape is a curated owner-provided allowlist (brand-owned renders or
   explicitly consented designs) served from a static asset list.
3. **Asset payload grew** from 101.9 MB to 106.1 MB (alpha PNG/WebP). The six PNG-referenced stones account
   for most of it; keeping their format and paths exactly as required is the deliberate trade-off.
4. **Opal provenance.** `assets/Opal.webp` in the candidate differed from the file Production actually
   served (deployed/live `da991238...` vs candidate `27cda931...`). To avoid shipping an unrelated
   un-deployed crop, the deployed image was used as the cut-out source and only its background was removed.
   The un-deployed variant is preserved at `evidence/asset-backup-before/Opal.webp`; the owner should confirm
   which crop is intended.
5. **UI wording.** The new control is labelled with the standard Thai term for Undo. If the owner prefers
   different copy, only the label needs to change.
6. **Not verified:** an authenticated CRM walk-through, a real paid checkout, and a complete Step 3 -> Step 4
   transition with a real LINE identity (only the gate message could be verified offline).
7. The local git commit is **local only** (no push), so no preview or Production deployment was triggered by git.

## 14. Recommended next action

1. Owner: confirm the Issue 1 publication decision (curated/consented showcase vs count-only).
2. Owner: provide the Issue 2 reproduction (video or exact steps/device) for a follow-up fix if it persists.
3. Owner: confirm the intended `Opal.webp` crop.

## 15. Exact blocker if blocked

- Issue 1: no owner-verified publication consent for customer bracelet previews (publication gate unmet).
- Issue 2: no reproduction available; the reported state could not be produced on the current Production
  build with the current Production catalog.

## 16. Production changes performed

- One Vercel Production deployment `dpl_9dLNZfWVS63UcKjCkJ99htNgKXem`, aliased to both custom domains.
- No Render deployment, no environment-variable change, no Stripe/LINE change, no database change, and no
  security control removed or weakened.

## 16a. Commits created

- `f3b827c2814d01f2ed24e1753638ce60fee340db` on branch `uat` (local only, **not pushed**):
  "fix(production): Lucky stays on Step 3, replacement confirmation, Step 3 undo, transparent stone assets".
  81 files, 27,736 insertions — the four changed source files, the 35 rebuilt stone assets, the regenerated
  release manifest, the new batch tooling/evidence and this report. Root-level application files and the
  owner's pre-existing working-tree changes were not touched or staged.

## 17. Production data modified

**None.** No order, catalog record, customer record, analytics row or Supabase object was created, updated or
deleted. Customer PII was never read, stored or exposed.
| 13 | Replacement still lands on Step 3 (no automatic Step 4) | PASS |

Post-deploy security boundary and CRM identity (read-only probes, status codes only):

| Probe | Result |
|---|---|
| `crm.luckycolorstone.com/` vs artifact `crm.html` | 200, byte-identical |
| `crm.luckycolorstone.com/crm.js`, `/data.js` vs artifact | 200, byte-identical (hardened CRM bundle unchanged) |
| anonymous `/api/orders` | 403 |
| anonymous `/api/crm/orders` | 401 |
| anonymous `/api/purchases` | 401 |
| `/api/settings` | 200 |
| `/server.js` | 404 |
| `/api/social-proof` | 200 (count-only) |
