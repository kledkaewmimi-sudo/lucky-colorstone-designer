# Phase 3B.2C-0 test-only flag override

`resolveDeferredLineLoginFlag({ testOverride })` is a pure in-memory resolver. Production defaults to the exported `DEFER_LINE_LOGIN_TO_STEP4 = false`; only the literal boolean `true` passed directly by a test resolves true. The resolver reads no query parameter, URL, storage, DOM, cookie, or user-controlled input and is not wired into normal application startup or guard behavior.

This permits deterministic controlled tests without exposing a production user switch. Tests verify default false, explicit true, rejection of string input, and the flag-on decision-helper path. No redirect, intent, handoff, UI, analytics, or customer flow changed.
