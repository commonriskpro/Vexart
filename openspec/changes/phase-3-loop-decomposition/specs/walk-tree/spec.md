# Delta for walk-tree

## ADDED Requirements

### Requirement: walk-tree module extraction

The system MUST extract the `walkTree` function (loop.ts L1081–1428) into `loop/walk-tree.ts` as a standalone importable function. The function MUST accept `(root: TGENode, layoutCtx: VexartLayoutCtx, state: WalkTreeState)` and return `WalkResult`.

#### Scenario: Walk produces layout commands and node lists

- GIVEN a TGENode tree with box, text, img, and canvas nodes
- WHEN `walkTree(root, layoutCtx, state)` is called
- THEN `WalkResult.rectNodes`, `WalkResult.textNodes`, `WalkResult.boxNodes` are populated in tree-walk order
- AND `WalkResult.renderGraphQueues.effects` contains effects for nodes with shadow/glow/gradient/backdrop
- AND `WalkResult.renderGraphQueues.images` contains queued image decodes
- AND `WalkResult.renderGraphQueues.canvases` contains queued canvas draws
- AND `WalkResult.textMetaMap` maps text content to `TextMeta`

#### Scenario: Walk populates node path and ref maps

- GIVEN a tree with nested children
- WHEN walk completes
- THEN `WalkResult.nodePathById` maps each node id to its path string (e.g. `"r.0.1.2"`)
- AND `WalkResult.nodeRefById` maps each node id to the TGENode reference

#### Scenario: Walk resets and reuses mutable state

- GIVEN `WalkTreeState` is carried across frames
- WHEN a new walk begins
- THEN rectNodes, textNodes, boxNodes, effectsQueue, imageQueue, canvasQueue are reset to empty
- AND textMetaMap is cleared
- AND textMeasureIndex is reset to 0
- AND scrollIdCounter is reset to 0

### Requirement: WalkTreeState typed state bag

The system MUST define `WalkTreeState` as a typed object carrying mutable walk accumulators: `rectNodes`, `textNodes`, `boxNodes`, `rectNodeById`, `nodePathById`, `nodeRefById`, `textMetaMap`, `renderGraphQueues`, `textMeasureIndex`, `scrollIdCounter`, `scrollSpeedCap`. The coordinator MUST own and pass this state; walk-tree.ts MUST NOT import from loop/index.ts.

#### Scenario: WalkTreeState is created by coordinator

- GIVEN the render loop is initialized
- WHEN `createWalkTreeState()` is called
- THEN a fresh state object is returned with empty arrays/maps and zero counters

#### Scenario: WalkTreeState has no circular dependencies

- GIVEN `walk-tree.ts` is imported in isolation
- WHEN a bundler traces its dependency graph
- THEN it does not reach `loop/index.ts`

### Requirement: Viewport culling in walk-tree

The system MUST implement AABB-based bottom-up subtree culling during `walkTree`. Nodes whose bounding box is fully outside the terminal viewport MUST be skipped (no layout commands, no interactive node collection). Scroll containers MUST NEVER be culled regardless of position.

#### Scenario: Off-screen subtree is skipped

- GIVEN a 1000-node tree where only 100 nodes are within the viewport
- WHEN `walkTree` executes with viewport culling enabled
- THEN `WalkResult.culledCount` reports ≥900 nodes skipped
- AND no layout commands are emitted for culled subtrees
- AND benchmark confirms ≥40% wall-time reduction vs unculled walk

#### Scenario: Scroll container is never culled

- GIVEN a scroll container node is partially outside the viewport
- WHEN viewport culling evaluates it
- THEN the scroll container and its children are NOT culled
- AND layout commands are emitted for the scroll container

#### Scenario: Partially visible node is not culled

- GIVEN a node's AABB partially overlaps the viewport
- WHEN culling evaluates it
- THEN the node and its full subtree are walked (not culled)

#### Scenario: debugDumpCulledNodes exposes culled node ids

- GIVEN viewport culling is active and nodes were culled
- WHEN `debugDumpCulledNodes()` is called
- THEN it returns an array of culled node ids for introspection

### Requirement: Viewport culling is toggleable

Viewport culling MUST be enabled by default but disableable via an experimental flag. When disabled, walk behaves identically to the pre-extraction loop.ts.

#### Scenario: Culling disabled via flag

- GIVEN `experimental.viewportCulling` is set to `false`
- WHEN `walkTree` executes
- THEN no nodes are culled regardless of position
- AND `culledCount` is 0

## Test Fixtures

- **fixture:walk-basic.json** — 20-node tree with mixed box/text/img nodes → expected WalkResult
- **fixture:walk-scroll.json** — Tree with nested scroll containers → scroll nodes preserved, not culled
- **fixture:walk-culling-1000.json** — Synthetic 1000-node tree, 100 visible → culledCount ≥ 900
- **fixture:walk-effects.json** — Nodes with shadow, glow, gradient, backdrop → effectsQueue populated
- **bench:walk-culling.ts** — Benchmark: 1000-node/100-visible walk with/without culling
