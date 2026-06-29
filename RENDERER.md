# Renderer Architecture

## Purpose

This document defines the internal bracelet rendering architecture used by the customer app in `app.js`.

Accepted renderer rules are recorded in `DECISIONS.md`. This document describes how those accepted decisions apply to the rendering pipeline.

Phase 3.1 is a bead-parity refactor only:

- No visible UI behavior changes.
- No pricing changes.
- No charm-on-bracelet rendering yet.
- No CRM changes.

The goal is to prepare the renderer for future bracelet components without redesigning the current customer experience.

## Current Renderer

The current renderer is driven from Step 3 of the customer flow.

Current entry point:

- `renderStep3()`

Current live preview surface:

- `renderBraceletCanvas()`
- Target: `#braceletSvg`

Current export surface:

- `generateImageExports()`

Current design state:

- `State.selectedStones`

Today, the bracelet is still stored as a bead list. Phase 3.1 does not change that external behavior. Instead, it introduces an internal renderer pipeline that converts the bead list into generic renderer objects.

## Rendering Pipeline

Phase 3.1 introduces this internal pipeline:

BraceletConfig
↓
BraceletComponentList
↓
ResolvedLayout
↓
Renderer

This pipeline is internal to `app.js` and preserves the current visual output.

This pipeline follows the accepted decisions that:

- accessory customization belongs to Step 3
- `BraceletComponentList` is the canonical rendering pipeline
- `ResolvedLayout` is the single source of geometric truth
- render surfaces must not resolve layout independently
- business state and rendering state remain separated

## BraceletConfig

`BraceletConfig` is the normalized render input for the current bracelet state.

Responsibilities:

- Store wrist-size-derived bracelet length.
- Store bead-size mode.
- Store the current mixed-mode placing size.
- Store active slot / preview interaction state.
- Store surface constants used by the SVG layout.

Typical fields:

- `wristSizeCm`
- `toleranceCm`
- `braceletLengthMm`
- `beadSizeMode`
- `placingSizeMm`
- `activeSlotIndex`
- `newlyAddedIds`
- `svg.centerX`
- `svg.centerY`
- `svg.radiusPx`

`BraceletConfig` contains no DOM and no rendered nodes.

`BraceletConfig` is derived from business state but is not itself the business state.

## BraceletComponentList

`BraceletComponentList` is the generic internal component list used by the renderer.

In Phase 3.1:

- Every existing selected bead becomes a component of type `stone`.
- Charm is not included in bracelet rendering yet.

Current stone component shape:

- `id`
- `type`
- `sourceIndex`
- `stoneId`
- `sizeMm`
- `uniqueId`

This replaces direct bead-only assumptions inside the SVG layout code while keeping the external source state unchanged.

This matches the accepted rule that every bracelet item must become a generic component before rendering.

## ResolvedLayout

`ResolvedLayout` is the canonical geometry object produced by the layout stage.

Responsibilities:

- Convert component sizes into loop geometry.
- Resolve placed component nodes.
- Resolve placeholder nodes.
- Precompute positions, angles, and radii for rendering.

Typical fields:

- `braceletConfig`
- `braceletComponentList`
- `summary`
- `nodes`

`summary` contains:

- `placedCount`
- `sumPlacedDiameter`
- `spaceLeft`
- `numPlaceholders`
- `totalItems`
- `totalVirtualDiameter`
- `loopCircumferenceMm`
- `scaleMmToPx`

Each resolved node contains the geometry needed by the renderer, for example:

- `index`
- `kind`
- `sizeMm`
- `itemAngleWidth`
- `centerAngle`
- `centerX`
- `centerY`
- `radiusPx`
- `isPlaced`
- `isFirstPlaceholder`

Placed stone nodes also include:

- `component`
- `sourceIndex`
- `uniqueClipId`
- `isNewlyAdded`
- `isActiveSlot`

The renderer should consume `ResolvedLayout` instead of recalculating these values repeatedly.

This matches the accepted rule that `ResolvedLayout` is the single geometric source used by render surfaces.

## Layout Engine Responsibilities

The layout engine is the code that builds `ResolvedLayout` from `BraceletConfig` and `BraceletComponentList`.

Responsibilities in Phase 3.1:

- Preserve the current circular bead layout.
- Preserve the current placeholder-count logic.
- Preserve the current start angle and ordering.
- Preserve the current bead radius scaling behavior.
- Preserve the current “first placeholder is active target” behavior.

The layout engine does not:

- create DOM nodes
- apply styling
- modify pricing
- change business rules

## Rendering Responsibilities

The renderer consumes `ResolvedLayout` and emits the current Step 3 SVG preview.

Responsibilities:

- clear and rebuild the preview SVG
- draw the background ring
- draw placed bead nodes
- draw placeholder nodes
- preserve existing clip paths, sheen, borders, and active states
- preserve current click interactions

The renderer should not own business calculations that belong in configuration or layout resolution.

## Render Surface Adapters

Phase 3.1 formalizes the rendering surfaces conceptually, even though all code still lives in `app.js`.

Current surfaces:

- Step 3 SVG preview
- Hero shot canvas export
- Future receipt/export surfaces

Recommended model:

- Each surface should consume the same canonical geometry model where practical.
- Step 3 SVG is the first surface migrated to `ResolvedLayout` in Phase 3.1.
- Hero shot remains behaviorally unchanged in Phase 3.1.

Long-term rule:

- no render surface should calculate bracelet layout independently

## Future Component Support

This architecture is intended to support future bracelet components without major renderer redesign.

Future component types:

- `stone`
- `charm`
- `spacer`
- `separator`
- `pendant`
- future premium accessories

Phase 3.1 does not render these new types yet. It only prepares the pipeline so later phases can add them safely.

## Planned Extension Path

Future phases can extend this pipeline by:

- expanding `BraceletComponentList` beyond stones
- extending `ResolvedLayout.nodes` with component-type-specific geometry
- adding layout policies for anchored or non-inline components
- reusing shared geometry across preview and export surfaces

The key rule is:

- new component support should extend the pipeline, not bypass it with special-case rendering branches

## Phase 3.1 Summary

Phase 3.1 introduces the internal renderer architecture without changing visible behavior.

Delivered concepts:

- `BraceletConfig`
- `BraceletComponentList`
- `ResolvedLayout`
- renderer consumption of canonical SVG layout data

Not included in Phase 3.1:

- charm rendering on the bracelet
- spacer rendering
- separator rendering
- pendant rendering
- pricing changes
- export redesign
