# AGENTS Instructions

## Scope

These instructions apply to the repository root and all files beneath it.

## Working Rules

- Do not modify application code unless the user explicitly asks.
- Prefer documentation updates when the task is about understanding, review, or planning.
- Use `apply_patch` for all file edits.
- Keep changes minimal, localized, and easy to review.
- Do not create or commit branches.
- Do not run destructive filesystem commands.
- Think before coding: understand the request, identify the affected files, and do not start editing until the goal is clear.
- If the request is ambiguous, ask for clarification instead of guessing.
- Make the smallest change that solves the problem.
- Do not add future features, unnecessary abstractions, or extra configuration unless requested.
- Only edit files related to the user request.
- Do not refactor unrelated code.
- Every changed line should be traceable to the task.
- Convert the request into clear success criteria before implementation.
- For UI work, define what should visibly change.
- For bug fixes, define what behavior is broken and what behavior should happen after the fix.

## Debugging Rules

- Reproduce the issue first if possible.
- Read the error log, console error, stack trace, or screenshot carefully.
- Explain the likely root cause before editing.
- Change one thing at a time when isolating a bug.
- Verify that the bug is fixed.
- Stop when the requested issue is solved.
- Do not guess blindly.
- Do not rewrite large sections of code unless the root cause requires it.

## Dependency Policy

- Do not add new dependencies unless necessary.
- Before adding a package, check whether the existing stack can solve the problem.
- If a dependency is required, explain why it is needed.

## Common Failure Modes To Avoid

- Kitchen Sink: do not expand a small task into a large unrelated change.
- Wrong Abstraction: if repeated logic appears in multiple places, consider a small shared helper, but do not over-engineer.
- Optimistic Path: handle realistic failure cases such as missing data, empty images, broken API responses, invalid user input, or loading states.
- Runaway Refactor: do not let a small fix become a large refactor. If a refactor seems necessary, stop and ask first.

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

## Lucky Color Stone CRM Specific Rules

- Preserve Thai text correctly. No broken encoding or strange characters.
- Do not remove existing CRM features unless requested.
- Do not change unrelated pages.
- For Stone Inventory and Charms pages, verify image size, image visibility, and layout after UI changes.
- For production URL checks, use `https://crm.luckycolorstone.com/`.
- Prefer checking only affected pages to save quota.
- Do not modify design direction unless the user specifically asks.
- Keep changes simple, clean, and easy to review.

## Screenshot Truth Rule

- If the user provides a screenshot of the current result, treat the screenshot as source of truth over assumptions from code structure.
- Do not claim the UI is correct if the screenshot shows otherwise.

## Verification

- Do not claim the task is complete without verification.
- Verify only the minimum affected page, component, or flow unless broader regression testing is explicitly required.
- Do not spend quota exploring unrelated pages.
- If you change docs only, do not run the app unless the user asks.
- If deployment verification is part of the task, do not claim a deployed URL is fixed until the affected deployed URL has actually been checked.

### Level 1 - Basic Code Check

Use for small text, style, or simple code changes.

Required checks:

- Run build if a reliable project build command exists.
- Run lint if a reliable lint command exists.
- Confirm no obvious syntax or type errors.
- Do not invent build or lint commands.

### Level 2 - UI Verification

Use for visual changes, layout changes, image changes, Thai text fixes, buttons, forms, and CRM pages.

Required checks:

- Run build if a reliable project build command exists.
- Open only the affected page.
- Check browser console errors.
- Confirm the requested UI change is visible.
- Do not explore unrelated pages.

### Level 3 - Pre-Deploy Verification

Use before deployment, merge to main, or major changes.

Required checks:

- Run build if a reliable project build command exists.
- Run tests if available and reliable.
- Check main affected CRM pages.
- Check login/auth flow if affected.
- Check create/edit/delete flows if affected.
- Check responsive layout if UI was changed.

## Communication Rules

- Be honest about uncertainty.
- Do not say a task is done or fixed unless verification passed.
- If something was not tested, clearly say what was not tested.
- Summarize files changed, what was fixed, verification performed, and any remaining risks.

