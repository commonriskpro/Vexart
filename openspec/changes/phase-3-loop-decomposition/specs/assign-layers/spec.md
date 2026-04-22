# Delta for assign-layers

## ADDED Requirements

### Requirement: Assign-layers module extraction

The system MUST extract `assignLayersSpatial`, `findLayerBoundaries`, `LayerBoundary`, `LayerSlot`, `PreparedLayerSlot`, and helpers (loop.ts L1430–1873) into `loop/assign-layers.ts` as a standalone module with the signature `assignLayers(commands, boundaries, root): LayerAssignment`.

#### Scenario: No explicit layers → all commands in background slot

- GIVEN a tree with no `layer` prop on any node
- WHEN `assignLayersSpatial` runs
- THEN `bgSlot.cmdIndices` contains all command indices
- AND `contentSlots` is empty

#### Scenario: Scroll container gets scissor-based assignment

- GIVEN a node with `scrollY={true}` and `layer={true}`
- WHEN `assignLayersSpatial` runs
- THEN the scroll layer's commands are identified via SCISSOR_START/END pair matching
- AND inner (higher-z) nested scroll layers claim their commands before outer layers

#### Scenario: Static layer with backgroundColor uses color matching

- GIVEN a layer node with `backgroundColor={0xff0000ff}` and `layer={true}`
- WHEN `assignLayersSpatial` runs
- THEN the matching RECT command is found by RGBA color comparison
- AND the layer's bounds are derived from that RECT's position

#### Scenario: Floating layer uses layout bounds

- GIVEN a layer node with `floating="parent"` and `layer={true}`
- WHEN `assignLayersSpatial` runs
- THEN the layer bounds come from `node.layout` dimensions
- AND color matching is not used (avoids cross-wiring between panels with same surface tokens)

#### Scenario: willChange promotes to own layer

- GIVEN a node with `willChange="transform"` and no `layer` prop
- WHEN `findLayerBoundaries` runs
- THEN a layer boundary is created for that node
- AND invalid `willChange` values are silently ignored with a debug-mode warning

### Requirement: Assign-layers has no loop.ts dependency

The module MUST NOT import from `loop/index.ts`. It MAY import types from `ffi/`, `reconciler/`, and shared type files.

#### Scenario: Standalone import

- GIVEN `assign-layers.ts` is imported in isolation
- WHEN its dependency graph is traced
- THEN `loop/index.ts` is not reachable

## Test Fixtures

- **fixture:assign-no-layers.json** — Simple tree, no layers → bg-only assignment
- **fixture:assign-scroll-layer.json** — Scroll container with layer → scissor pair command assignment
- **fixture:assign-floating-layer.json** — Floating panel → layout-based bounds
- **fixture:assign-nested-scroll.json** — Nested scroll containers → innermost claims first
- **fixture:assign-willchange.json** — willChange promotion → layer boundary created
