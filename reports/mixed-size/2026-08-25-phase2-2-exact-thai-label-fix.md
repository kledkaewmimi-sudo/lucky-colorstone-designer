# Phase 2.2 — Exact Thai Unicode label correction

Date: 2026-08-25
Workspace: `D:\Projects\lucky-colorstone-uat`
Branch: `uat`

## Scope and safety

- Confirmed `main` equals `origin/main` at `0e958ff63b322b179e8184c4c6640fb22518756a` before changes.
- Changed only UAT `index.html`, its focused mixed-size UX test, and this report.
- No production workspace, branch, deployment, data, credentials, integrations, or services were accessed for mutation.
- No state model, mixed-size behavior, geometry, renderer, pricing, checkout, Step 4, or UAT isolation behavior was changed.

## Exact Unicode correction

The mixed Step 2 visible label and its `aria-label` now use this exact sequence:

```text
U+0E04 U+0E25 U+0E30 U+0E44 U+0E0B U+0E2A U+0E4C
```

The Step 3 all-sizes filter now uses this exact sequence:

```text
U+0E17 U+0E31 U+0E49 U+0E07 U+0E2B U+0E21 U+0E14
```

The focused test now asserts both arrays numerically. Its obsolete-label checks deliberately use code-point construction: the former mixed sequence is a prefix of the corrected one, so an ordinary substring count would incorrectly report a match. The audit instead detects only a deprecated mixed sequence not followed by U+0E4C.

Audit scope: runtime mixed-size markup (`index.html`), `app.js`, and the focused UX test. Results:

```text
deprecated mixed label standalone occurrences: 0
deprecated all-sizes label occurrences: 0
```

Historical reports were preserved as audit records and excluded from this source/UI audit.

## Regression verification

Completed successfully:

```text
node --check app.js
node --check mixed-size-state.js
node --test tests/mixed-size-state.test.mjs tests/mixed-size-ux.test.mjs tests/guest-design-state.test.mjs tests/uat-backend-guard.test.cjs tests/uat-frontend-safety.test.cjs
git diff --check
```

Result: 33 tests passed, 0 failed. The existing Node module-type warning was the only warning.

The test suite continues to cover fixed-size regressions, mixed placement initialization, filter isolation and non-mutation, explicit placement size/no 6mm fallback, mixed-to-fixed validation, UAT Step 4 block, checkout block, and frontend/backend UAT safety guards.

## Live UAT static verification

Commit `54ade04` was pushed only to `origin/uat`. After the UAT deployment, a read-only fetch of `https://lucky-colorstone-uat.vercel.app/` confirmed:

```text
Step 2: U+0E04 U+0E25 U+0E30 U+0E44 U+0E0B U+0E2A U+0E4C
Step 3: U+0E17 U+0E31 U+0E49 U+0E07 U+0E2B U+0E21 U+0E14
required mixed label present: true
required all-sizes label present: true
deprecated mixed label standalone occurrences: 0
deprecated all-sizes label occurrences: 0
```

The deployed static source passes the exact Unicode check. Interactive browser clicking is not claimed by this report; it remains the owner click-through step.
