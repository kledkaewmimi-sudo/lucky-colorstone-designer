# Landing Page

## Purpose

Provide the entry point for the customer flow before bracelet design begins.

## Responsibilities

- Show the initial brand/marketing screen.
- Gate entry into the designer flow.
- Trigger the LIFF login flow when the customer continues.
- Hide or reveal the main app shell based on the current landing state.

## Files involved

- `index.html`
- `app.js`

# Step 1

## Purpose

Collect the customer wrist size and optional owner name.

## Responsibilities

- Render the predefined wrist-size choices.
- Capture the bracelet owner name.
- Store the selected wrist size in application state.
- Update the displayed wrist-size context and measurement text.
- Recompute bracelet length estimation when the size changes.

## Main UI

- Wrist size grid
- Owner name input
- Wrist-size display text

## Main functions

- `initWristSizeGrid()`
- `renderStep1()`
- `syncWristSizeDisplay()`
- `updateEstimationText()`

## Files

- `index.html`
- `app.js`

# Step 2

## Purpose

Let the customer choose bracelet components used for the bracelet design.

## Responsibilities

- Render bead-size options.
- Support `4`, `6`, `8`, and `mixed`.
- Update the active bead-size state.
- Adjust selected beads when the bead size changes.
- Update bracelet capacity and estimation text.
- Render charm selection from the shared charm catalog.
- Support a single selected charm with `No Charm` as the default.
- Show disabled `Coming Soon` cards for spacer color and separator.

## Files

- `index.html`
- `app.js`

# Step 3

## Purpose

Provide the bracelet design workspace where stones are added and arranged.

## Responsibilities

- Show the stone catalog.
- Filter catalog items by category.
- Add stones to the bracelet.
- Remove or fill bracelet slots.
- Keep the bracelet within the current capacity rules.
- Render the bracelet preview.
- Update the running bead count, remaining space, and preview state.

## Files

- `index.html`
- `app.js`
- `data.js`

# Step 4

## Purpose

Present the final summary, billing, export images, and order submission flow.

## Responsibilities

- Summarize the selected wrist size, bead size, and beads.
- Generate the billing breakdown.
- Generate bracelet preview and receipt exports.
- Build the LINE order message.
- Submit the order to the shared order store.

## Summary generation

- `renderStep4()`

## Bracelet preview

- `generateImageExports()`

## Billing

- `renderStep4()`
- `getStonePriceForSize(...)` from `data.js`

## LINE Order

- `handleLineOrder()`
- `fallbackLineOrder()`
- `submitOrderToCRM()`

## Files

- `index.html`
- `app.js`
- `data.js`

# Charm Catalog

## Purpose

Provide shared charm metadata for future customer and CRM surfaces without changing current bracelet UI behavior.

## Responsibilities

- Store charm records in a shared catalog structure in `data.js`.
- Keep charm metadata available as data only during Phase 1.
- Support existing Pi Xiu and Takrud assets with stable IDs and SKUs.
- Reserve placeholder records for future charms when needed, without requiring current UI changes.

## Charm fields

- `id`
- `sku`
- `nameTh`
- `nameEn`
- `type`
- `collection`
- `image`
- `sizeCm`
- `price`
- `meaningTh`
- `meaningEn`
- `inStock`

## Files

- `data.js`
- `app.js` for the backward-compatible `selectedCharmId` state default

# Bracelet Renderer

The bracelet renderer is implemented inside `app.js`.

## SVG generation

- The designer canvas is rendered as SVG in the customer flow.
- Beads are drawn into the bracelet visualization using the current bracelet state.
- The renderer uses the selected stones, stone images, bead sizes, and current wrist sizing.

## Preview generation

- The app generates preview images for the final bracelet summary.
- It also generates download-ready hero and receipt images.
- The rendered previews reflect the selected stones and the calculated bracelet geometry.

# LIFF Module

The LIFF behavior is implemented in the customer app and uses the LIFF SDK loaded in `index.html`.

Responsibilities:

- Initialize LIFF when the customer app loads.
- Detect whether the customer is already logged in.
- Read the LINE profile display name when available.
- Start the login flow from the landing page.
- Handle redirect cleanup after LIFF/OAuth parameters return to the app.
- Support fallback behavior when LIFF is unavailable outside the LINE client.

# CRM Module

The CRM module is implemented in `crm.js` with the dashboard UI in `crm.html`.

Responsibilities:

- Handle CRM login and session state.
- Render overview, inventory, orders, and settings tabs.
- Read shared catalog, settings, and orders data.
- Manage stone inventory CRUD.
- Update order status.
- Seed demo orders.
- Render invoice/export views for orders.

# Pricing Module

Pricing is shared between the customer app and CRM through `data.js` and the customer summary/order logic in `app.js`.

Responsibilities:

- Resolve stone price by bead size.
- Calculate subtotal from selected stones.
- Apply the LINE discount used by the customer flow.
- Produce the final net price.
- Keep CRM and customer pricing views aligned with the same order data.

# State Management

Application state is stored in a few places:

- `app.js` keeps the customer flow state in the in-memory `State` object.
- `app.js` persists customer design state to `localStorage`.
- `app.js` stores landing-dismissed state in `sessionStorage`.
- `data.js` keeps shared catalog, settings, and orders in in-memory caches after fetching from the API.
- `crm.js` keeps CRM UI/session state in the in-memory `CRMState` object.
- The JSON API files are the source of truth for shared data.

# Data Flow

Data moves through the app in this order:

- The customer app loads catalog data through `data.js`.
- The customer designs a bracelet in `app.js`.
- `app.js` calculates pricing and builds the order payload.
- The order is saved through `addSharedOrder(...)` in `data.js`.
- The CRM reads the same shared order data through `data.js`.
- CRM updates to catalog, settings, or order status are written back through `data.js`.
- Both apps refresh from the shared API layer so the views stay in sync.

# File Responsibilities

- `index.html`: customer and CRM page structure, step layout, and static UI markup.
- `app.js`: customer flow state, step rendering, bracelet design logic, preview generation, LIFF handling, and order submission.
- `crm.html`: CRM dashboard markup, login form, tabs, modals, and invoice layout.
- `crm.js`: CRM authentication, dashboard logic, inventory CRUD, order management, and sandbox tooling.
- `data.js`: shared API access, shared catalog/settings/orders helpers, price lookup helper, and charm catalog data.
- `server.ps1`: local JSON-backed backend and static file server.
- `data/stones.json`, `data/orders.json`, `data/settings.json`: persisted shared data files.

# Component Dependency Summary

Landing Page starts the customer flow, Step 1 and Step 2 capture bracelet constraints, Step 3 performs bracelet assembly and preview rendering, and Step 4 finalizes billing and order submission. `app.js` depends on `data.js` for shared catalog and order access, while the CRM depends on the same shared data layer to observe and manage submitted orders.
