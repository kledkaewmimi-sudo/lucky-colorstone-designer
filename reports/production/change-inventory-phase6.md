# Phase 6 — Change Inventory

**Candidate:** `D:\Projects\lucky-colorstone-line-login-rc-20261123`

## Runtime changes vs recovered Production baseline

```text
frontend/app.js
frontend/line-auth-entry.html
frontend/line-auth-entry.js
frontend/vercel.json
backend/server.js
backend/production-line-auth-entry.js
supabase/production/2026-11-23-line-auth-entry-sessions.sql
```

## Tests

```text
tests/line-auth-production.test.cjs
tests/line-auth-frontend.test.cjs
tests/line-auth-edge-cases.test.cjs
tests/state-restoration.test.cjs
tests/full-journey.test.cjs
tests/crm-regression.test.cjs
tests/phase6-auth-sql-contract.test.cjs
tests/phase6-baseline-preservation.test.cjs
tests/phase6-line-login-targeted.test.cjs
tests/migration/local-bootstrap.sql
tests/migration/validation.sql
```

## Reports

```text
reports/production/phase6-production-vs-candidate-diff.md
reports/production/phase6-minimal-release-audit.md
reports/production/phase6-line-login-regression.md
reports/production/phase6-final-release-readiness.md
reports/production/change-inventory-phase6.md
```

## Manifest and evidence

```text
reports/production/minimal-candidate-manifest.json
reports/production/evidence/phase6-minimal-suite.log
reports/production/evidence/auth-entry-sql-smoke.log
```

## Explicitly excluded

```text
Phase 5 stock reservation prototype
STOCK_RESERVATION_RPC_ENABLED
stock migration
PII profile split
CRM XSS/default-secret changes
gray_agate local fixture change
Pyrite server guard
CSP/security headers, rate limiter, upload validation
All Production/UAT deployments and data changes
```
