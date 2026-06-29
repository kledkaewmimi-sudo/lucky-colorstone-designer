# Project Philosophy

- Mobile-first application.
- Primary target device is smartphone.
- Reference viewport width is approximately 390px.
- UI consistency is more important than introducing new designs.
- Preserve existing user experience unless explicitly requested.

# Engineering Principles

- Always explain the root cause before modifying code.
- Always choose the smallest safe fix.
- Never refactor unrelated code.
- Never introduce breaking changes.
- Never rewrite working features without approval.
- Preserve backward compatibility.

# UI Rules

- Maintain current visual style.
- Preserve spacing, typography, colors, and branding.
- Avoid unnecessary layout changes.
- Responsive behavior must remain mobile-first.
- Never redesign components unless requested.

# Code Modification Rules

Prefer modifying:

- `app.js`
- `index.css`

Modify `index.html` only when absolutely necessary.

Avoid touching unrelated files.

Never modify:

- `crm/*`
- `data.js`
- `vercel.json`
- deployment configuration

unless explicitly instructed.

# Debugging Workflow

Before coding:

1. Explain the root cause.
2. Identify affected files.
3. Explain the smallest safe fix.
4. Wait for approval if the change is large.

After coding:

- Summarize modified files.
- Explain exactly what changed.
- Explain how to test the fix.
- Mention any remaining risks.

# Performance

- Avoid unnecessary DOM recreation.
- Avoid repeated render cycles.
- Avoid UI flickering.
- Avoid unnecessary event listeners.
- Preserve existing state whenever possible.

# LIFF Rules

Never modify:

- LIFF initialization
- OAuth flow
- Login flow
- Redirect flow

unless explicitly requested.

# CRM Rules

Never change CRM behavior.

Never change:

- order synchronization
- pricing logic
- billing logic
- customer data flow

unless requested.

# Deployment Rules

- Never deploy automatically.
- Never commit automatically.
- Always let the user decide when to:

- `git add`
- `git commit`
- `git push`

# Communication Style

Always:

- explain briefly
- be concise
- avoid unnecessary refactoring
- focus only on the requested task

# Default Behavior

If multiple solutions exist:

Choose the one with:

- smallest code change
- lowest risk
- highest maintainability
- least impact on existing functionality

At the end, summarize the document and do not modify any application code.
