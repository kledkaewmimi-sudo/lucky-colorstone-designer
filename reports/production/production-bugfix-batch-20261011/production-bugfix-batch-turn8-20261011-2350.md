# Lucky Colorstone — Turn 8 (iPhone performance, CTA flow, Step 3 CTA area, onboarding, labels)

**Report:** `reports/production/production-bugfix-batch-20261011/production-bugfix-batch-turn8-20261011-2350.md`
**Date:** 2026-10-11, 20:20–23:50 Asia/Bangkok
**Deployed:** Vercel Production **`dpl_GjhBLovgQAm5v678suRk7nTZXHgQ`** (aliased to `customize.luckycolorstone.com` + `crm.luckycolorstone.com`); artifact 293 files, 106,228,594 bytes, fingerprint `c5ca6a33e67a58238c13dc517f4d3571abcc78dc9d9dcf51288774d8709de9c4`. **Render not required** (server.js untouched, fingerprint `f207998a…`, live commit `9d35e942…`).

## Verdicts

| Task | Verdict |
|---|---|
| A — iPhone performance (video + rapid edit) | **SUCCESS (engine-level)**; REAL_IPHONE_VERIFICATION **UNVERIFIED** |
| B — Lucky CTA phases | **SUCCESS** |
| C — onboarding image 4 Android alignment | **SUCCESS (emulated)**; real-device Android **UNVERIFIED** |
| D — Step 3 CTA area (wrist size, no preview button) | **SUCCESS** |
| E — onboarding image 1 replacement | **SUCCESS** |
| F — Lucky page 1 labels | **SUCCESS** |
| G/H — regression protection + tests | **SUCCESS** |
| I — deployment + report | this document |

## Task A — root causes and measured fixes

**A1 Lucky video (root cause proven).** The designing clip shipped with its `moov` atom **after 5,751,866 bytes of `mdat`** (`moov@5,764,072` in a 5,772,399-byte file), so Safari had to fetch almost the entire clip before it could start — the owner's "loads slowly / stalls / appears frozen". The file was re-muxed losslessly to **faststart** (`ftyp@0 | moov@32 | free@8366 | mdat@8374`, 5,760,240 bytes) with a temp-installed ffmpeg (no new dependency in the repo), a **poster frame** (`lucky-bracelet-designing-poster.webp`, 34 KB) was generated and wired to the element, and the source carries a cache-busting token.

| WebKit measurement (`video-load-probe.mjs`) | before (live bytes) | after (faststart) |
|---|---|---|
| metadata, local | 2,690 ms | **384 ms** |
| canplay, local | 2,764 ms | **486 ms** |
| metadata, paced 600 KB/s | 10,056 ms | **364 ms** |
| canplay, paced 600 KB/s | 10,133 ms | **3,159 ms** |

**A2 Step 3 rapid add/remove (root cause proven).** Every tap ran the full `renderStep3()`, which rebuilds all 27 catalog cards and the charm/spacer section on top of the ring. Composition edits now use `requestCompositionRender()`: one ring render per animation frame plus a single catalog/charm refresh after the burst (140 ms settle). Measured with `tools/step3-perf.spec.mjs` in before/after trees (before = the deployed `app.js` from git):

| WebKit 390×844 | before | after |
|---|---|---|
| 12 additions: median tap→ring | 49 ms | **34 ms** |
| 12 additions: catalog rebuilds | 12 | **1** |
| 10 removals: median / worst tap→ring | 50 / **209 ms** | **34 / 37 ms** |
| 10 removals: catalog rebuilds | 20 | **2** |
| 6 fast adds / 6 fast removals (0 ms gap): wall time | 396 / 406 ms | **230 / 271 ms** |
| Chromium (Android/desktop) | — | **equal or better**, no regression |

## Task B — Lucky CTA phases

The timeline boundaries were already owner-correct (20 s / 10 s / 40 s / 10 s / persist), but the centre prompt was **empty**: `ENTRY_PERMANENT_COPY = ''` and the hand icon was hidden in the text phase, so phases 2 and 4 showed nothing. Now: PAIR = mascot + callout `แตะให้ Lucky ช่วยออกแบบ`; TEXT = hand-tap icon + `แตะเพื่อให้` + `Lucky ช่วยออกแบบ` (label visible only in that phase); MASCOT phases = mascot only. The mascot size is **one constant clamp for every state** (the per-state overrides that scaled it 54–68 px vs 71–85 px were removed). All Thai literals were verified code-point-exact against the owner's strings.

