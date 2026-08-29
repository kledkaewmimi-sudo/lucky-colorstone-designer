# Slot Forensics Fallback Modal — Mobile UAT

## Owner Evidence

The owner confirmed that slot forensics captured 128 snapshots, including the first post-readd capture. Export / Copy Trace still failed in the mobile in-app browser and no fallback UI appeared.

## Why Previous Fallback Failed

The previous export serialized before entering its protected clipboard/fallback path and did not record where export stopped. A serialization or asynchronous activation failure could therefore leave no visible evidence and no modal. This update moves serialization inside the guarded path and records each boundary; real-device forced-failure verification is still required.

## Export Activation Trace

The UAT export trace records `EXPORT_CLICK`, `SERIALIZE_SUCCESS`, `CLIPBOARD_ATTEMPT`, `CLIPBOARD_REJECTED`, `FALLBACK_MODAL_CREATE`, `FALLBACK_MODAL_APPEND`, and `FALLBACK_MODAL_VISIBLE`. The main forensic panel displays the ordered trace and the forced-failure flag. The full export also includes these events.

## Forced Clipboard Failure

`?slot_forensics=1&force_clipboard_fail=1` is UAT-only. It intentionally routes the export directly into the failure handler after successful serialization, without changing bracelet, renderer, completion, or application state.

## Modal DOM Contract

The fallback is a direct child of `document.body` (or `document.documentElement` if necessary), uses a fixed full-screen overlay with explicit top/right/bottom/left bounds, maximum z-index, visible display, and scrolling. Its `data-forensics-visible` marker is set after append and computed-style visibility inspection.

The modal contains `SLOT FORENSICS EXPORT`, history count, JSON byte size, clipboard state, fallback state, a readonly selectable textarea, and `SELECT ALL`, `COPY`, `DOWNLOAD JSON`, and `CLOSE` controls.

## Manual Copy Fallback

The textarea always remains open after a copy failure. `SELECT ALL` selects the complete JSON. `COPY` tries `document.execCommand('copy')`; if it is blocked, the selected readonly textarea remains available for long-press/manual copy.

## Download Fallback

`DOWNLOAD JSON` uses a client-side `Blob`, `URL.createObjectURL`, and temporary download link named `slot-forensics-<timestamp>.json`. It is independent of the clipboard. If an in-app browser blocks download, the visible textarea remains available.

## Tests

`node --check app.js`, `node --test tests/delete-readd-slot-forensics.test.mjs`, and `git diff --check` verify syntax, diagnostic source contracts, full-ring regressions, and whitespace. The forced-failure DOM path is source-tested; owner mobile verification remains the release evidence for the target WebView.

## UAT Deployment

This diagnostic-only change is committed and deployed to the isolated UAT project. No production deployment was made.

## Owner Retest

Open the forced-failure URL, capture the required timeline, press Export / Copy Trace, and confirm the full-screen modal, visible status block, complete JSON textarea, and all four controls. If normal clipboard fails, use the same modal to manually copy or download without clearing history.

## Production Isolation

Only the UAT branch and isolated UAT deployment are changed. Production application code and deployment are unchanged.
