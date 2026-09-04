# Historical Meta Ads backfill GitHub Actions heredoc fix

Date: 2026-09-04

## Root cause

The `Backfill requested dates` YAML `run: |` block removes ten leading spaces
when GitHub Actions materializes its Bash script. The closing `NODE` delimiter
for the per-date summary heredoc was written at YAML indentation twelve. It was
therefore emitted with two leading spaces. Bash requires a `<<'NODE'` delimiter
to begin in column one, so the shell reached EOF while searching for the
delimiter and failed before either collector ran.

## Change

`.github/workflows/meta-ads-historical-backfill.yml` lines 56-100 replace both
Node heredocs with quoted `node -e` invocations:

- UTC calendar-date enumeration remains in `node -e` and still uses
  `setUTCDate`.
- The per-date safe JSON summary remains in `node -e` after the baseline and
  demographics collectors.
- No `<<` heredoc remains in the generated Bash body.

The collector commands, dates, secrets, error handling, and output fields are
unchanged. The loop still invokes baseline and daily demographics once per date,
captures collector output, writes only the safe date/rows-read/rows-written
summary on success, and exits immediately on a collector failure.

`tests/meta-ads-historical-backfill-workflow.test.cjs` now normalizes workflow
line endings, reconstructs the exact `run: |` shell body by removing its YAML
indentation, asserts it contains no heredoc operator, and runs `bash -n` on the
reconstructed script. On Windows the test selects Git Bash; on Linux Actions it
uses `bash`.

## Validation

Passed in the clean branch worktree:

```text
npm ci
node --test tests/meta-ads-sync-core.test.cjs
node tests/meta-ads-scheduled-workflow.test.cjs
node tests/meta-ads-historical-backfill-workflow.test.cjs
node --check scripts/meta-ads-sync.js
node --check scripts/meta-ads-analytics-sync.js
git diff --check
```

The focused workflow contract test passed, including the reconstructed-script
`bash -n` validation.

## Files changed

- `.github/workflows/meta-ads-historical-backfill.yml`
- `tests/meta-ads-historical-backfill-workflow.test.cjs`
- `reports/meta-ads/2026-09-04-historical-backfill-heredoc-fix.md`

## Promotion status

- Branch base: `origin/main` at `fcb1153a64991517d6690471d8dc94d40ede0dc2`
- Fix implementation commit SHA: `11e202c40117e90506be469128707d2538b13b1e`
- No historical backfill was executed.
- No Production data or application code was changed.
- Owner approval and a manual workflow rerun remain required.

| Check | Result |
| --- | --- |
| Heredoc/root cause fixed | YES |
| bash -n passed | YES |
| Date-scoped baseline preserved | YES |
| Date-scoped demographics preserved | YES |
| Production app changed | NO |
| Production data modified | NO |
| Backfill executed | NO |
| Main modified | NO |
| Owner manual rerun required | YES |