## Task C — onboarding image 4 alignment

Measured baked-circle-vs-real-button deltas on the candidate: Android 412 **0.4 px**, Android 360 **0.5 px**, iPhone 390 **0.4 px**, iPhone 375 **0.4 px**; size delta ≈2 px. The real-device Android symptom was therefore not reproduced in emulation; the plausible cause (placement computed before/without a viewport shift such as the Android URL-bar collapse) is now covered by hardening: the controller re-places on `visualViewport` resize/scroll and keeps a **1.6 s placement watch** after each stage, with a null-session guard on the pending frame.

## Task D/E/F

* **D:** the `ดูตัวอย่างกำไล` button was removed from `index.html`; the info-area wrist label (hidden by two `display:none` Step-3 rules) is now visible and shows only the Step 1 value (`16.0 cm`, `17.5 cm`). Verified by changing the wrist size in Step 1.
* **E:** the owner's replaced `Kawaii Star Tutorial UI Overlay.webp` (235,378 bytes, sha256 `48b3e03f…`) is now in the release candidate and referenced with `?v=20261011`; live bytes match the artifact exactly.
* **F:** labels are `หินล้วนพลังดี` / `มีเครื่องรางคู่ใจ` and both descriptive lines are gone.

## Tests performed (all on the release candidate)

| Suite | Result |
|---|---|
| `turn8-cta-step3-onboarding.spec.mjs` (CTA phases, wrist-size area, labels, image 1 bytes/token, alignment, video atoms) | **WebKit 6/6, Chromium 6/6** |
| `undo-action-parity.spec.mjs` (one Undo = one action) | **WebKit 10/10, Chromium 10/10**, parity trajectories 6/6 exact |
| `ios-bead-removal-latency.spec.mjs` | **WebKit 6/6** (one removal event per tap, ring 36 ms after release) |
| Candidate regression `node --test tests/*.test.mjs tests/*.test.cjs` | **273/273** |
| Security harnesses | **226/226** |
| CRM acceptance (talisman save + order-card shipping) | **2/2 (Chromium)** |
| Live artifact identity | **9/9 files byte-identical** (app.js, index.html, index.css, lumi-ui.js, onboarding machine/smooth, video, poster, onboarding image 1) |
| Live content spot check (`tmp-live-turn8-check.cjs`) | 11/14 pass; the three "FAIL" lines are check-script matching bugs (the button check also matched `btnInspirationGalleryClose`, and the Thai copy check searched decoded Thai while the shipped source uses `\u` escapes). Browser specs verified the rendered text and the missing button on the candidate bytes, which are byte-identical to live. |

**Two WebKit regressions introduced by my own Turn-8 changes were found and fixed during this turn:** (1) with the ring rebuild deferred, the trailing synthetic `click` of a touch tap could be re-targeted to a neighbouring bead and remove a second bead (`undo-action-parity` WebKit fell to 4/10) — fixed by suppressing only the trailing click within 500 ms of a pointer-release activation; (2) a pending onboarding placement frame could run after the session ended (`session.slots` TypeError) — fixed with a null guard. Both suites are green again.

## What is verified live vs emulated

* **Live-verified:** deployment id/aliases, byte identity of all nine changed/added assets, onboarding image 1 bytes, faststart atom layout, poster presence, and the shipped source strings for every Task B/D/E/F/A change.
* **Emulated (Playwright):** CTA phase behaviour and mascot size constancy (WebKit + Chromium, faked clock), Step 3 wrist-size area, style labels, LUCKY_GUIDE alignment, rapid add/remove performance, video load timing (WebKit with a paced 600 KB/s stream), Undo parity.
* **UNVERIFIED:** real iPhone performance/feel (REAL_IPHONE_VERIFICATION), real Android Chrome LUCKY_GUIDE alignment on device, real operator CRM session checks, live checkout with a real payment.

## Remaining risks / next actions

1. Re-encode or further compress the 5.76 MB clip if the owner wants faster start on very slow connections (faststart fixes the stall; the first-frame buffer still takes ~3 s at 600 KB/s).
2. Wire `preloadDesigningVideo()` to Step 3 entry (it currently starts when Lucky page 1 renders) — a cheap additional head start, deliberately left out of this release to keep the change set reviewable.
3. Ask the owner for an Android device screenshot if image 4 is still off centre after this release (emulation shows ≤0.5 px).
4. One physical iPhone pass over tap-to-remove, fast tapping, Undo depth and the Lucky video.
