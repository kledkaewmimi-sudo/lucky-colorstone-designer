# Lucky Colorstone Designer

`Lucky Colorstone Designer` is a two-part web application for designing custom gemstone bracelets and managing orders from a back-office CRM.

## What it does

- Customer-facing designer for bracelet creation.
- CRM dashboard for catalog, orders, and settings management.
- Shared JSON-backed data source for stones, orders, and configuration.
- LINE LIFF integration for customer login and order submission.

## Core Concepts

- Customers select wrist size, bead size, and stones in a guided step flow.
- The app calculates pricing from bead size and stone catalog prices.
- Orders are written to a shared API and mirrored in the CRM.
- CRM users can edit stones, update order status, and change global discount settings.

## Main Files

- `index.html` and `app.js`: customer application.
- `crm.html` and `crm.js`: CRM application.
- `data.js`: shared browser API wrapper and in-memory cache.
- `server.ps1`: local static server and JSON API backend.
- `data/stones.json`, `data/orders.json`, `data/settings.json`: persisted seed data.

## Runtime Model

- The browser apps run as static pages with ES modules.
- Data is fetched through `/api/*` endpoints when available.
- The local server also serves static assets from the repository root.
- The customer app stores design state in `localStorage` for refresh recovery.

