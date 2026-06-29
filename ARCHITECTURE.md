# System Architecture

## High-Level Layout

The repository contains three runtime layers:

1. Static browser frontend for customers.
2. Static browser frontend for CRM operators.
3. Local JSON-backed server/API layer.

Both frontends are intentionally thin and rely on `data.js` for all shared data access.

## Customer Application

The customer app is a multi-step designer:

1. Select wrist size and optional owner name.
2. Select bead size.
3. Design the bracelet by adding stones.
4. Review summary, render export images, and submit the order.

`app.js` owns the full UI state machine, rendering, bracelet visualization, pricing, LIFF integration, and order submission.

## CRM Application

The CRM is a separate single-page dashboard:

1. Login gate.
2. Overview metrics.
3. Inventory CRUD.
4. Order management.
5. Global settings and sandbox actions.

`crm.js` handles authentication state, dashboard routing, CRUD actions, order status changes, invoice export, and demo order seeding.

## Shared Data Layer

`data.js` exposes a small browser-side API:

- `refreshCatalog()`
- `getSharedCatalog()`
- `saveSharedCatalog()`
- `deleteSharedCatalog()`
- `getSharedSettings()`
- `saveSharedSettings()`
- `getSharedOrders()`
- `addSharedOrder()`
- `updateOrderStatus()`

It also hosts shared static catalog constants, including the charm catalog data model added in Phase 1.

This layer first attempts `/api/*` and falls back to bundled JSON for stones.

## Server Layer

`server.ps1` is the only backend implementation in the repo.

- Serves static files from the repo root.
- Seeds `data/*.json` if files are missing or reset.
- Implements `/api/stones`, `/api/orders`, `/api/settings`, and `/api/reset`.
- Writes updates directly to JSON files.

## Deployment Shape

The project is designed to work in three ways:

- Local development via `server.ps1` on `http://localhost:8000/`.
- Vercel static hosting with API rewrites.
- Netlify static hosting with `_redirects` proxying API traffic to Render.

## Important Characteristics

- No database engine is used.
- No server-side authentication exists.
- Sync is polling-based and event-based, not push-based.
- Business rules are duplicated in client and CRM code.
- Shared product catalogs can exist as static data models before they are connected to UI.
