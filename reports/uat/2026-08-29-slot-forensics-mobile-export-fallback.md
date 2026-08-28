# Slot Forensics Mobile Export Fallback — UAT

## Owner Mobile Evidence

The owner confirmed that `?slot_forensics=1` captures the complete timeline (`FULL_RENDER_HISTORY: 117`) but the mobile in-app browser rejects the clipboard export.

## Clipboard Failure Cause

`navigator.clipboard.writeText()` is permission- and secure-context-dependent. LINE in-app browsers/WebViews can reject it even when the trace has already been captured successfully.

## Export Fallback Design

Export first attempts `navigator.clipboard.writeText(fullJson)`. On unavailable or rejected clipboard access, it opens a high-z-index, scrollable mobile modal containing the complete JSON in a readonly selectable textarea. The modal has Select All, Copy (using `document.execCommand('copy')` when supported), Download Trace JSON, and Close controls. Long-press/manual selection remains available if WebView copy is blocked.

## Full-History Preservation

The serialized value is the full `window.__slotForensics` object, including append-only ordered `history`, named captures, render/action sequences, comparisons, and export status. Opening, copying, downloading, or closing the modal never resets or clears history.

## Mobile UX

The modal is viewport-constrained, scrollable, closable, and uses a large textarea suitable for narrow mobile screens. It is diagnostic-only and does not interact with application state.

## Verification

The diagnostic panel now reports export method, snapshot count, history count, and success. Textarea or download availability counts as export success when the clipboard API is unavailable.

## Tests

Focused forensic tests verify the primary API path, textarea fallback, execCommand copy path, JSON Blob download, and full-history export serialization.

## UAT Deployment

Deploy only the UAT branch and retest `https://uat.customize.luckycolorstone.com/?slot_forensics=1`.

## Owner Retest

After reproducing delete/re-add, tap Export / Copy Trace. If the browser blocks clipboard, use Select All/Copy or Download Trace JSON and provide the complete JSON file/text.

## Production Isolation

UAT-only query-gated diagnostic code. Production is unchanged.
