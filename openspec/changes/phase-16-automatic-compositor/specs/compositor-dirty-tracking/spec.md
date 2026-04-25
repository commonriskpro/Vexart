# Compositor Dirty-Tracking Specification

**Ref**: PRD v0.7 §7.3 (DEC-013), DEC-014 (TS ownership of scene graph + render graph).

## Purpose

Per-layer generation counters and node-to-layer mapping so `setProperty` marks only the owning layer dirty — not the entire tree. Extends `performance-dirty-region` scoped invalidation to per-layer content granularity.

## Requirements

### REQ-DT-001: Per-layer generation counter

Each composited layer SHALL track a monotonically increasing generation counter. The counter SHALL increment when any `setProperty` fires on a node within that layer's subtree.

#### Scenario: Hover mutation increments layer generation

- GIVEN a composited layer contains a `<box hoverStyle={{ backgroundColor: 0xff0000ff }}>` child
- WHEN pointer enters the box and `setProperty` updates `backgroundColor`
- THEN the layer's generation counter increments by exactly 1

#### Scenario: No mutation — generation stable

- GIVEN a composited layer with no property changes
- WHEN a frame is processed
- THEN the layer's generation counter remains unchanged from the previous frame

### REQ-DT-002: Node-to-layer mapping

Every TGENode SHALL carry a `_layerKey` field that maps it to its owning composited layer. Nodes not in any layer SHALL have `_layerKey = null`.

#### Scenario: Child node inherits parent layer

- GIVEN a composited layer root at node ID 42
- AND node ID 42 has a child node ID 43
- WHEN `walkTree` processes the subtree
- THEN `node[43]._layerKey === 42` (maps to owning layer root)

#### Scenario: Uncomposited node has null layer key

- GIVEN a node that is not in any composited layer
- WHEN `walkTree` processes it
- THEN `node._layerKey === null`

### REQ-DT-003: Targeted dirty propagation

When `setProperty` fires on a node, ONLY the layer containing that node SHALL be marked dirty. Sibling layers and ancestor layers not containing the node SHALL remain clean.

#### Scenario: Editor layer change leaves sidebar clean

- GIVEN a scene with 2 layers: editor (layer A) and sidebar (layer B)
- WHEN a keystroke calls `setProperty` on a text node in layer A
- THEN layer A is marked dirty
- AND layer B's dirty flag remains `false`

#### Scenario: Uncomposited node marks all dirty

- GIVEN a `setProperty` fires on a node with `_layerKey === null`
- WHEN the frame is processed
- THEN all layers are marked dirty (conservative fallback, per `performance-dirty-region` spec)

### REQ-DT-004: Clean-layer detection

When a layer's generation counter matches its value from the previous frame, the layer SHALL be marked clean and SHALL skip repaint and readback.

#### Scenario: Static layer skipped for 60 consecutive frames

- GIVEN a sidebar layer has had the same generation counter for 60 frames
- WHEN each frame is processed
- THEN the layer is marked clean and paint + readback are skipped every frame

### REQ-DT-005: Move-only path

When only a layer's position or z-order changes (not content), the layer SHALL use the MOVE-ONLY path: skip repaint, skip readback, update only the placement/composite metadata.

#### Scenario: Floating panel repositioned

- GIVEN a composited floating panel layer at position (100, 200)
- AND its content has not changed (generation counter stable)
- WHEN a sibling resize pushes the panel to position (150, 200)
- THEN the layer uses MOVE-ONLY path (no repaint, no readback)
- AND the panel renders at the new position

#### Scenario: Content + position change — full repaint

- GIVEN a composited layer whose content AND position both changed
- WHEN the frame is processed
- THEN the layer is marked dirty and fully repainted (MOVE-ONLY path NOT used)
