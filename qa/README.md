# Lucky Colorstone QA Toolkit

The canonical QA entry point is `qa/registry.json`. Agents should search the
registry before creating or copying a test.

## Commands

```text
npm run qa:doctor
npm run qa:find -- --category layout --tag order
npm run test:catalog
npm run test:crm
npm run test:layout
npm run test:browser
npm run test:checkout
npm run test:security
npm run qa:predeploy
npm run qa:production
node qa/tools/staged-artifact.mjs --url https://<deployment>.vercel.app
```

On Windows shells where `npm.ps1` is blocked by execution policy, use
`npm.cmd run <script>`.

## Application root

Promoted browser tests use `QA_APP_ROOT` when supplied. Otherwise they select
the current repository if it contains the current QA markers, or the newest
local production candidate that does. This supports the current filtered
Production baseline without embedding historical candidate paths in tests.

Example:

```text
QA_APP_ROOT=.local-candidates/<candidate> npm run test:browser
```

## Safety

- `none`: unit/static checks only.
- `fixture`: local fixture writes only.
- `remote-read`: approved GET-only production checks.
- `remote-write-approved`: never automatic; requires separate owner approval.

`qa:production` is read-only. `qa:predeploy` verifies local built artifacts and
does not deploy.

## Evidence

Suite evidence is written under `reports/qa/`. Quarantined suites and tools are
listed in `qa/quarantine.json`; they remain preserved but cannot block unrelated
curated suites.
