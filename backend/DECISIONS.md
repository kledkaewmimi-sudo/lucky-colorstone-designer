# Architecture Decisions

This document records accepted architecture decisions for the bracelet rendering system.

## Decision 001

Title:

- Accessory customization belongs to Step 3.

Reason:

- Step 3 is the bracelet composition stage.
- Step 1 defines wrist size.
- Step 2 defines bracelet specification.
- Step 4 summarizes the final design.

Status:

- Accepted

Implication:

- Accessory selection such as charms, spacers, separators, pendants, and future bracelet add-ons belongs to the Step 3 customization layer, not the bracelet specification layer.

## Decision 002

Title:

- `ResolvedLayout` is the single source of geometric truth.

Reason:

- All render surfaces must consume the same geometry.
- No surface may calculate bracelet layout independently.

Status:

- Accepted

Implication:

- SVG preview, hero shot, export, and receipt rendering must all consume geometry derived from `ResolvedLayout`.

## Decision 003

Title:

- `BraceletComponentList` is the canonical rendering pipeline.

Reason:

- Every bracelet item must be represented as a generic component before rendering.
- The renderer should not branch on business concepts such as "if charm" or "if spacer".

Status:

- Accepted

Implication:

- Renderer inputs are normalized into generic components before any layout or surface-specific rendering occurs.

## Decision 004

Title:

- Rendering surfaces must never compute layout independently.

Reason:

- SVG Preview, Hero Shot, Export, and Receipt must all consume the same resolved geometry.
- Duplicate geometry calculations are not allowed.

Status:

- Accepted

Implication:

- Layout resolution belongs to the shared layout stage, not to individual render surfaces.

## Decision 005

Title:

- Business state and rendering state must remain separated.

Reason:

- Business objects describe customer intent.
- Rendering objects describe visual geometry.
- Rendering objects must always be derived from business state.

Status:

- Accepted

Implication:

- Customer selections, pricing state, and order state remain domain inputs.
- `BraceletComponentList` and `ResolvedLayout` remain derived rendering artifacts.
