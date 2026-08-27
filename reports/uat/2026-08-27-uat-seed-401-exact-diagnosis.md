# UAT Seed 401 Exact Diagnosis

Date: 2026-08-27  
Scope: UAT worktree only. No seed, deployment, secret access, production connection, or production change occurred.

## Current Evidence

The already deployed `f912cc0` version correctly removes `Authorization` for a clean `sb_secret_*` key, but the live environment’s actual key length, whitespace state, and Supabase response body are not visible in this workspace. The prior error only reported `HTTP 401`, so it cannot distinguish invalid/disabled key, a copied key from another project, whitespace corruption, or another gateway rejection.

Accordingly, the exact live 401 root cause is **UNKNOWN**, not assumed to be the earlier Bearer-header problem.

## Actual Request Construction

After the local diagnostic update, the seed request uses:

- target: exact pinned root `https://crviqzaziboxshbzhpri.supabase.co`
- REST probe path: `/rest/v1/catalog_stones?select=id&limit=1`
- seed path: `/rest/v1/catalog_stones?on_conflict=id`
- `apikey`: present
- `Authorization` for normalized `sb_secret_*`: absent
- `Content-Type`: `application/json` for UPSERTs
- `Prefer`: `resolution=merge-duplicates,return=minimal`
- explicit server User-Agent: `lucky-colorstone-uat-seed/1.0`

Node’s built-in fetch is Undici-based, not browser-based. The update adds an explicit server User-Agent to remove any ambiguity. It changes no browser/frontend behavior.

## Proven Local Defects Corrected (Not Yet Deployed)

1. The seed/server paths did not trim the configured UAT URL/key before classification and use. A key with leading/trailing whitespace could be misclassified and rejected. The helper and UAT server config now normalize it.
2. The seed discarded the Supabase response body and reported only HTTP status. It now emits a bounded, safe code/message/request-id diagnostic; no credentials, cookies, request headers, or key content are logged.
3. The seed did not explicitly identify itself as server-side. It now sets the server User-Agent above.

These changes make a live exact diagnosis possible but cannot prove the currently configured Render key has whitespace or is mismatched until deployed and run in Render.

## Safe Render Commands Required

After the diagnostic update is deployed to UAT Render, run only:

```text
node scripts/seed-uat-supabase.js --diagnose
node scripts/seed-uat-supabase.js --probe
```

`--diagnose` prints only key presence/type/trimmed length/whitespace state and project pin matches. `--probe` performs only `GET /rest/v1/catalog_stones?select=id&limit=1` using the same normalized key, `apikey` header, no Bearer header for `sb_secret_*`, and explicit server User-Agent. It does not write data.

Interpretation:

- A 200 probe proves the key/project transport path; retry seed.
- A 401 probe with `Invalid API key`/equivalent means the owner should re-copy the **default Secret key from the approved UAT project** and replace only `UAT_SUPABASE_SERVICE_ROLE_KEY` in UAT Render. Do not rotate automatically.
- A pin mismatch means correct only the UAT Render value to the approved UAT project; do not use any production value.
- Any other safe Supabase message should be preserved verbatim in the UAT report and diagnosed from that evidence.

## Tests

Passed locally:

- `node tests/uat-supabase-auth.test.cjs`
- `node tests/uat-backend-guard.test.cjs`
- `node tests/uat-handoff-supabase-contract.test.cjs`
- local `--diagnose` simulation using a non-secret placeholder
- `node --check scripts/seed-uat-supabase.js`
- `node --check uat-supabase-auth.js`
- `node --check server.js`
- `git diff --check`

The diagnostic simulation showed `SB_SECRET`, `Authorization: ABSENT`, `apikey: PRESENT`, project pin matches, explicit server User-Agent, and no secret output.

## Status

**OWNER_ACTION_REQUIRED.** The exact live result cannot be obtained without running the safe read-only diagnostics in the UAT Render environment after this diagnostic update is deployed. Production remains untouched.
