# Phase 6 — LINE Login Regression

**Candidate:** `D:\Projects\lucky-colorstone-line-login-rc-20261123`

**Date:** 2026-11-23 (Asia/Bangkok)

**Status:** **34/34 LOCAL TESTS PASS — REAL-DEVICE TESTS NOT RUN**

## 1. Minimal candidate suite

```text
node --test tests/*.test.cjs
Tests:    34
Passed:   34
Failed:   0
Skipped:  0
Duration: 7,986.93 ms
```

The suite contains only tests relevant to the minimal release. It does not delete or weaken any test from the broad candidate; the broad candidate retains its complete 67-test suite separately.

## 2. Coverage

### LINE Login success and navigation

```text
PASS Step 1 Next starts auth-entry, saves design before redirect, targets Step 2
PASS auth-entry success restores Step 2
PASS pending recovery happens before the legacy resume branch
PASS auth-entry return restores the verified snapshot without replaying Landing
PASS auth-entry page starts LIFF with withLoginOnExternalBrowser
```

### Failure and lifecycle

```text
PASS failure returns to Step 1 without clearing saved design state
PASS cancel/close/refresh/back-forward/retry lifecycle is fail-closed
PASS duplicate callback/consume is rejected
PASS expired pending session returns not found
PASS verifier 4xx/5xx, malformed response, network error, and timeout fail closed
PASS oversized auth-entry body returns 413
PASS rate limit returns 429 without creating a session
PASS no token or LINE ID in URLs or browser storage
```

### Server and Vercel

```text
PASS auth-entry service RPC names have matching migration wrappers
PASS `/line-auth-entry` is served before `/api/(.*)`
PASS no UAT origin, LIFF ID, Render host, or auth header is hard-coded
```

### Commerce preservation

```text
PASS CRM normal order renders and exposes workflow control
PASS Landing -> Step 1 -> Step 2 -> Step 3 -> Step 4 journey
PASS checkout request payload remains compatible
PASS Stripe Checkout function byte-identical to Production baseline
PASS Stripe webhook function byte-identical
PASS order creation/update function byte-identical
PASS stock validation/deduction function byte-identical
PASS catalog JSON and CRM frontend files byte-identical
```

The function-hash test excludes unrelated files and fails if any commerce function differs.

## 3. SQL smoke

Local PostgreSQL 14.4:

```text
PASS bootstrap
PASS auth migration apply
PASS create_production_line_auth_entry_session
PASS consume_production_line_auth_entry_session
```

Evidence:

```text
reports/production/evidence/auth-entry-sql-smoke.log
```

The SQL was not applied to UAT/Production.

## 4. Broad candidate evidence

The broad Phase 4/5 candidate still passes its complete suite:

```text
67 tests, 66 passed, 0 failed, 1 skipped (live Stripe key absent)
```

That suite is not evidence that the broad candidate is a minimal release. It contains stock, PII, CRM, catalog, and security changes outside the LINE Login scope.

## 5. Real-device status

| Device/browser | Status |
|---|---|
| Android Chrome | NOT TESTED |
| iPhone Safari | NOT TESTED |
| Instagram WebView | NOT TESTED |
| LINE in-client | NOT TESTED |

No user-agent simulation is treated as a real-device PASS.

## 6. Remaining local limitations

- The auth-entry success browser test uses a stubbed LINE/Supabase environment.
- The SQL smoke proves function routing, not a live LINE token exchange.
- The failure test proves saved design state is not removed; it does not prove every mobile storage edge case.
- No Production verification was performed.

## 7. Verdict

Local LINE Login regression: **PASS**. Real-device and live UAT: **NOT TESTED**.
