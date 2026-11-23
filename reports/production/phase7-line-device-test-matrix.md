# Phase 7 — LINE Device Test Matrix

**Candidate:** `D:\Projects\lucky-colorstone-line-login-rc-20261123`

**Status:** **ALL REAL-DEVICE CASES NOT TESTED**

## 1. Device matrix

| Device/browser | Login success | Cancel | Close | Refresh | Back/forward | Multiple tabs | Session expiry | Duplicate callback | Network failure | Verifier timeout | Design preserved | Step 2 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Android Chrome | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| iPhone Safari | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Instagram WebView | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| LINE in-client | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |

## 2. Required expected behavior

### Success

1. Complete Step 1 and Step 2 with a recognizable design.
2. Tap Next.
3. Complete LINE Login.
4. Return to the site.
5. Confirm the same wrist/bead/stone/charm/spacer design.
6. Confirm Step 2 is visible (or intended boundary) with no Landing replay.
7. Confirm no raw token/cookie/LINE ID in the URL or visible UI.

### Cancel / close

- No order created.
- No stock deduction.
- No raw token persisted.
- A retry starts a clean auth-entry attempt.

### Refresh / back / forward

- Pending lookup is cookie-bound.
- Consumed session does not replay.
- Design is not cleared on a failed restore.
- No duplicate analytics/order event.

### Multiple tabs

- Only the owning browser/tab can consume the handoff.
- A second tab must fail closed or return to Step 1, not take over the design.

### Expiry / duplicate callback

- Expired session returns to Step 1 with a retryable state.
- Duplicate consume does not create a second order or second stock event.
- Server must return not found/expired, not a forged design.

### Network / verifier timeout

- No infinite loader.
- No token in logs/screenshots.
- Safe fallback/return path.
- Retry remains possible.

### Instagram WebView

- No browser-choice modal.
- No recovery card.
- No token in URL.
- If the platform cannot escape, the customer remains in Instagram; do not claim success.

### LINE in-client

- Existing native/client flow remains available.
- No external auth-entry loop.
- Design survives supported refresh/back behavior.

## 3. Evidence to collect

For each case:

```text
device model / OS / browser / app version
timestamp with Asia/Bangkok timezone
screen recording or screenshots of the visible result
redacted network status and console error
starting Step and ending Step
design signature (wrist/bead/stone/charm/spacer counts)
result: PASS | FAIL | NOT RUN | INCONCLUSIVE
```

Never attach:

```text
raw ID tokens
cookies or authorization headers
LINE user IDs
phone numbers, addresses, names
Stripe session/payment IDs
```

## 4. Test execution gate

Requires an owner-approved UAT deployment and a UAT-specific origin/config overlay. The frozen Production-minimal candidate cannot be validated against the UAT custom domain without that overlay because its server origin is Production-only.

**No real-device result is claimed.**
