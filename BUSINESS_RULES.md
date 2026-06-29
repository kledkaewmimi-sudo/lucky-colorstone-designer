# Project Purpose

Lucky Colorstone Designer is a two-part bracelet ordering system.

- The customer app lets a shopper design a custom gemstone bracelet in LINE.
- The CRM lets operators receive, review, and manage submitted orders.
- Shared catalog, order, and settings data are stored through the local JSON-backed API layer.

# Customer Flow

Landing Page

↓

LINE Login (LIFF)

↓

Step 1 - Wrist Size

↓

Step 2 - Bracelet Design

↓

Step 3 - Review Design

↓

Step 4 - Summary & Order

↓

LINE Order

↓

CRM

The current implementation also supports a landing-screen dismissal state and a LIFF fallback path for non-LINE testing or desktop use.

# Bracelet Rules

- Wrist size is selected from the predefined grid in the customer flow.
- The selected wrist size is stored in centimeters.
- Bracelet length is calculated as wrist size plus a fixed tolerance of `1.5 cm`.
- Bead size can be `4`, `6`, `8`, or `mixed`.
- For uniform bead sizes, capacity is calculated from bracelet length in millimeters divided by the bead size.
- For `mixed`, the bracelet uses dynamic bead sizing and the app allows beads of different sizes in the same bracelet.
- Gemstone selection is done by adding stones from the catalog into the bracelet design.
- The bracelet preview is generated from the selected stones and their sizes, and the visual loop is scaled to the current design.
- The preview and export images reflect the actual selected stones, order, and sizing state.

# Pricing Rules

The current implementation uses the stone catalog price for each selected bead size.

- Subtotal is the sum of every selected bead price.
- Each bead price is resolved from the stone catalog by size.
- The customer app currently applies a hardcoded `20%` LINE special discount.
- Discount amount is calculated as `Math.round(subtotal * 0.2)`.
- Final price is calculated as `subtotal - discount`.

This document does not define or change the pricing formula beyond what is already implemented.

# CRM Rules

- The customer order is synced to CRM when the customer submits the LINE order from Step 4.
- The customer app writes the order through the shared API using `addSharedOrder(...)`.
- The CRM receives the order data through the shared orders source and refreshes its view through polling and sync events.
- The order payload includes customer name, wrist size, bead size, bead list, subtotal, discount percentage, discount amount, net price, and configuration code.
- The customer flow remains the source of order creation.
- The CRM is for review and management only.

Do not modify CRM logic.

# LIFF Rules

- LIFF initialization runs during customer app startup.
- If LIFF is available, the app attempts to initialize with the configured LIFF ID.
- If the user is already logged in, the app reads the LINE profile and uses the display name when available.
- Clicking the landing login button starts the login flow.
- After login-related redirects, OAuth query parameters are cleared from the URL.
- Session persistence is maintained through browser storage so the customer can recover their design state after refresh.
- The landing dismissal state is also preserved so the app can reopen consistently after navigation or reload.

# State Rules

Important customer-flow state values used by the current implementation:

- `currentStep`
- `wristSize`
- `beadSize`
- `mixedPlacingSize`
- `ownerName`
- `liffInitialized`
- `landingDismissed`
- `selectedStones`
- `activeCategory`
- `activeSlotIndex`
- `uniqueCounter`
- `newlyAddedIds`

These states control navigation, bracelet sizing, bead placement, preview behavior, export output, and persisted recovery.

# Important Constraints

The following business rules must not change unless explicitly requested:

- The customer flow sequence from landing to LINE order.
- The wrist-size-to-length relationship.
- The supported bead sizes: `4`, `6`, `8`, and `mixed`.
- The current bead-capacity behavior for uniform sizes.
- The pricing pipeline: stone price lookup, subtotal, `20%` discount, final total.
- The order payload fields sent to CRM.
- The LIFF initialization, login, redirect, and session behavior.
- The shared-data sync model between customer app and CRM.
- The CRM role as the receiver and manager of submitted orders.
- The persisted customer design state and landing dismissal state.
- The current bracelet preview and export generation behavior.

## Summary

This document records the current Lucky Colorstone Designer business rules as implemented today: a mobile LINE bracelet designer with wrist-based sizing, bead selection, hardcoded 20% LINE discounting, LIFF-based customer login, and shared-order sync into the CRM. No application code was changed.
