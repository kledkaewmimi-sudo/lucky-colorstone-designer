# AGENTS Instructions

## Scope

These instructions apply to the repository root and all files beneath it.

## Working Rules

- Do not modify application code unless the user explicitly asks.
- Prefer documentation updates when the task is about understanding, review, or planning.
- Use `apply_patch` for all file edits.
- Keep changes minimal and localized.
- Do not create or commit branches.
- Do not run destructive filesystem commands.

## Project Facts

- The customer app lives in `index.html` and `app.js`.
- The CRM lives in `crm.html` and `crm.js`.
- Shared data access lives in `data.js`.
- The local backend is `server.ps1`, not an Express app.
- Persisted data lives in `data/stones.json`, `data/orders.json`, and `data/settings.json`.

## Engineering Notes

- Treat `localStorage` as non-authoritative client state.
- Treat `/api/*` JSON files as the source of truth for shared data.
- Be careful when changing pricing, order payloads, or status values because both apps depend on them.
- Preserve root-relative asset paths when editing HTML.
- Keep LIFF-related behavior compatible with the customer flow.

## Validation

- If you change docs only, do not run the app unless the user asks.
- If you change code later, validate the smallest affected surface first.

