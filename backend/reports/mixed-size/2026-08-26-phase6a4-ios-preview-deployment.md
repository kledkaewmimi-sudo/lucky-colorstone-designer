# Phase 6A.4 — iOS preview deployment assessment

Date: 2026-08-26  
Worktree: `D:\Projects\lucky-colorstone-prod-promotion`  
Branch: `feature/mixed-size-production-promotion`  
Promotion head: `c7289e88f28a82cd1b1984d11e378e8e556dc9b5`

## Result: blocked for real iPhone LINE QA

No Vercel preview was created because it would be wired to incompatible production dependencies and could not complete a real LIFF callback.

## Evidence

1. `vercel.json` proxies every preview `/api/*` request to `https://lucky-colorstone-designer.onrender.com/api/$1`.
2. The Phase 6A.4 fix requires `GET /api/auth-handoffs/:token` before the existing consume acknowledgement. That endpoint exists only in promotion `server.js` (`readLineAuthHandoff` and its GET route), not in the unchanged production Render service. A Vercel preview would therefore call a backend that cannot perform the new server-first recovery.
3. The active LIFF ID is `2010525799-qImIuhla`. The recorded LIFF endpoint URL is `https://customize.luckycolorstone.com/` in `reports/auth/2026-08-23-final-linked-oa-aggressive-liff-flow.md`. A random `*.vercel.app` preview hostname is not the configured LIFF endpoint, so LINE login cannot be treated as a valid callback test target without an approved LINE Console endpoint change.
4. No `.vercel` project link is present in this worktree. The local Vercel PowerShell shim is blocked by execution policy, but that is not the release blocker: the backend rewrite and LIFF endpoint incompatibility already make deployment unsafe for the requested QA.

## Safety conclusion

Deploying the frontend preview would point its `/api/auth-handoffs` calls at the current production Render backend and could either fail the callback or exercise production infrastructure with a branch-only frontend. That would not validate the Phase 6A.4 iOS fix and is excluded by the requested scope.

## Recommended safe QA method

Create an isolated QA environment only after owner approval:

1. A non-production backend deployment from this promotion commit, with isolated non-production Supabase handoff storage.
2. A dedicated stable QA hostname whose HTTPS URL is approved as a LIFF endpoint in LINE Console.
3. A preview/frontend deployment configured to rewrite `/api/*` to that matching non-production backend.

No production domain, Vercel project settings, Render service, environment variable, Supabase data, Stripe checkout, LINE configuration, or production deployment was changed.
