# Prioritized Roadmap

## P0

- Add real authentication and authorization for CRM actions.
- Move sensitive CRM operations behind server-side permission checks.
- Replace hardcoded CRM credentials with a secure auth flow.
- Add server-side validation for all order, catalog, and settings payloads.

## P1

- Replace the PowerShell JSON server with a maintainable backend service.
- Introduce a real package manifest and reproducible dev scripts.
- Remove duplicated pricing and order-formatting logic across client and CRM.
- Consolidate deployment documentation so it matches the actual runtime.

## P2

- Split `app.js` and `crm.js` into smaller modules.
- Add automated tests for pricing, order creation, and status transitions.
- Replace polling sync with a more efficient update mechanism.
- Add schema validation for stones, orders, and settings files.

## P3

- Improve mobile UX for the customer landing and designer flow.
- Reduce the cost of canvas export generation.
- Remove sandbox-only controls from the primary production paths.
- Add a clear admin audit trail for catalog and order changes.

## Nice To Have

- Add role-based CRM views.
- Add better error recovery for LIFF failures.
- Add import/export tools for catalog and order data.
- Add monitoring or logging for API write failures.

