# UAT LINE Auth Real-Device Diagnostic Trace

## Scope

This change adds UAT-only observability for the Landing/initial LINE identity path. It does not change login timing, redirect URI, browser branching, callback flow, persistence behavior, retry behavior, or any bracelet/checkout system.

## Enablement

The panel is enabled only when both conditions are true:

1. The compiled application environment is UAT.
2. The URL query includes `?line_debug=1`.

Without the query, no panel, event listeners, timers, or diagnostic UI are created. The production application is excluded by the UAT environment guard.

## Captured Trace

The Landing panel uses a relative timestamp and records BOOT, DOM readiness, LIFF configuration and initialization, the Start click, startup-promise outcome, identity-gate entry, authentication adapter entry, intent-persistence result, LIFF login lifecycle, LIFF-entry navigation, lifecycle navigation signals, and sanitized runtime errors.

At the click and LIFF-login boundaries it records only: LIFF initialization/ID presence, `isInClient`, `isLoggedIn`, page visibility, user-activation state, focus, Landing prompt visibility, login-in-progress state, CTA text, and sanitized user agent. It does not record IDs, profile fields, tokens, cookies, secrets, or credentials.

## No-Navigation Signal

After a successful `liff.login()` invocation, the panel observes `pagehide`, `beforeunload`, and hidden visibility. If none occurs in 1500 ms, it appends:

`LOGIN_INVOKED_NO_NAVIGATION` with `F05E8` (`LIFF_LOGIN_INVOKED_BUT_NO_NAVIGATION_OBSERVED`).

This is diagnostic only: it does not retry, redirect, or alter the current UI behavior.

## Copy Trace

The panel contains **Copy Debug Trace**, which copies the safe JSON event list to the device clipboard. The same trace remains readable in the panel for screenshot/video capture.

## Browser Verification

The real-page Chrome harness loads the actual local HTTP-served `index.html`, `index.css`, `app.js`, and imports while mocking only the LIFF SDK.

- Query absent: the Start flow still invokes `liff.login()` once and no debug panel is present.
- Debug + simulated `pagehide`: required click/login events are present and F05E8 is absent.
- Debug + no lifecycle navigation for 1500 ms: required click/login events are present and F05E8 is present.
- Existing focused LINE tests: 42 passed.
- Existing Step 3 restoration tests: 4 passed.

## Deployment and Retest

UAT deployment is limited to this frontend diagnostic. Owner retest should open the UAT URL with `?line_debug=1`, tap Start once, then copy the trace or provide a clear screenshot/video showing the trace. This report does not claim the authentication defect is fixed.

## Production Isolation

No production files, deployment, or backend service were changed.
